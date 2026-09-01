'use client';

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { GenerationProgress } from '@/components/shared/GenerationProgress';
import { useCreditsStore } from '@/store/credits';
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import { toStudioError, getGatedUpgradeVariant, type StudioError } from '@/lib/studio-errors';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { downloadFile } from '@/lib/download';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Sparkles, Upload, X, Download, AlertTriangle, Loader2, Check } from 'lucide-react';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { WorkingIdentityBar } from '@/components/studios/WorkingIdentityBar';
import { useProjectSelection } from '@/hooks/useProjectSelection';
import { useBrandKits } from '@/hooks/useBrandKit';
import {
  EDIT_PRESETS,
  EDIT_PRESET_IDS,
  editPresetMatchesType,
  editPresetRequiresBrandColors,
  isEditPresetId,
  type EditPresetId,
} from '@/lib/ai/prompts/edit';

const EDIT_TYPES = [
  { id: 'background_replace', key: 'background_replace', emoji: '🖼️' },
  { id: 'object_remove', key: 'object_remove', emoji: '🗑️' },
  { id: 'color_change', key: 'color_change', emoji: '🎨' },
  { id: 'text_add', key: 'text_add', emoji: '✍️' },
  { id: 'style_transfer', key: 'style_transfer', emoji: '🔄' },
] as const;

/**
 * The presets each edit type offers, DERIVED from the preset table rather than
 * restated here.
 *
 * A literal list in this file would be a second source of truth for a set the
 * route already builds its `z.enum` from — so a preset added to
 * `EDIT_PRESETS` would exist, be accepted by the API, and be reachable by
 * nobody, silently. That is the exact shape of `VoiceoverCostConfig.watermark`
 * and of `versions.ts` before 2026-08-24: a mechanism with no consumer, green
 * on every gate.
 */
const PRESETS_BY_TYPE: Record<string, EditPresetId[]> = EDIT_PRESET_IDS.reduce<
  Record<string, EditPresetId[]>
>((acc, id) => {
  const type = EDIT_PRESETS[id].editType;
  (acc[type] ??= []).push(id);
  return acc;
}, {});

/**
 * `?preset=` handed over by another studio's next-action link.
 *
 * The edit TYPE is never carried in the URL: it is read off the preset table,
 * so a link cannot arrive carrying a pair that disagrees. An id that is not in
 * the table at all is dropped — a deep link is untrusted input like any other,
 * and the alternative is a request the route answers with a 400 the customer
 * did not cause.
 */
function initialSelection(raw: string | null): { editType: string; editPreset: EditPresetId | null } {
  if (!raw || !isEditPresetId(raw)) return { editType: 'background_replace', editPreset: null };
  return { editType: EDIT_PRESETS[raw].editType, editPreset: raw };
}

/** The server mirror: `editDescription: z.string().min(5).max(500).optional()`.
 *  A shorter-but-non-empty string is NOT "no description" — it is a 400 — so
 *  the page must never quietly drop it, and must never send it either. */
const MIN_DESCRIPTION = 5;

/**
 * What POST /api/upload actually accepts. The picker used to say `image/*`, so
 * every HEIC from a phone, every GIF and every AVIF was offered, refused with a
 * 400, and the refusal thrown away — the handler only acted on success, and a
 * 400 resolves normally so the `catch` never ran. The blob: preview stayed on
 * screen, Generate enabled, and the route reserved a credit before dying in
 * lib/ai/gemini.ts. What dies there is the blob: URL specifically, not every
 * non-https form: fetchReferenceImage() decodes a data: URL inline — that is the
 * one reference shape the model consumes natively, which is why the edit and
 * photoshoot routes accept data:image/ — and sends anything else through
 * new URL() plus an https-and-host-allowlist check that blob: cannot pass.
 */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB — the limit /api/upload enforces

