'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { createBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ResetPasswordPage(): React.ReactElement {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  /**
   * `checking` -> `ready` when the token is redeemed, or `invalid`/`missing`.
   *
   * A boolean was not enough. The previous version had `sessionReady` alone and
   * rendered the form regardless: an expired or already-used link — the normal
   * case, since the email says the link works once — produced a greyed-out
   * button and ZERO text. The customer had no way to learn what went wrong and
   * no prompt to ask for another link, so the only remaining move was to leave.
   */
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'missing'>('checking');
  const searchParams = useSearchParams();

  const supabase = createBrowserClient();

  useEffect(() => {
    /**
     * Redeem the token explicitly rather than letting the client detect one in
     * the URL.
     *
     * `@supabase/ssr` hard-codes `flowType: 'pkce'` after spreading caller
     * options, so URL detection REJECTS the implicit-flow fragment GoTrue's own
     * verify endpoint redirects with — `AuthPKCEGrantCodeExchangeError: Not a
     * valid PKCE flow url.`, thrown before any network call, leaving no session
     * and no PASSWORD_RECOVERY event. `verifyOtp` is a direct call, so the
     * client's flow type never enters into it, and the SSR client still writes
     * the resulting session to cookies — which is what makes the redirect to
     * the dashboard at the end of this page work.
     */
    const tokenHash = searchParams.get('token_hash');

    let cancelled = false;
    (async (): Promise<void> => {
      // An existing session is legitimate: a signed-in user changing their
      // password, or a second render after a successful redemption.
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setState('ready');
        return;
      }

      if (!tokenHash) {
        setState('missing');
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (cancelled) return;
      setState(verifyError ? 'invalid' : 'ready');
    })();

    return () => { cancelled = true; };
  }, [supabase, searchParams]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Redirect to dashboard after a short delay
    setTimeout(() => {
      window.location.href = `/${locale}/dashboard`;
    }, 2000);
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-[var(--color-brand)]">
          {t('resetPassword')}
        </CardTitle>
        <CardDescription>{t('setPasswordSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {state === 'checking' ? (
          <p className="text-sm text-center text-[var(--color-text-secondary)]">
            {t('resetVerifying')}
          </p>
        ) : state === 'invalid' || state === 'missing' ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-[var(--color-error)]">
              {state === 'invalid' ? t('resetLinkInvalid') : t('resetLinkMissing')}
            </p>
            <Link href="/forgot-password">
              <Button variant="outline" className="w-full">
                {t('resetRequestNew')}
              </Button>
            </Link>
          </div>
        ) : success ? (
          <div className="text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t('resetSuccess')}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t('newPassword')}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                dir="ltr"
              />
            </div>

            {error && (
              <p className="text-sm text-[var(--color-error)]">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '...' : t('resetPassword')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
