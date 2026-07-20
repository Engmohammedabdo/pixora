'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { createBrowserClient } from '@/lib/supabase/client';
import { Link, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignupPage(): React.ReactElement {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();

  // The referrals page builds invite links as /signup?ref=CODE, but nothing ever
  // read the parameter — so every referral was silently lost at the last step.
  const referralCode = searchParams.get('ref');

  const claimReferral = async (): Promise<void> => {
    if (!referralCode) return;
    try {
      await fetch('/api/referrals/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: referralCode }),
      });
    } catch {
      // A failed claim must never block the signup the user actually came for.
    }
  };

  const handleSignup = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Check if registration is enabled
    try {
      const regCheck = await fetch('/api/public/registration-check');
      const regData = await regCheck.json();
      if (!regData.registration_enabled) {
        setError('Registration is currently disabled. Please try again later.');
        setLoading(false);
        return;
      }
    } catch { /* proceed if check fails */ }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/${locale}/callback`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // When the Supabase instance auto-confirms sign-ups (GOTRUE
    // ENABLE_EMAIL_AUTOCONFIRM=true, which is how this deployment is configured),
    // signUp returns a live session: the user is ALREADY logged in and no
    // confirmation email will ever be sent. Showing the "check your inbox" screen
    // here strands every new user waiting for mail that cannot arrive. Only show
    // that screen when Supabase actually withheld a session pending confirmation.
    if (data.session) {
      // Await the claim: the session cookie is set, and navigating away first
      // would cancel the in-flight request and drop the referral.
      await claimReferral();
      router.replace('/onboarding');
      return; // keep `loading` true so the form stays disabled through navigation
    }

    setSuccess(true);
    setLoading(false);
  };

  const handleGoogleSignup = async (): Promise<void> => {
    // Carry the referral code through the OAuth round-trip — the callback route
    // claims it server-side once the session exists.
    const callback = new URL(`${window.location.origin}/${locale}/callback`);
    if (referralCode) callback.searchParams.set('ref', referralCode);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
      },
    });

    if (oauthError) {
      setError(oauthError.message);
    }
  };

  if (success) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-[var(--color-brand)]">
            {t('checkEmailTitle')}
          </CardTitle>
          <CardDescription>
            {t('checkEmailBody', { email })}
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-[var(--color-link)] hover:underline">
            {t('backToLogin')}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-[var(--color-brand)]">
          {t('signupTitle')}
        </CardTitle>
        <CardDescription>{t('signupSubtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('name')}</Label>
            <Input
              id="name"
              type="text"
              placeholder={t('namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
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
              minLength={6}
              dir="ltr"
              className="rtl:placeholder-shown:text-right"
            />
          </div>

          <p className="text-xs text-[var(--color-text-muted)]">
            {t('termsAgree')}
          </p>

          {error && (
            <p className="text-sm text-[var(--color-error)]">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '...' : t('signup')}
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
          onClick={handleGoogleSignup}
          type="button"
        >
          {t('continueWithGoogle')}
        </Button>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('hasAccount')}{' '}
          <Link href="/login" className="text-[var(--color-link)] hover:underline">
            {t('login')}
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
