'use client';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/hooks/useUser';
import { useBrandKits } from '@/hooks/useBrandKit';
import { createBrowserClient } from '@/lib/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompletionContext {
  brandKits: number;
  hasCompletedGeneration: boolean;
  planId: string;
}

const STEPS: { key: string; labelKey: string; check: (ctx: CompletionContext) => boolean }[] = [
  { key: 'profile', labelKey: 'stepProfile', check: () => true },
  { key: 'brandKit', labelKey: 'stepBrandKit', check: (ctx) => ctx.brandKits > 0 },
  // "First creation" is read off `generations`, not inferred from how far the
  // customer clicked through a tour. It used to be `onboarding_step >= 4`, a
  // threshold picked when the tour had five cards. Since 2026-09-09 it has one
  // (app/[locale]/(dashboard)/onboarding/page.tsx:45, so TOTAL_STEPS = 2), and
  // goToStep() clamps every write to 0 or 1 — the threshold became unreachable,
  // and this item could never tick for any account created after that date, no
  // matter how much it had generated. The step counter was a proxy that broke
  // the moment the tour was redesigned; a completed row is the fact itself.
  { key: 'generation', labelKey: 'stepGeneration', check: (ctx) => ctx.hasCompletedGeneration },
  { key: 'billing', labelKey: 'stepBilling', check: (ctx) => ctx.planId !== 'free' },
];

export function ProfileCompletion(): React.ReactElement | null {
  const t = useTranslations('widgets');
  const { user, profile } = useUser();
  const { brandKits } = useBrandKits();
  // A dedicated instance, as onboarding/page.tsx:66 does — useUser()'s is not
  // exposed. It wraps the anon key + cookie session, not a new connection.
  const supabase = useMemo(() => createBrowserClient(), []);
  const userId = user?.id;

  // One row, id only, `completed` only. Not `count: 'exact'`, which counts
  // every matching row to answer a yes/no question. RLS ("Users view own
  // generations", uid() = user_id) is the boundary; the `.eq('user_id')` is
  // belt and braces, as in app/api/generations/route.ts:54. A `failed` row was
  // refunded and delivered nothing, so it is not a creation.
  const firstGeneration = useQuery({
    queryKey: ['has-completed-generation', userId],
    enabled: !!userId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('generations')
        .select('id')
        .eq('user_id', userId as string)
        .eq('status', 'completed')
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });

  if (!profile) return null;
  // Wait for the answer. Treating "still loading" as "not done" would flash
  // 3/4 at every customer who has finished all four, then hide the card a
  // moment later. On a failed read the item shows unticked: the card is a
  // nudge, not a ledger, and hiding it would hide the other three with it.
  if (firstGeneration.isPending) return null;

  const ctx: CompletionContext = {
    brandKits: brandKits.length,
    hasCompletedGeneration: firstGeneration.data === true,
    planId: profile.plan_id || 'free',
  };
  const completed = STEPS.filter((s) => s.check(ctx)).length;
  const percentage = (completed / STEPS.length) * 100;

  if (percentage >= 100) return null; // All done, hide bar

  return (
    <div className="rounded-xl border bg-[var(--color-surface)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('completeProfile')}</h3>
        <span className="text-xs text-[var(--color-text-muted)]">{completed}/{STEPS.length}</span>
      </div>
      <Progress value={percentage} className="h-2" />
      <div className="grid grid-cols-2 gap-2">
        {STEPS.map((step) => {
          const done = step.check(ctx);
          return (
            <div key={step.key} className={cn('flex items-center gap-2 text-xs', done ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]')}>
              {done ? <Check className="h-3 w-3 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
              {t(step.labelKey)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
