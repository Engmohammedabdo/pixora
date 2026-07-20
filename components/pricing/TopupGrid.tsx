import { useTranslations } from 'next-intl';
import { Coins, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { TOPUPS } from '@/lib/stripe/plans';
import { cn } from '@/lib/utils';

/**
 * A public-page equivalent of components/billing/TopupCard.tsx.
 *
 * Not a reuse of TopupCard itself: that component hardcodes Arabic strings
 * ("كريدت", "شراء", "أفضل قيمة") unconditionally with no locale branching —
 * fine inside the authenticated (Arabic-only-in-practice) billing page, but
 * it would render Arabic text on /en/pricing regardless of locale. This
 * component keeps the same visual language (Card + Coins/Zap icons) but
 * every label comes from next-intl, and "buy" becomes a signup link since a
 * logged-out visitor has no account to charge yet.
 */
export function TopupGrid(): React.ReactElement {
  const t = useTranslations('pricingPage.topups');

  return (
    <section className="py-16 px-6">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-3 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('title')}
        </h2>
        <p className="mb-10 text-center text-[var(--color-text-secondary)]">{t('subtitle')}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.values(TOPUPS).map((topup, i) => {
            const isBestValue = i === Object.values(TOPUPS).length - 1;
            return (
              <Card key={topup.id} className={cn('relative', isBestValue && 'border-accent-500')}>
                {isBestValue && (
                  <Badge className="absolute -top-2.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 bg-accent-500">
                    {t('bestValueBadge')}
                  </Badge>
                )}
                <CardContent className="p-4 flex flex-col items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-[var(--color-brand)]" />
                    <span className="text-2xl font-bold text-[var(--color-text-primary)]">
                      {topup.credits.toLocaleString()}
                    </span>
                  </div>
                  <span className="text-sm text-[var(--color-text-muted)]">{t('creditsSuffix')}</span>
                  <div className="text-center">
                    <p className="text-xl font-bold text-[var(--color-text-primary)]">${topup.price}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {topup.perCredit} {t('perCreditSuffix')}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="w-full gap-1" asChild>
                    <Link href="/signup">
                      <Zap className="h-3 w-3" />
                      {t('cta')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
