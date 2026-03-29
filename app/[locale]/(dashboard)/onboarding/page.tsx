'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Sparkles, Palette, Image, ArrowLeft, ArrowRight, Check, Gift,
  Rocket, X, CreditCard,
} from 'lucide-react';

const STEPS = [
  {
    icon: Rocket,
    title: 'مرحباً بك في Pixora!',
    description: 'المنصة العربية الأولى للتسويق بالذكاء الاصطناعي. 9 استوديوهات ذكية تساعدك تنشئ محتوى احترافي في دقائق.',
    cta: 'التالي',
    action: null,
  },
  {
    icon: Palette,
    title: 'أنشئ هويتك البصرية',
    description: 'أضف شعارك، ألوانك، وخطوطك. بنستخدمهم تلقائياً في كل شي تنشئه — بدون ما تعيد إدخالهم كل مرة.',
    cta: 'أنشئ الهوية',
    action: '/brand-kit',
  },
  {
    icon: Image,
    title: 'جرّب أول استوديو',
    description: 'جرب منشئ الصور — اكتب وصف بسيط بالعربي أو الإنجليزي وشوف النتيجة. أول توليد مجاني!',
    cta: 'جرّب الآن',
    action: '/creator',
  },
  {
    icon: CreditCard,
    title: 'اختر خطتك',
    description: 'ابدأ مجاناً بـ 25 كريدت شهرياً، أو ترقّى لخطة أكبر حسب احتياجك. تقدر تترقى في أي وقت.',
    cta: 'شوف الخطط',
    action: '/billing',
  },
  {
    icon: Gift,
    title: 'مبروك! حصلت على 5 كريدت إضافية',
    description: 'شكراً لإكمالك التعريف — أضفنا 5 كريدت مجانية لحسابك. ابدأ الإنشاء الآن!',
    cta: 'ابدأ الاستخدام',
    action: null,
  },
];

export default function OnboardingPage(): React.ReactElement {
  const [step, setStep] = useState(0);
  const router = useRouter();

  const currentStep = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const handleNext = (): void => {
    if (isLast) {
      // Mark onboarding as completed (would call API in production)
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
              خطوة {step + 1} من {STEPS.length}
            </Badge>
            <button
              onClick={handleSkip}
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors flex items-center gap-1"
            >
              تخطي
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

            <h2 className="text-2xl font-bold font-cairo">{currentStep.title}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto leading-relaxed">
              {currentStep.description}
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
              السابق
            </Button>

            <Button onClick={handleNext} size="lg" className="gap-2 px-6">
              {isLast ? (
                <>
                  <Check className="h-4 w-4" />
                  {currentStep.cta}
                </>
              ) : currentStep.action ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  {currentStep.cta}
                </>
              ) : (
                <>
                  {currentStep.cta}
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
