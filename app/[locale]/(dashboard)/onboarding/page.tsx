'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useCreditsStore } from '@/store/credits';
import { useUser } from '@/hooks/useUser';
import { createBrowserClient } from '@/lib/supabase/client';
import { WebsiteStep } from '@/components/onboarding/WebsiteStep';
import {
  Sparkles, Palette, Image, ArrowLeft, ArrowRight, Check, Gift,
  Rocket, X, CreditCard,
} from 'lucide-react';

interface StepConfig {
  icon: typeof Rocket;
  titleKey: string;
  descriptionKey: string;
  ctaKey: string;
  action: string | null;
}

/**
 * ONE tour step, down from five. Changed 2026-09-09.
 *
 * The five were explanatory cards: a welcome, "go to /brand-kit", "go to
 * /creator", "go to /billing", and a congratulations. Four of them were a
 * slideshow, and one was actively wrong — step 4 put the pricing page in front of
 * a brand-new free account that had not yet produced anything, which is asking
 * for money before showing value. The welcome card repeated the landing page, and
 * the brand-kit card asked for something step 0 has already collected.
 *
 * What survives is the only step that moves someone toward output, pointed at the
 * studio docs/POSITIONING.md actually calls the front door: campaign, not creator.
 * The completion bonus is unchanged — it fires on the last step either way — but
 * it is now a toast rather than a whole screen, because a screen that says
 * "congratulations" is a screen between the customer and the product.
 */
const TOUR_STEPS: StepConfig[] = [
  {
    icon: Rocket,
    titleKey: 'step1Title',
    descriptionKey: 'step1Description',
    ctaKey: 'step1Cta',
    action: '/campaign',
  },
];

const TOTAL_STEPS = TOUR_STEPS.length + 1;

const STORAGE_KEY = 'pyrasuite-onboarding-step';

