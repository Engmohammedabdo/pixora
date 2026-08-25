'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { ArrowRight, Gift } from 'lucide-react';
import { fadeInUp } from '@/lib/animations';
import { BETA_CREDITS } from '@/lib/credits/beta';

export function FinalCta(): React.ReactElement {
  const t = useTranslations('landing');

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

      <div className="relative mx-auto max-w-3xl text-center text-white">
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <span className="text-5xl mb-6 block">🦊</span>

          <h2 className="text-4xl font-bold font-cairo mb-4">
            {t('cta.title')}
          </h2>

          <p className="text-lg text-white/80 mb-10 max-w-xl mx-auto">
            {t('cta.subtitle')}
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
              <Link href="/waitlist">
                {t('cta.button')}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
          </motion.div>

          {/* On the coloured CTA panel the brand pill from the hero would be
              invisible, so the gift is stated in white here and the studio
              count drops below it. Order matters: the reason to act goes above
              the reassurance. */}
          <p className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white">
            <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('cta.giftNote', { credits: BETA_CREDITS })}
          </p>

          <p className="mt-2 text-sm text-white/50">
            {t('cta.studios')}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
