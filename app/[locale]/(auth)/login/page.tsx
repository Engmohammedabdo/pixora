'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();

  // Everything that redirects TO this page carries its reason in ?error=, and
  // until this existed the page rendered none of them. Two separate flows landed
  // users here in silence: middleware's ban redirect (/login?error=banned), and
  // every Google sign-in bounced by the invite gate — the login page shows the
  // Google button unconditionally, but a first-time Google sign-in is an INSERT
  // into auth.users, which the gate refuses. Both put the user back in front of
  // the same form with nothing on screen and nothing to try differently.
  //
  // The parameter SELECTS a translated string; it is never rendered. An unknown
  // value falls back to the generic failure rather than to silence, so a code
  // added in the callback route can never quietly regress this page to the
  // blank-form behaviour this block exists to end.
  const errorCode = searchParams.get('error');
  const redirectMessages: Record<string, string> = {
    // Deliberately NOT "your account has been suspended", even though middleware
    // sends this code only after it has signed a banned account out.
    //
    // Arriving here proves nothing: ?error=banned is a query parameter, so anyone
    // can mail a customer a link on the real product domain that accuses them, in
    // their own language, of being banned. An accusation rendered on the strength
    // of a URL is a free social-engineering primitive and a support-ticket
    // generator, and it costs the genuinely banned user nothing to lose — they
    // cannot get in either way, and the wording below still points them at us.
    //
    // If a later reader wants the explicit wording back, it needs something this
    // page can VERIFY — proof that the app itself just performed the sign-out, not a
    // parameter it was handed. Swapping the string back on its own re-opens the hole.
    banned: t('errorSignInBlocked'),
    invite_required: t('errorGoogleInviteRequired'),
    oauth_cancelled: t('errorOauthCancelled'),
    oauth_failed: t('errorOauthFailed'),
  };
  const redirectMessage = errorCode ? redirectMessages[errorCode] ?? t('errorOauthFailed') : null;

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
        {/* Suppressed once the user has a fresh error of their own: the reason
            they were redirected here is stale the moment they try to sign in. */}
        {redirectMessage && !error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-[var(--color-error)] bg-[var(--color-surface-2)] p-3"
          >
            <p className="text-sm text-[var(--color-error)]">{redirectMessage}</p>
            {errorCode === 'invite_required' && (
              <Link
                href="/waitlist"
                className="mt-2 inline-block text-sm text-[var(--color-link)] hover:underline"
              >
                {t('joinWaitlist')}
              </Link>
            )}
            {/* The generic wording above carries no next step of its own, so the
                one route out has to be on screen: a real ban is not something the
                customer can resolve at this form. */}
            {errorCode === 'banned' && (
              <Link
                href="/contact"
                className="mt-2 inline-block text-sm text-[var(--color-link)] hover:underline"
              >
                {t('contactSupport')}
              </Link>
            )}
          </div>
        )}

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
            {/* Shown unconditionally again. It used to be gated on
                NEXT_PUBLIC_AUTH_EMAIL_ENABLED because the destination lied: it said
                "check your email" and Supabase Auth had no mailer, so a locked-out
                tester was told there was a way back when there was not.

                Both halves of that are fixed. /forgot-password now posts to
                /api/auth/recover, which generates the link itself and sends it on
                THIS app's mail transport — no dependency on the Supabase service's
                SMTP at all. And when no mail backend is configured it says so
                plainly and offers the contact page, instead of claiming a send.

                So hiding the link is now the worse option: an invisible link leaves
                a locked-out customer with no path and no explanation, while a
                visible one leads to a page that either sends the link or tells them
                exactly why it cannot and where to go instead. */}
            <div className="text-end">
              <Link href="/forgot-password" className="text-xs text-[var(--color-link)] hover:underline">
                {t('forgotPassword')}
              </Link>
            </div>
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
            Supabase Auth has no SMTP configured on this deployment, so
            `signInWithOtp` returned no error, the UI set magicLinkSent=true, and the
            mail never arrived. A control that reports success and does nothing is
            worse than a missing one, and this is the page invited testers are sent
            to. It also created accounts as a side effect (`shouldCreateUser`
            defaults to true), which is a second door into an invite-only product.

            Evidence, corrected: an earlier version of this comment cited
            `recovery_sent_at IS NULL for every user`. That is no longer sound — the
            column is stamped by `admin.generateLink()` too, which sends nothing, and
            a verification run in this repo has stamped it. The claim now rests on
            `/auth/v1/settings` reporting `mailer_autoconfirm: true` and on every
            account having `email_confirmed_at == created_at` to the millisecond,
            which is what auto-confirm does when there is no mailer to confirm through.

            Password reset no longer waits on any of this — it moved to
            /api/auth/recover and this app's own transport. Magic link could follow
            the same route if it is ever wanted; nobody has asked for it. */}
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
