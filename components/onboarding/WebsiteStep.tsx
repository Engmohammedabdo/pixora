'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandKitForm } from '@/components/brand-kit/BrandKitForm';
import { useCreateBrandKit, BrandKitError } from '@/hooks/useBrandKit';
import { brandKitErrorMessageKey } from '@/lib/brand-kits/errors';
import { normalizeWebsiteUrl, WEBSITE_URL_MAX_LENGTH } from '@/lib/brand-kits/website-url';
import { BRAND_EXTRACT_ERROR_CODES, BRAND_EXTRACT_ERROR_MESSAGE_KEYS, type BrandExtractErrorCode } from '@/lib/brand-kits/extract-errors';
import { parseExtractDraft, expandMissingFields, type ExtractDraft } from '@/lib/brand-kits/extract-draft';
import type { BrandKit } from '@/lib/supabase/types';
import { Globe, Sparkles, Loader2, AlertTriangle } from 'lucide-react';

interface WebsiteStepProps {
  /** Called once this step is "done" — a brand kit was saved, or the
   *  customer chose not to save one. Either way the onboarding flow advances
   *  to the next tour card; this component never decides what "next" is. */
  onAdvance: () => void;
}

type Phase = 'intro' | 'extracting' | 'draft';

function isBrandExtractErrorCode(value: unknown): value is BrandExtractErrorCode {
  return typeof value === 'string' && (BRAND_EXTRACT_ERROR_CODES as readonly string[]).includes(value);
}