function EditPageContent(): React.ReactElement {
  const t = useTranslations();
  // Scoped, not an arrow wrapper: `tStudio` takes one
  // argument and silently drops the values a message needs, so an ICU
  // placeholder like {term} rendered as literal text.
  const tStudio = useTranslations('studio');
  const tEdit = useTranslations('edit');
  const searchParams = useSearchParams();
  // Preload an image handed off from another studio (e.g. Creator's edit shortcut)
  const initialSrc = searchParams.get('src');
  const initial = initialSelection(searchParams.get('preset'));
  const { projectId, projectBrandKitId, onProjectChange } = useProjectSelection();
  const [originalImage, setOriginalImage] = useState<string | null>(initialSrc || null);
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState(initial.editType);
  const [editPreset, setEditPreset] = useState<EditPresetId | null>(initial.editPreset);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<StudioError | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // The object URL lives here and ONLY here, for the seconds the bytes are in
  // flight. It must never become `originalImage`: that value is posted to the
  // route as `imageUrl`, and a blob: string is meaningless to the server.
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const setBalance = useCreditsStore((s) => s.setBalance);

  // ONLY what the customer explicitly chose. `undefined` is the correct default
  // and it is the point: an absent `brandKitId` is "I did not choose", which the
  // server answers with the project's kit and then the account default
  // (lib/brand-kits/working-identity.ts). The page used to send `selectedKit?.id`
  // unconditionally, which made the project step structurally unreachable —
  // picking a client in the ProjectSelector could never change the identity,
  // because step 1 always had an answer.
  const [chosenKitId, setChosenKitId] = useState<string | undefined>(undefined);

  const { brandKits, defaultKit } = useBrandKits();

  // ── A LOCAL MIRROR, FOR THE `brand_color_match` GATE AND NOTHING ELSE ──────
  //
  // `editPresetRequiresBrandColors` presets are refused by the route with
  // `400 validation_error, path: ['brandKitId']` when no kit resolved and no free
  // text stands in for one, and that refusal arrives after a round trip the
  // customer did not need to make. So the page still has to answer "will a kit be
  // in force?" — but it answers it for the WARNING only. It never reaches the
  // request body, which now carries `chosenKitId` and nothing more.
  //
  // The bar above renders the server's own answer to this same question; it
  // renders it, it does not hand it back, so this stays a mirror. It is the
  // server's ladder, including ADR-0001: an explicit id that is not one of the
  // caller's own kits resolves to NO identity and does not fall through, because
  // substituting the nearest kit is how one client's look leaks into another's.
  const gateKit =
    chosenKitId !== undefined
      ? brandKits.find((k) => k.id === chosenKitId)
      : (projectBrandKitId ? brandKits.find((k) => k.id === projectBrandKitId) : undefined) ?? defaultKit;

  // A preset only counts while it belongs to the CURRENT edit type. Stated
  // through the shared rule, not by comparing the table here: the route refuses
  // a mismatched pair with a 400 and `buildEditPrompt` drops one for the same
  // reason, so a third opinion in the UI is a third thing to keep in step.
  // It is also the safety net behind the type chips — switching type can never
  // leave a stale preset armed, whatever the click handler did.
  const activePreset = editPreset && editPresetMatchesType(editPreset, editType) ? editPreset : null;
  const presetsForType = PRESETS_BY_TYPE[editType] ?? [];

  // ── The client mirror of the route's contract, and nothing more ──────────
  //
  // This used to be a flat `editDescription.length >= 5`, which mirrored a
  // server rule that no longer exists: `editDescription` is optional now, and a
  // preset alone is a complete request. Left as it was, a customer who picked
  // "خلفية بيضاء للمتاجر" would have got a dead Generate button and no reason
  // for it — the defect class this repo has already catalogued twice (the plan
  // studio's empty `industry`, the three studios whose rejected upload left
  // Generate enabled). The rules below are the route's `superRefine`, in order.
  const descriptionUsable = editDescription.length >= MIN_DESCRIPTION;
  // 1–4 characters is neither "nothing" nor a valid description. Sending it is
  // a 400; dropping it silently edits the photo without the words the customer
  // typed. Both are wrong, so the button waits and says why.
  const descriptionTooShort = editDescription.length > 0 && !descriptionUsable;
  const needsText = editType === 'text_add';
  // text_add always needs it — there the description is not an instruction, it
  // is the text rendered into the image, and no preset can stand in for it.
  const missingIntent = needsText ? !descriptionUsable : !activePreset && !descriptionUsable;
  // `brand_color_match` with no kit and no free text is a 400 at the route
  // (`path: ['brandKitId']`). Said here first, with somewhere to go, because
  // the customer can act on it and the route's answer arrives after a round
  // trip they did not need to make.
  const brandColorsMissing =
    !!activePreset && editPresetRequiresBrandColors(activePreset) && !gateKit && !descriptionUsable;

  // Not just "an image was picked": an image the SERVER accepted. While an
  // upload is in flight `originalImage` is still null, so Generate stays down
  // rather than shipping the previous file under the new preview.
  const isValid =
    !!originalImage && !uploading && !descriptionTooShort && !missingIntent && !brandColorsMissing;

  // Whatever is standing between the customer and Generate, in words. A
  // disabled button with no explanation is the thing being fixed here, so the
  // reason is always on screen — including before anything is chosen, where it
  // reads as guidance rather than as a complaint.
  const requirementHint = descriptionTooShort
    ? tEdit('hints.descriptionTooShort')
    : missingIntent
      ? needsText
        ? tEdit('hints.textRequired')
        : tEdit('hints.pickPresetOrDescribe')
      : null;

  const { balance, status: creditsStatus } = useCredits();
  const cannotAfford = creditsStatus === 'ready' && CREDIT_COSTS.edit > balance;
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  const upgradeVariant = getGatedUpgradeVariant(error, creditsStatus);

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setResultImage(null);
    try {
      const res = await fetch('/api/studios/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: originalImage,
          // Omitted rather than sent empty: the field is `.optional()`, and
          // `''` is a 400. `isValid` already refuses the 1–4 character case, so
          // this can only be "a real description" or "none".
          editDescription: descriptionUsable ? editDescription : undefined,
          editType,
          editPreset: activePreset ?? undefined,
          // Only an explicit choice. Absent means "I did not choose", and the
          // route resolves project-then-default itself — the same answer the bar
          // above is showing, from the same module, so the label and the
          // generation cannot disagree.
          brandKitId: chosenKitId,
          projectId: projectId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(toStudioError(data.error, tStudio, typeof data.required === 'number' ? data.required : undefined, typeof data.term === 'string' ? data.term : undefined)); return; }
      setResultImage(data.data.imageUrl);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError(toStudioError('network', tStudio)); } finally { setIsLoading(false); }
  }, [isValid, originalImage, editDescription, descriptionUsable, editType, activePreset, chosenKitId, setBalance, tStudio, projectId]);

  const handleSubmitKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  };

  const releasePreview = (): void => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  };
  useEffect(() => releasePreview, []);

  /** /api/upload answers with a machine code; anything we have no wording for
   *  is still a failure the user must see, never a silent one. */
  const uploadErrorMessage = (code: unknown): string => {
    const known = ['invalid_type', 'file_too_large', 'storage_not_configured', 'unauthorized'];
    return tStudio(`uploadErrors.${typeof code === 'string' && known.includes(code) ? code : 'fallback'}`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset first: picking the same file twice fires no change event otherwise,
    // so a retry after a rejected file would do nothing at all.
    e.target.value = '';
    if (!file) return;

    setUploadError('');
    // The old file is not what the user means any more. Clearing it is what
    // keeps a rejected pick from silently editing the previous one.
    setOriginalImage(null);
    setResultImage(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(tStudio('uploadErrors.invalid_type'));
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError(tStudio('uploadErrors.file_too_large'));
      return;
    }

    releasePreview();
    const localPreview = URL.createObjectURL(file);
    previewRef.current = localPreview;
    setUploadPreview(localPreview);
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bucket', 'uploads');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      // A 400 RESOLVES — it does not throw. Checking only the success branch is
      // what let a refused upload look identical to an accepted one.
      const d = (await res.json()) as { success?: boolean; error?: string; data?: { url?: string } };
      if (!res.ok || !d.success || !d.data?.url) {
        setUploadError(uploadErrorMessage(d.error));
        return;
      }
      setOriginalImage(d.data.url);
    } catch {
      setUploadError(tStudio('uploadErrors.fallback'));
    } finally {
      setUploading(false);
      releasePreview();
      setUploadPreview(null);
    }
  };

  const inputPanel = (
    <div className="space-y-4">
      <ProjectSelector value={projectId} onChange={onProjectChange} />
      <div className="space-y-2">
        <Label>{tEdit('originalImage')} *</Label>
        {(uploadPreview ?? originalImage) ? (
          <div className="relative inline-block w-full">
            <Image src={(uploadPreview ?? originalImage)!} alt="" width={400} height={160} className={cn('h-40 w-full rounded-lg object-cover border transition-opacity', uploading && 'opacity-40')} unoptimized />
            {uploading ? (
              <span className="absolute inset-0 flex items-center justify-center" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-muted)]" /></span>
            ) : (
              <button type="button" onClick={() => { setOriginalImage(null); setResultImage(null); setUploadError(''); }} className="absolute top-2 end-2 rounded-full bg-[var(--color-error)] p-1 text-white"><X className="h-3 w-3" /></button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 w-full rounded-lg border-2 border-dashed border-[var(--color-border)] p-8 hover:border-primary-300 transition-colors">
            <Upload className="h-8 w-8 text-[var(--color-text-muted)]" /><span className="text-sm text-[var(--color-text-muted)]">{tEdit('uploadImage')}</span>
          </button>
        )}
        {/* Matches what /api/upload accepts. `image/*` advertised formats the
            server refuses, and the refusal had nowhere to go. */}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={handleFileChange} className="hidden" />
        {uploadError && <p className="text-xs text-[var(--color-error)]">{uploadError}</p>}
      </div>
      <div className="space-y-2">
        <Label>{tEdit('editType')}</Label>
        <div className="grid grid-cols-2 gap-2">{EDIT_TYPES.map((et) => (
          // Clearing the preset is the visible half; `activePreset` is the
          // load-bearing half, so a preset can never survive into a type it
          // does not belong to even if this handler is ever changed.
          <button key={et.id} type="button" onClick={() => { setEditType(et.id); setEditPreset(null); }} aria-pressed={editType === et.id} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors', editType === et.id ? selectedChipClasses : unselectedChipClasses)}>
            <span>{et.emoji}</span>{tEdit(`editTypes.${et.key}`)}
          </button>
        ))}</div>
      </div>
      {/* The recipes. This is the half of the studio that makes a paying
          subscriber's answer to "what do you want done" a CLICK rather than a
          paragraph — `photoshoot` has always worked this way
          (`environment: z.enum([...])` with `notes` optional) and `edit` is the
          studio that did not. Every card is a written specification the
          customer cannot be expected to know: "white background" typed by a
          shop owner and `marketplace_white` are the same intent and different
          products, and only one of them is accepted as an Amazon.ae main image.

          Selected state is a filled check plus border AND background, never
          colour alone; each card is a real <button>, so it is in the tab order
          and toggles with Space/Enter for free. */}
      {presetsForType.length > 0 && (
        <div className="space-y-2">
          <Label>{tEdit('presetsLabel')}</Label>
          <p className="text-xs text-[var(--color-text-muted)]">{tEdit('presetsHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {presetsForType.map((id) => {
              const selected = activePreset === id;
              return (
                <button
                  key={id}
                  type="button"
                  // Toggles: a customer who picked a recipe and then decided to
                  // describe the edit themselves needs a way back out that is
                  // not "reload the page".
                  onClick={() => setEditPreset(selected ? null : id)}
                  aria-pressed={selected}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                    selected ? selectedChipClasses : unselectedChipClasses
                  )}
                >
                  <span className="flex w-full items-start gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border',
                        selected
                          ? 'border-primary-500 bg-primary-500 text-white'
                          : 'border-[var(--color-border)]'
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="text-sm font-medium">{tEdit(`presets.${id}.label`)}</span>
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">{tEdit(`presets.${id}.description`)}</span>
                </button>
              );
            })}
          </div>
          {/* Said BEFORE the credit is spent, and with somewhere to go. The
              route answers this case with a 400 whose `details` name
              `brandKitId`, which is correct and arrives too late to be useful.
              color-mix, not `bg-[var(--color-warning)]/10` — Tailwind 3.4.19
              silently emits no rule for that and the panel would have no
              background at all. */}
          {brandColorsMissing && (
            <div className="rounded-lg border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              <p>{tEdit('brandColorsRequired')}</p>
              <Link href="/brand-kit" className="mt-1 inline-block font-medium text-[var(--color-link)] hover:underline">
                {tEdit('brandColorsRequiredCta')}
              </Link>
            </div>
          )}
        </div>
      )}
      {/* One free-text field serves all five modes, and its label and
          placeholder used to be mode-INDEPENDENT — showing a background-change
          example ("مثال: غيّر الخلفية لمكتب حديث…") to a customer who had just
          picked ✍️ إضافة نص. So they wrote a sentence: "اكتب عرض خاص خصم ٥٠٪
          فوق الصورة". The model receives that whole sentence plus a rule to set
          the text exactly as written, and cannot tell which words are the
          payload — plausible output has "اكتب" and "فوق الصورة" baked into the
          image, on a paid credit, and no amount of letter-joining or RTL
          direction rules can help. Both the label and the example are now per
          mode; lib/ai/prompts/edit.ts does the other half by giving the rules a
          delimited referent.

          As of the preset round this field is OPTIONAL on every mode except
          `text_add`, and it is deliberately shaped like photoshoot's `notes`
          rather than like a second pattern: a bare label with no required
          marker, the same 500-character cap, the same counter. The marker is
          kept for `text_add` alone, where the route does require it — and
          there the label says what it is: the text that will appear IN the
          image, not an instruction about it. */}
      <div className="space-y-2">
        <Label htmlFor="edit-description">{needsText ? `${tEdit('textToSetLabel')} *` : tEdit('editDescription')}</Label>
        <textarea id="edit-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tEdit(`descriptionPlaceholders.${editType}`)} rows={3} maxLength={500} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" />
        <p className="text-xs text-end text-[var(--color-text-muted)]">{editDescription.length}/500</p>
      </div>
      {/* The reason Generate is down, in words, next to Generate. Muted rather
          than red: before anything is chosen this is guidance, not a failure —
          and it is the same sentence either way, so it does not change
          character the moment the customer touches something. */}
      {requirementHint && <p className="text-xs text-[var(--color-text-muted)]">{requirementHint}</p>}
      {/* Whose business this edit is for, named BEFORE Generate — the credit is
          reserved the moment it is pressed, so saying it afterwards is saying it
          after they paid. It is handed exactly the values the POST above sends,
          so the label and the generation are answers to the same question. */}
      <WorkingIdentityBar
              studio="edit"
        projectId={projectId}
        brandKitId={chosenKitId}
        onChange={setChosenKitId}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <CreditCost cost={CREDIT_COSTS.edit} />
        <div className="flex items-center gap-2">
          {cannotAfford && (<Button asChild variant="default" size="sm"><Link href="/billing">{t('credits.topUpShort')}</Link></Button>)}
          <Button onClick={handleGenerate} disabled={!isValid || isLoading || cannotAfford} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
        </div>
      </div>
    </div>
  );

  const previewPanel = isLoading ? (
    <GenerationProgress isLoading />
  ) : upgradeVariant ? (
    <UpgradePrompt
      open
      onClose={() => setError(null)}
      variant={upgradeVariant}
      currentPlan={planId}
      requiredCredits={upgradeVariant === 'insufficient_credits' ? error?.required : undefined}
      availableCredits={upgradeVariant === 'insufficient_credits' ? balance : undefined}
    />
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error.message}</p></div>
  ) : !resultImage && !originalImage ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><span className="text-5xl">✏️</span><p className="text-sm mt-4">{tEdit('emptyState')}</p></div>
  ) : (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><p className="text-xs font-medium mb-2 text-center">{tEdit('original')}</p>{originalImage && <Image src={originalImage} alt="Original" width={1024} height={1024} className="w-full rounded-lg border" unoptimized />}</div>
        <div><p className="text-xs font-medium mb-2 text-center">{tEdit('afterEdit')}</p>{resultImage ? <Image src={resultImage} alt="Edited" width={1024} height={1024} className="w-full rounded-lg border" unoptimized /> : <div className="w-full aspect-square rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">{tEdit('pressGenerate')}</div>}</div>
      </div>
      {resultImage && (<Button onClick={() => void downloadFile(resultImage, 'pyrasuite-edit.png')} className="gap-2"><Download className="h-4 w-4" />{t('studio.download')}</Button>)}
    </div>
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.edit')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tEdit('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} isGenerating={isLoading} />
    </div>
  );
}

export default function EditPage(): React.ReactElement {
  return (
    <Suspense>
      <EditPageContent />
    </Suspense>
  );
}
