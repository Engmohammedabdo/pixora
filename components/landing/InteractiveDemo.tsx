'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';

const DEMO_PROMPTS = [
  { prompt: 'صورة إعلانية لعطر فاخر', result: 'https://placehold.co/600x600/6366F1/FFFFFF?text=PyraSuite+Demo' },
  { prompt: 'تصميم لمنتج قهوة عربية', result: 'https://placehold.co/600x600/06B6D4/FFFFFF?text=Coffee+Brand' },
  { prompt: 'إعلان عقاري لشقة مودرن', result: 'https://placehold.co/600x600/10B981/FFFFFF?text=Real+Estate' },
];

export function InteractiveDemo(): React.ReactElement {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = (): void => {
    setLoading(true);
    setResult(null);
    const demo = DEMO_PROMPTS[Math.floor(Math.random() * DEMO_PROMPTS.length)];
    setTimeout(() => {
      setResult(demo.result);
      setLoading(false);
    }, 2000);
  };

  return (
    <section className="py-20 bg-[var(--color-surface)]">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="text-3xl font-bold font-cairo text-center mb-3">جرّب بنفسك — بدون تسجيل</h2>
        <p className="text-center text-[var(--color-text-secondary)] mb-8">اكتب وصف بسيط وشوف النتيجة</p>

        <div className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto mb-8">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="مثال: صورة إعلانية لعطر فاخر على رخام..."
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Button onClick={handleGenerate} disabled={loading} className="gap-2 rounded-xl px-6">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'جاري التوليد...' : 'جرّب الآن'}
          </Button>
        </div>

        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} transition={{ duration: 0.6 }} className="max-w-md mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result} alt="Demo result" className="w-full rounded-2xl shadow-2xl" />
              <p className="text-center text-sm text-[var(--color-text-muted)] mt-4">سجّل مجاناً عشان تحفظ نتائجك وتستخدم كل الاستوديوهات</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
