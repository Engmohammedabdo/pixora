'use client';

import { useEffect, useState } from 'react';
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
  // null = not known yet. Rendering the form before this resolves would flash a
  // signup form at someone who cannot use it.
  const [inviteOnly, setInviteOnly] = useState<boolean | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createBrowserClient();

  // The referrals page builds invite links as /signup?ref=CODE, but nothing ever
  // read the parameter — so every referral was silently lost at the last step.
  const referralCode = searchParams.get('ref');

  // The invite token from the founder's link: /signup?invite=PYRA-XXXXXX
  //
  // This is the secret the database gate checks, not the email address. Keying on
  // the address alone would not work: /api/waitlist is public and self-service, and
  // GoTrue autoconfirms, so whoever registered an invited address first would take
  // the seat and the real invitee would be locked out with no recovery path.
  const inviteToken = searchParams.get('invite');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/public/gate-status');
        const json = await res.json();
        if (!cancelled) setInviteOnly(json.inviteOnly !== false);
      } catch {
        // Same posture as the route itself: unknown means closed.
        if (!cancelled) setInviteOnly(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

    // The `/api/public/registration-check` fetch that used to sit here is gone.
    //
    // It read a flag in the browser and then called supabase.auth.signUp() anyway,
    // so it stopped nobody: the request goes straight to GoTrue with the public anon
    // key and no code of ours is in the path. Verified by creating a real account
    // with a bare curl while the flag said closed. The real gate is a BEFORE INSERT
    // trigger on auth.users (migration 035).
    //
    // Keeping a second, differently-named switch that LOOKS like the gate is how a
    // founder flips the wrong one at 2am and believes the door is shut.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // invite_token lands in raw_user_meta_data, which is exactly where the
        // trigger reads it from.
        data: { full_name: name, ...(inviteToken ? { invite_token: inviteToken } : {}) },
        emailRedirectTo: `${window.location.origin}/${locale}/callback`,
      },
    });

    if (signUpError) {
      // A refusal from the gate reaches us as GoTrue's generic
      // "Database error saving new user" 500 — Postgres cannot get a clean message
      // through. Matching on that specific string is deliberate: a catch-all
      // "anything that isn't 'already registered' means not invited" would tell a
      // genuinely invited person, during a real database outage, that they were
      // never invited. Better to show the raw error in the unknown case than to
      // assert something false about their invitation.
      const raw = signUpError.message || '';
      if (/database error/i.test(raw)) {
        setError(t(inviteToken ? 'inviteInvalid' : 'inviteRequired'));
      } else if (/already/i.test(raw)) {
        setError(t('alreadyRegistered'));
      } else {
        setError(raw);
      }
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

  // Invite-only and no token in the link. Showing the form here would collect a
  // name, an email and a password and then hand back a 500 from Postgres — so send
  // them somewhere that actually does something with their interest instead. A wall
  // that collects an email beats a wall.
  if (inviteOnly === true && !inviteToken) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[var(--color-brand)]">
            {t('inviteOnlyTitle')}
          </CardTitle>
          <CardDescription>{t('inviteOnlyBody')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href="/waitlist" className="block">
            <Button className="w-full">{t('joinWaitlist')}</Button>
          </Link>
          <p className="text-center text-sm text-[var(--color-text-secondary)]">
            {t('alreadyHaveAccount')}{' '}
            <Link href="/login" className="text-[var(--color-link)] hover:underline">
              {t('login')}
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

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

        {/* Google is hidden while the gate is on, and this is not cosmetic.
            The invite token travels in raw_user_meta_data, which we control on the
            email/password call — but an OAuth round-trip carries Google's metadata,
            not ours, so the token cannot ride along and the trigger would refuse
            every attempt. Leaving the button visible would give an invited person a
            path that always fails. Google stays available on the LOGIN page, where
            it signs in accounts that already exist. */}
        {inviteOnly === false && (
          <>
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
          </>
        )}
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
