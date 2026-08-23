import { sendEmail, type SendEmailResult } from './client';
import { passwordResetEmail, paymentFailedEmail, waitlistWelcomeEmail } from './templates';
import { getPlan } from '@/lib/stripe/plans';
import { routing } from '@/i18n/routing';

type Locale = 'ar' | 'en';

function normaliseLocale(value: string | null | undefined): Locale {
  return value === 'en' ? 'en' : (routing.defaultLocale as Locale);
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * Tell a customer their card was declined.
 *
 * Deliberately links to the app's own billing page rather than a Stripe portal URL.
 * A `billingPortal.sessions.create` link is short-lived and single-use — by the time
 * someone opens an email it is often dead, and a customer who is already anxious
 * about a payment problem meets an expired-link error. `/billing` carries the button
 * that mints a fresh session on click.
 *
 * Returns rather than throws: the caller is a Stripe webhook, and an email provider
 * outage must never turn a settled payment into a 500 and a retry storm.
 */
export async function sendPaymentFailedEmail(params: {
  email: string;
  planId: string;
  locale?: string | null;
}): Promise<SendEmailResult> {
  const locale = normaliseLocale(params.locale);
  const plan = getPlan(params.planId);
  const planName = locale === 'ar' ? plan.nameAr : plan.name;

  const content = paymentFailedEmail(locale, planName, `${appUrl()}/${locale}/billing`);
  return sendEmail({ to: params.email, ...content });
}

/** Confirm a pre-launch signup. Promises nothing the product cannot do yet. */
export async function sendWaitlistWelcomeEmail(params: {
  email: string;
  name?: string | null;
  locale?: string | null;
}): Promise<SendEmailResult> {
  const locale = normaliseLocale(params.locale);
  const content = waitlistWelcomeEmail(locale, params.name);
  return sendEmail({ to: params.email, ...content });
}

/**
 * Send a password-reset link the app generated itself.
 *
 * The link comes from `auth.admin.generateLink({ type: 'recovery' })`, which
 * mints a real GoTrue recovery token and does NOT send anything — that is the
 * whole point. Supabase Auth's own mailer is configured on a different service
 * and never was, so this is the only transport that exists.
 *
 * Like every other send here, this returns rather than throws; the caller must
 * still answer the customer, and must not vary that answer by whether the
 * account exists.
 */
export async function sendPasswordResetEmail(params: {
  email: string;
  resetUrl: string;
  locale?: string | null;
}): Promise<SendEmailResult> {
  const locale = normaliseLocale(params.locale);
  const content = passwordResetEmail(locale, params.resetUrl);
  return sendEmail({ to: params.email, ...content });
}
