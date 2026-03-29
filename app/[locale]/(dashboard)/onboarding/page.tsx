'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Sparkles, Palette, Image, ArrowLeft, ArrowRight, Check, Gift, Rocket, X,
} from 'lucide-react';

const STEPS = [
  {
    icon: Rocket,
    title: 'مرحباً بك في Pixora!',
    description: 'المنصة العربية الأولى للتسويق بالذكاء الاصطناعي. في خطوات بسيطة بتكون جاهز تبدأ.',
    action: null,
  },
  {
    icon: Palette,
    title: 'أنشئ هويتك البصرية',
    description: 'أضف شعارك وألوانك — بنستخدمهم تلقائياً في كل شي تنشئه.',
    action: 'brand-kit',
  },
  {
    icon: Image,
    title: 'جرّب أول استوديو',
    description: 'جرب منشئ الصور — اكتب وصف بسيط وشوف السحر.',
    action: 'creator',
  },
  {
    icon: Gift,
    title: 'مبروك! حصلت على 5 كريدت إضافية',
    description: 'كمكافأة على إكمال التعريف — 5 كريدت مجانية أضفناها لحسابك.',
    action: null,
  },
];

export default function OnboardingPage(): React.ReactElement {
  const [step, setStep] = useState(0);
  const router = useRouter();

  const currentStep = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;
  const isLast = step === STEPS.length - 1;

  const handleNext = (): void => {
    if (isLast) {
      router.push('/dashboard');
      return;
    }
    if (currentStep.action) {
      router.push(`/${currentStep.action}`);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleSkip = (): void => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardContent className="p-8">
          {/* Progress */}
          <div className="flex items-center justify-between mb-6">
            <Badge variant="secondary" className="text-xs">
              خطوة {step + 1} من {STEPS.length}
            </Badge>
            <button onClick={handleSkip} className="text-xs text-[var(--color-text-muted)] hover:underline flex items-center gap-1">
              تخطي <X className="h-3 w-3" />
            </button>
          </div>
          <Progress value={progress} className="h-1.5 mb-8" />

          {/* Content */}
          <div className="text-center space-y-4">
            <div className={cn(
              'h-16 w-16 rounded-2xl mx-auto flex items-center justify-center',
              isLast ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/30'
            )}>
              <currentStep.icon className={cn('h-8 w-8', isLast ? 'text-green-600' : 'text-primary-500')} />
            </div>

            <h2 className="text-xl font-bold font-cairo">{currentStep.title}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mx-auto">
              {currentStep.description}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="gap-1"
            >
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              السابق
            </Button>

            <Button onClick={handleNext} className="gap-2">
              {isLast ? (
                <>
                  <Check className="h-4 w-4" />
                  ابدأ الاستخدام
                </>
              ) : currentStep.action ? (
                <>
                  <Sparkles className="h-4 w-4" />
                  {step === 1 ? 'أنشئ الهوية' : 'جرّب الآن'}
                </>
              ) : (
                <>
                  التالي
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
