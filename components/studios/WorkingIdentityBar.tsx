'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Briefcase, ChevronDown, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrandKits } from '@/hooks/useBrandKit';

/**
 * Who this generation is for, said out loud, before the credit is spent.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Measured 2026-09-01: NO surface in the product named the brand kit a
 * generation would use. `brandKits.map` appeared at exactly two sites in the
 * whole app and neither was on a generation path, and no post-generation
 * surface named it either — not `RecentWork`, not any preview, not the asset
 * library. So a customer with several clients paid for work under an identity
 * they could neither see beforehand nor recover afterwards.
 *
 * ── WHY IT ASKS THE SERVER INSTEAD OF WORKING IT OUT ───────────────────────
 * The answer is `explicit -> project -> account default`, and the server owns
 * it (lib/brand-kits/working-identity.ts). Re-deriving it here to draw a label
 * is exactly the defect this whole change removes — a rule stated twice drifts —
 * and it would drift in the one place the customer can SEE the disagreement.
 * So the bar asks `/api/brand-kits/working-identity` with the same parameters
 * the studio is about to POST. If the two ever disagree, the bug is one fix,
 * not two.
 *
 * ── THE THREE THINGS IT CAN SAY ────────────────────────────────────────────
 *   1. a kit resolved and has business facts   -> "Working on: X"
 *   2. a kit resolved but says nothing         -> "…, but your result will be
 *      generic" — every kit created before migration 045 has all four business
 *      columns null, which is the COMMON shape, so "I have a brand kit" and
 *      "my results are personalised" are different facts and the customer is
 *      entitled to know which one they have.
 *   3. nothing resolved, or the kit is refused by the safety filter -> said
 *      plainly, with somewhere to go.
 *
 * All three appear BEFORE Generate, because the credit is reserved the moment
 * it is pressed. Telling someone afterwards is telling them after they paid.
 */

export interface WorkingIdentityBarProps {
  /**
   * Which studio is asking. Load-bearing, not decoration: the answer depends on
   * it. Each studio filters different columns and suppresses different business
   * facts (STUDIO_IDENTITY_POLICY in lib/brand-kits/working-identity.ts), so a
   * bar that asked without naming its studio reported a clean identity for
   * requests Generate then refused, and hid the "generic result" warning in
   * exactly the case plan and analysis document as the common one.
   */
  studio: 'plan' | 'analysis' | 'storyboard' | 'photoshoot' | 'creator' | 'campaign' | 'edit';
  /** The values the studio is about to POST. Passing anything else makes the
   *  label a guess about a different request. */
  projectId?: string | null;
  brandKitId?: string | null;
  /** creator and campaign only: their Apply-Brand-Kit toggle, OFF. */
  useBrandKit?: boolean;
  /** Called when the customer picks a different kit from the inline list. The
   *  studio owns that value and sends it as `brandKitId`. */
  onChange?: (brandKitId: string | undefined) => void;
  /**
   * The kit that ACTUALLY resolved, reported upward.
   *
   * plan and analysis prefill their business-name / industry / target-market
   * fields from a brand kit, and those fields are what the deliverable is ABOUT —
   * the resolved kit contributes only the facts the form does not collect. So a
   * form prefilled from the account default while the identity resolves to a
   * project's kit produces a 5- or 3-credit deliverable written about one client
   * under a bar naming another. This callback is how those two pages prefill from
   * the same kit the server resolved instead of from `defaultKit`.
   */
  onResolved?: (brandKitId: string | null) => void;
  className?: string;
}

interface Resolved {
  id: string | null;
  name: string | null;
  source: 'explicit' | 'project' | 'account' | 'none';
  /** False when a projectId was sent that is not the caller's — the POST would
   *  404 before generating. */
  projectValid: boolean;
  contributed: boolean;
  blocked: boolean;
  term?: string;
}

