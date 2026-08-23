'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ForgotPasswordPage(): React.ReactElement {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  /**
   * Posts to our own route, not to `supabase.auth.resetPasswordForEmail()`.
   *
   * That call asks Supabase Auth to send the mail, and Supabase Auth is a
   * separate service whose SMTP has never been configured — verified live:
   * `/auth/v1/settings` reports `mailer_autoconfirm: true`. So the old flow
   * could not deliver anything, and answered with GoTrue's raw English error.
   *
   * The route below generates the recovery link itself and sends it on the mail
   * transport this app owns. Its response is deliberately identical whether or
   * not the address has an account, so nothing here may say "we sent you a
   * link" — only "if the account exists, it is on its way".
   */
  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      });

      if (res.ok) {
        setSent(true);
        return;
      }

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      // `email_unavailable` is the one failure the customer must be told
      // plainly: no link is coming and waiting will not help. It is safe to
      // show because the route decides it from configuration alone, before it
      // looks at the address — so it reveals nothing about the account.
      if (json.error === 'email_unavailable') setError(t('resetEmailUnavailable'));
      else if (json.error === 'rate_limited') setError(t('resetRateLimited'));
      else if (json.error === 'invalid_email') setError(t('resetInvalidEmail'));
      else setError(t('resetFailed'));
    } catch {
      setError(t('resetFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-[var(--color-brand)]">
          {t('resetPasswordTitle')}
        </CardTitle>
        <CardDescription>{t('resetPasswordSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm font-medium">{t('resetLinkSent')}</p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('resetLinkSentHint')}
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full">
                {t('login')}
              </Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                dir="ltr"
              />
            </div>

            {error && (
              <div className="space-y-1">
                <p className="text-sm text-[var(--color-error)]">{error}</p>
                {error === t('resetEmailUnavailable') && (
                  <Link href="/contact" className="text-sm text-[var(--color-link)] hover:underline">
                    {t('contactSupport')}
                  </Link>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '...' : t('sendResetLink')}
            </Button>

            <div className="text-center">
              <Link href="/login" className="text-sm text-[var(--color-link)] hover:underline">
                {t('login')}
              </Link>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
