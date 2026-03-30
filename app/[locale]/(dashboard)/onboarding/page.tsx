'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
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

const STEPS: StepConfig[] = [
  {
    icon: Rocket,
    titleKey: 'step1Title',
    descriptionKey: 'step1Description',
    ctaKey: 'step1Cta',
    action: null,
  },
  {
    icon: Palette,
    titleKey: 'step2Title',
    descriptionKey: 'step2Description',
    ctaKey: 'step2Cta',
    action: '/brand-kit',
  },
  {
    icon: Image,
    titleKey: 'step3Title',
    descriptionKey: 'step3Description',
    ctaKey: 'step3Cta',
    action: '/creator',
  },
  {
    icon: CreditCard,
    titleKey: 'step4Title',
    descriptionKey: 'step4Description',
    ctaKey: 'step4Cta',
    action: '/billing',
  },
  {
    icon: Gift,
    titleKey: 'step5Title',
    descriptionKey: 'step5Description',
    ctaKey: 'step5Cta',
    action: null,
  },
];

export default function OnboardingPage(): React.ReactElement {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const t = useTranslations('onboarding');

  const currentStep = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const handleNext = (): void => {
    if (isLast) {
      try {
        fetch('/api/user/onboarding', { method: 'POST' });
      } catch { /* Non-blocking */ }
      router.push('/dashboard');
      return;
    }
    if (currentStep.action) {
      router.push(currentStep.action);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleSkip = (): void => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6 bg-gradient-to-b from-primary-50/30 to-transparent dark:from-primary-900/10">
      <Card className="w-full max-w-lg shadow-lg">
        <CardContent className="p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Badge variant="secondary" className="text-xs">
              {t('stepOf', { current: step + 1, total: STEPS.length })}
            </Badge>
            <button
              onClick={handleSkip}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors flex items-center gap-1"
            >
              {t('skip')}
              <X className="h-3 w-3" />
            </button>
          </div>

          <Progress value={progress} className="h-1.5 mb-8" />

          {/* Content */}
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
          <div className="flex items-center justify-between mt-10">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={isFirst}
              className="gap-1"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              {t('previous')}
            </Button>

            <Button onClick={handleNext} size="lg" className="gap-2 px-6">
              {isLast ? (
                <>
                  <Check className="h-4 w-4" />
                  {t(currentStep.ctaKey)}
                </>
              ) : currentStep.action ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  {t(currentStep.ctaKey)}
                </>
              ) : (
                <>
                  {t(currentStep.ctaKey)}
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </Button>
          </div>

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 mt-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
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
