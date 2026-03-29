'use client';

import { motion } from 'framer-motion';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { fadeInUp } from '@/lib/animations';

export function FinalCta(): React.ReactElement {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary-600 via-primary-500 to-accent-500 py-24 px-6">
      {/* Floating background circles */}
      <motion.div
        className="absolute top-10 start-10 w-64 h-64 rounded-full bg-white/5 blur-3xl"
        animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.2, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-10 end-20 w-80 h-80 rounded-full bg-white/5 blur-3xl"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.15, 0.25, 0.15] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/2 end-1/3 w-48 h-48 rounded-full bg-white/5 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.18, 0.08] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative mx-auto max-w-3xl text-center text-white">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <Sparkles className="h-8 w-8 mx-auto mb-6 opacity-80" />

          <h2 className="text-4xl font-bold font-cairo mb-4">
            جاهز تبدأ تسويقك بذكاء؟
          </h2>

          <p className="text-lg text-white/80 mb-10">
            25 كريدت مجاناً — بدون بطاقة ائتمان — ابدأ بثواني
          </p>

          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            className="inline-block"
          >
            <Button
              variant="secondary"
              size="lg"
              className="px-10 text-base gap-2"
              asChild
            >
              <Link href="/signup">
                أنشئ حسابك المجاني
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
