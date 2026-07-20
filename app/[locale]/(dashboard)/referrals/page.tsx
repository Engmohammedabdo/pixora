'use client';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Gift, Users, Share2 } from 'lucide-react';

interface ReferralStats {
  code: string | null;
  totalReferred: number;
  creditsEarned: number;
}

/** Mirrors the p_credits default in claim_referral (migration 023/026). */
const CREDITS_PER_REFERRAL = 25;

export default function ReferralsPage(): React.ReactElement {
  const t = useTranslations('referrals');
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  // The code comes from the database (profiles.referral_code, issued by migration
  // 023). It used to be invented client-side from a slice of the user id, so the
  // invite link carried a code that existed nowhere and could never be claimed.
  useEffect(() => {
    let active = true;
    fetch('/api/referrals')
      .then((r) => r.json())
      .then((json) => {
        if (active && json?.success) setStats(json.data as ReferralStats);
      })
      .catch(() => { /* stats stay null; the UI shows the empty state */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const referralCode = stats?.code ?? '';
  // Carry the sharer's locale, not a hardcoded /ar — an English user was sending
  // friends to the Arabic signup page.
  const referralLink = referralCode
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud'}/${locale}/signup?ref=${referralCode}`
    : '';

  const handleCopy = async (): Promise<void> => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success(t('copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const handleWhatsApp = (): void => {
    if (!referralLink) return;
    // WhatsApp is the realistic sharing channel for this market, so it gets the
    // primary button rather than a generic share sheet.
    const message = t('shareMessage', { credits: CREDITS_PER_REFERRAL, link: referralLink });
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-cairo">{t('title')}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{t('subtitle')}</p>
      </div>

      {/* How it works */}
      <Card className="bg-gradient-to-br from-primary-50 to-accent-50/30 dark:from-primary-900/20 dark:to-accent-900/10 border-primary-200 dark:border-primary-800">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Gift className="h-6 w-6 text-primary-500" />
            </div>
            <div>
              <h2 className="font-semibold">{t('howTitle')}</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">{t('howSubtitle')}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center mx-auto mb-2 text-sm font-bold">1</div>
              <p className="text-xs">{t('step1')}</p>
            </div>
            <div className="text-center">
              <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center mx-auto mb-2 text-sm font-bold">2</div>
              <p className="text-xs">{t('step2')}</p>
            </div>
            <div className="text-center">
              <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center mx-auto mb-2 text-sm font-bold">3</div>
              <p className="text-xs">{t('step3', { credits: CREDITS_PER_REFERRAL })}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referral Link */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('linkTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={loading ? t('loadingLink') : referralLink} readOnly dir="ltr" className="text-xs font-mono" />
            <Button onClick={handleCopy} disabled={!referralLink} aria-label={t('copyAria')} variant="outline" size="icon" className="flex-shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleWhatsApp} disabled={!referralLink} className="flex-1 gap-2 bg-green-600 hover:bg-green-700">
              <Share2 className="h-4 w-4" /> {t('shareWhatsApp')}
            </Button>
            <Button onClick={handleCopy} disabled={!referralLink} variant="outline" className="flex-1 gap-2">
              <Copy className="h-4 w-4" /> {t('copy')}
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{t('codeLabel')} <Badge variant="secondary">{referralCode || '…'}</Badge></p>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> {t('statsTitle')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-2xl font-bold text-green-600">{loading ? '…' : stats?.totalReferred ?? 0}</p><p className="text-xs text-[var(--color-text-muted)]">{t('successfulSignups')}</p></div>
            <div><p className="text-2xl font-bold text-amber-600">{loading ? '…' : stats?.creditsEarned ?? 0}</p><p className="text-xs text-[var(--color-text-muted)]">{t('creditsEarned')}</p></div>
            <div><p className="text-2xl font-bold text-primary-600">{CREDITS_PER_REFERRAL}</p><p className="text-xs text-[var(--color-text-muted)]">{t('creditsPerInvite')}</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