export function WebsiteStep({ onAdvance }: WebsiteStepProps): React.ReactElement {
  const t = useTranslations('onboarding');
  const tBrandKit = useTranslations('brandKit');
  const { createBrandKit, loading: saving } = useCreateBrandKit();

  const [phase, setPhase] = useState<Phase>('intro');
  const [url, setUrl] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [draft, setDraft] = useState<ExtractDraft | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [extractErrorCode, setExtractErrorCode] = useState<BrandExtractErrorCode | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = (): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Cancel any in-flight request and timer if the customer navigates off this
  // step (Previous, a step dot, or the global Skip) before it resolves —
  // otherwise a late response calls setState on an unmounted component.
  useEffect(() => () => {
    abortRef.current?.abort();
    stopTimer();
  }, []);

  const resetToEmptyDraft = (): void => {
    setDraft(null);
    setMissingFields([]);
    setExtractErrorCode(null);
    setPhase('draft');
  };

  // Reachable from the intro screen with no URL required at all — this is the
  // "customer skipped" arm, and it must land on the exact same editable form
  // the other two arms use, per this step's load-bearing requirement.
  const handleFillManually = (): void => {
    resetToEmptyDraft();
  };

  // Reachable mid-extraction. Aborts the request (so a late response cannot
  // overwrite what the customer decided) and lands on the same empty,
  // editable form — the request in flight is never a reason Skip stops
  // working in one click.
  const handleCancelExtraction = (): void => {
    abortRef.current?.abort();
    stopTimer();
    resetToEmptyDraft();
  };

  const handleExtract = async (): Promise<void> => {
    const trimmed = url.trim();
    if (trimmed.length < 4) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setExtractErrorCode(null);
    setElapsedSeconds(0);
    setPhase('extracting');
    // No client-side deadline shorter than the route's own 90s — a fake early
    // timeout would fail honest 25-60s crawls. The only way out of this phase
    // besides the response landing is the customer's own Skip.
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);

    try {
      const res = await fetch('/api/brand-kits/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal,
      });
      const json = (await res.json()) as
        | { success: true; data: { draft: unknown; missing: unknown } }
        | { success: false; error?: string };

      // The customer already left this phase (Skip mid-flight); their choice
      // wins over whatever the response says.
      if (controller.signal.aborted) return;

      if (json.success) {
        const parsed = parseExtractDraft(json.data.draft);
        setDraft(parsed);
        setMissingFields(expandMissingFields(json.data.missing, parsed));
        setExtractErrorCode(null);
      } else {
        setDraft(null);
        setMissingFields([]);
        setExtractErrorCode(isBrandExtractErrorCode(json.error) ? json.error : 'extract_failed');
      }
      setPhase('draft');
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('[onboarding] brand-kit extraction request threw:', err);
      setDraft(null);
      setMissingFields([]);
      setExtractErrorCode('extract_failed');
      setPhase('draft');
    } finally {
      stopTimer();
      // Only clear the ref if it still points at THIS request — guards
      // against a later request's controller being clobbered if this one's
      // cleanup runs after a newer extraction has already started.
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleSave = async (data: Partial<BrandKit>): Promise<void> => {
    try {
      await createBrandKit(data);
      toast.success(tBrandKit('created'));
      onAdvance();
    } catch (error) {
      // Same mapping app/[locale]/(dashboard)/brand-kit/page.tsx uses for the
      // exact same endpoint — lib/brand-kits/errors.ts is the shared source so
      // the two callers cannot silently disagree on what a code means.
      const code = error instanceof BrandKitError ? error.code : 'request_failed';
      if (code === 'brand_kit_limit_reached') {
        const limit = error instanceof BrandKitError ? error.limit : undefined;
        toast.error(tBrandKit('limitReached', { limit: limit ?? '' }));
        return;
      }
      // `fields` is what makes a 400 `validation_error` say WHICH field — the
      // route returns Zod's issues as `details` and the hook lifts their path
      // heads out. Without it every schema refusal collapsed to "try again",
      // and retrying an unchanged value cannot ever work.
      const fields = error instanceof BrandKitError ? error.fields : [];
      toast.error(tBrandKit(brandKitErrorMessageKey(code, fields)));
      // Deliberately does NOT call onAdvance(): a failed save must leave the
      // customer on the same usable, editable form — "continue without
      // saving" below is still one click away regardless.
    }
  };

  if (phase === 'intro') {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center bg-primary-50 dark:bg-primary-900/30">
            <Globe className="h-8 w-8 text-primary-500" />
          </div>
          <h2 className="text-2xl font-bold font-cairo">{t('websiteStepTitle')}</h2>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto leading-relaxed">
            {t('websiteStepDescription')}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onboarding-website-url">{tBrandKit('websiteUrl')}</Label>
          {/* `dir="ltr"` because this is a Latin-only value inside an RTL
              paragraph: `//` and `:` are bidi-neutral and resolve to the
              paragraph level, so `https://` renders at the wrong visual end and
              the caret jumps — on the first field of the first screen of an
              Arabic-first product. Every other Latin-only input in this repo
              already sets it (login/signup email + password, ColorPicker's hex,
              plan's budget).

              `autoCapitalize="off"` is what stops iOS/Gboard sending
              `Https://…`; `normalizeWebsiteUrl` handles it anyway, and both
              belt and braces are cheap here.

              Deliberately NOT `type="url"`. Native constraint validation
              refuses `mysite.ae` and BLOCKS form submission — which would put
              C1 straight back, one layer higher: the submit handler that
              normalises the value would never run. `inputMode` gives the
              mobile keyboard the same hint with none of that. */}
          <Input
            id="onboarding-website-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={tBrandKit('websiteUrlPlaceholder')}
            maxLength={WEBSITE_URL_MAX_LENGTH}
            dir="ltr"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col items-center gap-3">
          <Button
            type="button"
            onClick={() => void handleExtract()}
            size="lg"
            className="w-full gap-2"
            disabled={url.trim().length < 4}
          >
            <Sparkles className="h-4 w-4" />
            {t('extractButton')}
          </Button>
          <button
            type="button"
            onClick={handleFillManually}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] underline underline-offset-2"
          >
            {t('fillManually')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'extracting') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary-500" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold font-cairo">{t('extractingTitle')}</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">{t('extractingDescription')}</p>
          <p className="text-xs text-[var(--color-text-muted)]" aria-live="polite">
            {t('extractingElapsedSeconds', { seconds: elapsedSeconds })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancelExtraction}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] underline underline-offset-2"
        >
          {t('cancelExtraction')}
        </button>
      </div>
    );
  }

  // phase === 'draft' — reachable from all three arms (extracted, skipped,
  // failed). This is the one screen every arm must reach.
  const fallbackWebsiteUrl = draft ? null : normalizeWebsiteUrl(url);
  const formInitialData: Partial<BrandKit> | undefined = draft
    ? {
        name: draft.name,
        industry: draft.industry,
        website_url: draft.website_url,
        city: draft.city,
        target_audience: draft.target_audience,
        description: draft.description,
        brand_voice: draft.brand_voice,
        primary_color: draft.primary_color ?? undefined,
        secondary_color: draft.secondary_color ?? undefined,
        accent_color: draft.accent_color ?? undefined,
        font_primary: draft.font_primary ?? undefined,
        font_secondary: draft.font_secondary ?? undefined,
      }
    : fallbackWebsiteUrl
      ? { website_url: fallbackWebsiteUrl }
      : undefined;

  return (
    <div className="space-y-4">
      {/* `color-mix`, not `border-[var(--color-error)]/30` below. Tailwind
          3.4.19 silently DROPS the opacity modifier on a `var()` arbitrary
          value — it emits no rule at all, so the border and the tint simply
          never render. The 2026-08-24 round converted 16 elements across the
          landing, pricing and contact pages for exactly this; this banner was
          written afterwards and reopened the class. It is the banner carrying
          the failure explanation on the arm every real customer hits today
          (the 503), so "degraded, not invisible" is not much comfort.
          `check-invariants`'s `no-var-opacity-modifier` rule now fails the
          build on it. */}
      {extractErrorCode && (
        <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--color-error)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] p-3 text-sm text-[var(--color-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{tBrandKit(BRAND_EXTRACT_ERROR_MESSAGE_KEYS[extractErrorCode])}</span>
        </div>
      )}

      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold font-cairo">
          {draft ? t('draftTitleExtracted') : t('draftTitleManual')}
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {draft ? t('draftDescriptionExtracted') : t('draftDescriptionManual')}
        </p>
      </div>

      <BrandKitForm
        initialData={formInitialData}
        missing={missingFields}
        loading={saving}
        submitLabel={t('saveAndContinue')}
        onSubmit={handleSave}
      />

      <div className="text-center">
        <button
          type="button"
          onClick={onAdvance}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] underline underline-offset-2"
        >
          {t('continueWithoutSaving')}
        </button>
      </div>
    </div>
  );
}