export function WorkingIdentityBar({
  studio,
  projectId,
  brandKitId,
  useBrandKit,
  onChange,
  onResolved,
  className,
}: WorkingIdentityBarProps): React.ReactElement | null {
  const t = useTranslations('studio.identity');
  const [open, setOpen] = useState(false);
  const { brandKits } = useBrandKits();

  const params = new URLSearchParams();
  params.set('studio', studio);
  if (projectId) params.set('projectId', projectId);
  if (brandKitId) params.set('brandKitId', brandKitId);
  if (useBrandKit === false) params.set('useBrandKit', 'false');
  const qs = params.toString();

  // Switching client clears an explicit pick.
  //
  // Without this, one click on Change pinned a kit for the life of the page and
  // the ProjectSelector could no longer change the identity — reinstating, through
  // the new control, the exact failure the removed client-side derivation caused.
  // Step 1 of the ladder is terminal by design (ADR-0001), so a pinned id really
  // does make steps 2 and 3 unreachable.
  //
  // The ref skips the first run: on mount there is nothing to clear, and calling
  // onChange there would fight a studio that seeded a kit from its own URL.
  const lastProjectId = useRef<string | null | undefined>(projectId);
  useEffect(() => {
    if (lastProjectId.current !== projectId) {
      lastProjectId.current = projectId;
      if (brandKitId) onChange?.(undefined);
    }
  }, [projectId, brandKitId, onChange]);

  const { data, isLoading, isError } = useQuery({
    // Keyed on every input, so switching project or kit re-asks rather than
    // showing the previous answer next to a changed request.
    queryKey: ['working-identity', qs],
    queryFn: async (): Promise<Resolved | null> => {
      const res = await fetch(`/api/brand-kits/working-identity?${qs}`);
      if (!res.ok) return null;
      const json = await res.json();
      return (json?.data as Resolved) ?? null;
    },
  });

  // Report the resolved kit upward whenever it changes. Declared before the
  // early returns because hooks must be, and it fires on the loading -> loaded
  // transition, which is the one that matters.
  const resolvedId = data?.id ?? null;
  useEffect(() => {
    onResolved?.(resolvedId);
    // `onResolved` is deliberately not a dependency: a caller passing an inline
    // arrow would re-fire this on every render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedId]);

  // In flight: render nothing. A skeleton would be a claim about the identity
  // before one has been resolved, next to a button that spends money.
  if (isLoading) return null;

  // Failed: say so. Returning null here made the bar indistinguishable from never
  // having been wired — the customer sees no identity statement at all and spends
  // 2 to 14 credits believing the studio simply does not show one. An honest
  // "could not check" is worth more than a clean-looking absence.
  if (isError || !data) {
    return (
      <div
        className={cn(
          'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)]',
          className
        )}
      >
        {t('unknown')}
      </div>
    );
  }

  const pick = (id: string | undefined): void => {
    setOpen(false);
    onChange?.(id);
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm',
        className
      )}
    >
      {data.blocked ? (
        <div className="flex items-start gap-2 text-[var(--color-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p>{t('blocked', { term: data.term ?? '' })}</p>
            <Link href="/brand-kit" className="underline underline-offset-2">
              {t('fixBrandKit')}
            </Link>
          </div>
        </div>
      ) : data.projectValid === false ? (
        // The GET answers anyway for a project that is not the caller's; the POST
        // returns 404 project_not_found before generating. Saying so here is the
        // difference between a label that promises an identity for a request that
        // cannot run, and one that does not.
        <div className="flex items-start gap-2 text-[var(--color-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <p>{t('projectGone')}</p>
        </div>
      ) : data.name ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Briefcase className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
          <span className="text-[var(--color-text-muted)]">{t('workingOn')}</span>
          <span className="font-medium text-[var(--color-text-primary)]">{data.name}</span>

          {brandKits.length > 1 && onChange && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="ms-auto inline-flex items-center gap-1 text-[var(--color-link)] underline underline-offset-2"
            >
              {t('change')}
              <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
          )}

          {/* A kit resolved and contributed nothing. Said on the same line
              rather than as a separate warning, because it is a qualification
              of the identity above, not a second problem. */}
          {!data.contributed && (
            <p className="w-full text-xs text-[var(--color-text-muted)]">
              {t('genericResult')}{' '}
              <Link href="/brand-kit" className="underline underline-offset-2">
                {t('completeProfile')}
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--color-text-muted)]">
          <Briefcase className="h-4 w-4 shrink-0" aria-hidden />
          <span>{t('noIdentity')}</span>
          <Link href="/brand-kit" className="text-[var(--color-link)] underline underline-offset-2">
            {t('completeProfile')}
          </Link>
        </div>
      )}

      {open && (
        <ul className="mt-2 border-t border-[var(--color-border)] pt-2 space-y-1">
          {/* The row that makes the picker reversible. Without it, one click set
              an explicit id that step 1 of the ladder treats as terminal, so the
              project step became unreachable for the rest of the session — the
              same outcome as the derivation this change removed, reached through
              the control meant to fix it. Listed FIRST because it is the default
              state, and marked selected when no explicit pick is in force. */}
          <li>
            <button
              type="button"
              onClick={() => pick(undefined)}
              className={cn(
                'w-full text-start rounded px-2 py-1 hover:bg-[var(--color-bg)]',
                !brandKitId && 'font-medium text-[var(--color-link)]'
              )}
            >
              {t('automatic')}
            </button>
          </li>
          {brandKits.map((kit) => (
            <li key={kit.id}>
              <button
                type="button"
                onClick={() => pick(kit.id)}
                className={cn(
                  'w-full text-start rounded px-2 py-1 hover:bg-[var(--color-bg)]',
                  kit.id === brandKitId && 'font-medium text-[var(--color-link)]'
                )}
              >
                {kit.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
