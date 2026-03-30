'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

const STAGES = [
  { label: 'بايرا تحلل طلبك... 🦊', progress: 20 },
  { label: 'بايرا تشتغل على النتيجة...', progress: 60 },
  { label: 'بايرا تحسّن الجودة...', progress: 85 },
  { label: 'جاري الانتهاء...', progress: 95 },
];

interface GenerationProgressProps {
  isLoading: boolean;
  model?: string;
}

export function GenerationProgress({ isLoading, model }: GenerationProgressProps): React.ReactElement | null {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) { setStageIndex(0); return; }
    const timers = STAGES.map((_, i) => setTimeout(() => setStageIndex(i), i * 3000));
    return () => timers.forEach(clearTimeout);
  }, [isLoading]);

  if (!isLoading) return null;

  const stage = STAGES[stageIndex];
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
        <Sparkles className="h-12 w-12 text-primary-500" />
      </motion.div>
      <div className="w-full max-w-xs space-y-3">
        <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
          <motion.div className="h-full bg-primary-500 rounded-full" animate={{ width: `${stage.progress}%` }} transition={{ duration: 0.5 }} />
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={stageIndex} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="text-sm text-center text-[var(--color-text-secondary)]">
            {stage.label}
          </motion.p>
        </AnimatePresence>
        {model && <p className="text-xs text-center text-[var(--color-text-muted)]">Model: {model}</p>}
      </div>
    </div>
  );
}
