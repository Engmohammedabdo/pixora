'use client';
import { useUser } from '@/hooks/useUser';
import { useBrandKits } from '@/hooks/useBrandKit';
import { Progress } from '@/components/ui/progress';
import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'profile', labelAr: 'إنشاء حساب', check: () => true },
  { key: 'brandKit', labelAr: 'إضافة هوية بصرية', check: (ctx: { brandKits: number }) => ctx.brandKits > 0 },
  { key: 'generation', labelAr: 'أول إنشاء', check: (ctx: { onboardingStep: number }) => ctx.onboardingStep >= 3 },
  { key: 'billing', labelAr: 'اختيار خطة', check: (ctx: { planId: string }) => ctx.planId !== 'free' },
];

export function ProfileCompletion(): React.ReactElement | null {
  const { profile } = useUser();
  const { brandKits } = useBrandKits();

  if (!profile) return null;

  const ctx = { brandKits: brandKits.length, onboardingStep: profile.onboarding_step || 0, planId: profile.plan_id || 'free' };
  const completed = STEPS.filter(s => s.check(ctx as never)).length;
  const percentage = (completed / STEPS.length) * 100;

  if (percentage >= 100) return null; // All done, hide bar

  return (
    <div className="rounded-xl border bg-[var(--color-surface)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">أكمل ملفك الشخصي</h3>
        <span className="text-xs text-[var(--color-text-muted)]">{completed}/{STEPS.length}</span>
      </div>
      <Progress value={percentage} className="h-2" />
      <div className="grid grid-cols-2 gap-2">
        {STEPS.map((step) => {
          const done = step.check(ctx as never);
          return (
            <div key={step.key} className={cn('flex items-center gap-2 text-xs', done ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]')}>
              {done ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
              {step.labelAr}
            </div>
          );
        })}
      </div>
    </div>
  );
}