export default function OnboardingPage(): React.ReactElement {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const t = useTranslations('onboarding');
  const { user } = useUser();
  // A dedicated instance rather than useUser()'s internal one (not exposed) —
  // cheap: this wraps the anon key + cookie session, not a new connection.
  const supabase = useMemo(() => createBrowserClient(), []);

  // Resume from the last persisted step so leaving mid-flow doesn't restart it
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isInteger(saved) && saved > 0 && saved < TOTAL_STEPS) {
      setStep(saved);
    }
  }, []);

  const currentStep = step > 0 ? TOUR_STEPS[step - 1] : null;
  const progress = ((step + 1) / TOTAL_STEPS) * 100;
  const isLast = step === TOTAL_STEPS - 1;
  const isFirst = step === 0;

  // Best-effort only — read by components/dashboard/ProfileCompletion.tsx,
  // written by nothing before this. A failure here must never block
  // navigation: the localStorage write above (goToStep's other job) is what
  // actually makes progress resumable on THIS device, and 022 already grants
  // `authenticated` UPDATE on exactly this column, so no service-role client
  // is needed just to keep this best-effort.
  const persistOnboardingStep = (next: number): void => {
    const uid = user?.id;
    if (!uid) return;
    void supabase
      .from('profiles')
      .update({ onboarding_step: next })
      .eq('id', uid)
      .then(({ error }) => {
        if (error) console.error('[onboarding] failed to persist onboarding_step:', error.message);
      });
  };

  const goToStep = (next: number): void => {
    const clamped = Math.min(Math.max(next, 0), TOTAL_STEPS - 1);
    setStep(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch { /* Non-blocking */ }
    persistOnboardingStep(clamped);
  };

  const handleNext = async (): Promise<void> => {
    if (isLast) {
      try {
        // Awaited so the middleware's onboarding redirect (which reads
        // onboarding_completed from the same profiles row this POST writes)
        // never wins the race against an in-flight, un-awaited request — see
        // the finding this fixes for the exact sequencing.
        const res = await fetch('/api/user/onboarding', { method: 'POST' });
        const data = await res.json() as { success: boolean; newBalance?: number; creditsAwarded?: number };
        if (data.success && typeof data.newBalance === 'number') {
          // Apply the bonus locally so the credits widget reflects it
          // immediately, without waiting for the next poll/refetch.
          useCreditsStore.getState().setBalance(data.newBalance);
          // Said in a toast rather than on a screen of its own. The customer used
          // to get a full "congratulations, +5 credits" step; the credits are
          // real (ONBOARDING_BONUS_CREDITS in app/api/user/onboarding/route.ts)
          // and worth telling them about, but not worth a click.
          if (typeof data.creditsAwarded === 'number' && data.creditsAwarded > 0) {
            toast.success(t('bonusGranted', { credits: data.creditsAwarded }));
          }
        }
        window.localStorage.removeItem(STORAGE_KEY);
      } catch { /* Non-blocking — the middleware still gates on the server-side flag */ }
      // Into the studio, not the dashboard. The dashboard is a menu; the customer
      // came here to make something, and the last step's own CTA names it.
      router.push(currentStep?.action ?? '/campaign');
      return;
    }
    goToStep(step + 1);
  };

  // Secondary CTA: open the step's studio in the same tab, but persist
  // progress first so returning to /onboarding resumes at the next step.
  const handleTryAction = (): void => {
    if (!currentStep?.action) return;
    goToStep(Math.min(step + 1, TOTAL_STEPS - 1));
    router.push(currentStep.action);
  };

  // Skip must still mark onboarding as complete server-side or the
  // middleware's onboarding redirect bounces the user straight back here,
  // turning Skip into a dead control. It also pays the same trial as finishing
  // (see app/api/user/onboarding/route.ts), so it says so the same way.
  const handleSkip = async (): Promise<void> => {
    try {
      const res = await fetch('/api/user/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipped: true }),
      });
      const data = await res.json() as { success: boolean; newBalance?: number; creditsAwarded?: number };
      if (data.success && typeof data.newBalance === 'number') {
        useCreditsStore.getState().setBalance(data.newBalance);
        if (typeof data.creditsAwarded === 'number' && data.creditsAwarded > 0) {
          toast.success(t('bonusGranted', { credits: data.creditsAwarded }));
        }
      }
      window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* Non-blocking — user still proceeds to /dashboard */ }
    router.push('/dashboard');
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6 bg-gradient-to-b from-primary-50/30 to-transparent dark:from-primary-900/10">
      <Card className="w-full max-w-lg shadow-lg">
        <CardContent className="p-8">
          {/* Header — always present, including on the website step, so Skip
              stays reachable in one click no matter what that step is doing
              (typing a URL, mid-extraction, or editing the draft). */}
          <div className="flex items-center justify-between mb-6">
            <Badge variant="secondary" className="text-xs">
              {t('stepOf', { current: step + 1, total: TOTAL_STEPS })}
            </Badge>
            <button
              onClick={() => void handleSkip()}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors flex items-center gap-1"
            >
              {t('skip')}
              <X className="h-3 w-3" />
            </button>
          </div>

          <Progress value={progress} className="h-1.5 mb-8" />

          {/* Content */}
          {step === 0 ? (
            <WebsiteStep onAdvance={() => goToStep(1)} />
          ) : currentStep ? (
            <>
              <div className="text-center space-y-5">
                <div
                  className={cn(
                    'h-20 w-20 rounded-2xl mx-auto flex items-center justify-center transition-colors',
                    isLast
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : 'bg-primary-50 dark:bg-primary-900/30'
                  )}
                >
                  <currentStep.icon
                    className={cn('h-10 w-10', isLast ? 'text-green-600' : 'text-primary-500')}
                  />
                </div>

                <h2 className="text-2xl font-bold font-cairo">{t(currentStep.titleKey)}</h2>
                <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto leading-relaxed">
                  {t(currentStep.descriptionKey)}
                </p>
              </div>

              {/* Navigation */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-10">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goToStep(step - 1)}
                  disabled={isFirst}
                  className="gap-1"
                >
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                  {t('previous')}
                </Button>

                <div className="flex items-center gap-2">
                  {!isLast && currentStep.action && (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={handleTryAction}
                      className="gap-2"
                    >
                      <Sparkles className="h-4 w-4" />
                      {t(currentStep.ctaKey)}
                    </Button>
                  )}

                  <Button onClick={() => void handleNext()} size="lg" className="gap-2 px-6">
                    {isLast ? (
                      <>
                        <Check className="h-4 w-4" />
                        {t(currentStep.ctaKey)}
                      </>
                    ) : (
                      <>
                        {currentStep.action ? t('next') : t(currentStep.ctaKey)}
                        <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 mt-6">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <button
                key={i}
                onClick={() => goToStep(i)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === step ? 'w-6 bg-primary-500' : 'w-2 bg-[var(--color-border)]'
                )}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
