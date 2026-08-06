'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { createBrowserClient } from '@/lib/supabase/client';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage(): React.ReactElement {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createBrowserClient();

  const handleLogin = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    window.location.href = `/${locale}/dashboard`;
  };

  const handleGoogleLogin = async (): Promise<void> => {
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/${locale}/callback`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-[var(--color-brand)]">
          {t('loginTitle')}
        </CardTitle>
        <CardDescription>{t('loginSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
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
              className="rtl:placeholder-shown:text-right"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('password')}</Label>
            <Input
              id="password"
              type="password"
              placeholder={t('passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              dir="ltr"
              className="rtl:placeholder-shown:text-right"
            />
            {/* Hidden until Supabase Auth has SMTP. The reset form itself is
                untouched and still reachable at /forgot-password — it just says
                "check your email" and nothing is ever sent, because GoTrue has no
                mailer on this deployment. Verified: recovery_sent_at is NULL for
                every user who has ever existed.

                Advertising a recovery path that cannot recover anyone is the single
                worst thing to put in front of a hand-picked cohort: the moment one
                of them forgets a password, they are locked out permanently and the
                product told them there was a way back. Re-enable together with the
                magic-link block once SMTP_* is set — docs/EMAIL_SETUP.md. */}
            {process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED === 'true' && (
              <div className="text-end">
                <Link href="/forgot-password" className="text-xs text-[var(--color-link)] hover:underline">
                  {t('forgotPassword')}
                </Link>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '...' : t('login')}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-2 text-[var(--color-text-muted)]">
              {t('or')}
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleGoogleLogin}
          type="button"
        >
          {t('continueWithGoogle')}
        </Button>

        {/* The magic-link block that used to sit here is removed, not disabled.
            Supabase Auth has no SMTP configured on this deployment — verified,
            `recovery_sent_at` is NULL for every user who has ever existed — so
            `signInWithOtp` returns no error, the UI set magicLinkSent=true, and the
            mail never arrived. A control that reports success and does nothing is
            worse than a missing one, and this is the page invited testers are sent
            to. It also created accounts as a side effect (`shouldCreateUser`
            defaults to true), which is a second door into an invite-only product.

            Bring it back when SMTP_* is set on the Supabase service — see
            docs/EMAIL_SETUP.md. The same applies to the "forgot password" link. */}
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('noAccount')}{' '}
          <Link href="/signup" className="text-[var(--color-link)] hover:underline">
            {t('signup')}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
