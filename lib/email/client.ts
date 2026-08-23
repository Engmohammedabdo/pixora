import nodemailer, { type Transporter } from 'nodemailer';

/**
 * The one place that actually puts an email on the wire.
 *
 * Two backends, picked by which environment variables exist:
 *
 *   SMTP_HOST set        -> SMTP (your own mail server)
 *   RESEND_API_KEY set   -> Resend's HTTP API
 *   neither              -> logged no-op
 *
 * SMTP wins when both are configured, because it is the one you chose to pay for.
 *
 * WHY SMTP IS THE DEFAULT HERE
 *
 * `pyramedia.info` already runs a mail server (`mail.pyramedia.info`, Postfix with
 * STARTTLS on 587) as part of the existing hosting, and its SPF record already
 * authorises that host:
 *
 *   v=spf1 mx a:mail.pyramedia.info ip4:72.61.148.81 include:websitewelcome.com -all
 *
 * So sending as `support@pyramedia.info` through that server passes SPF with **no
 * DNS changes at all**, costs nothing beyond the hosting already being paid for, and
 * makes the From address the one a customer would expect to reply to.
 *
 * The honest trade-off: shared-hosting IPs carry weaker sending reputation than a
 * dedicated provider, and the host caps outbound volume (typically a few hundred an
 * hour). At this product's volume — a waitlist and an invited cohort — neither
 * matters. If you are ever sending thousands a day and seeing spam-foldering, that is
 * the moment to move to a provider, and only `EMAIL_*` env vars change.
 *
 * Two rules the rest of the codebase depends on, whichever backend runs:
 *
 *  1. **This never throws.** It returns a result object. Email is a notification, not
 *     a transaction — a mail outage must not turn a Stripe webhook into a 500 and
 *     make Stripe retry a payment that already succeeded.
 *
 *  2. **Unconfigured is a valid state, not an error.** With nothing set it logs what
 *     it would have sent and reports `skipped`, so local dev and CI work with no
 *     secrets and a missing key in production is loud in the logs rather than a crash
 *     on the first customer.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Spam filters penalise HTML-only mail. */
  text: string;
  /** Overrides EMAIL_FROM. */
  from?: string;
  /** Overrides EMAIL_REPLY_TO. */
  replyTo?: string;
}

export type SendEmailResult =
  | { status: 'sent'; id: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * One connection pool for the process, not one per email.
 *
 * Every send would otherwise pay a fresh TCP connect, STARTTLS handshake and AUTH —
 * roughly a second against a shared host. Inside a Stripe webhook that is a second of
 * a 20-second budget spent on a notification nobody is waiting for.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (transporter) return transporter;

  // 465 is implicit TLS; 587 upgrades via STARTTLS. Getting this backwards is the
  // usual cause of a hang rather than a clean error, so it is derived from the port
  // instead of being a third thing to configure.
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
    pool: true,
    maxConnections: 2,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return transporter;
}

/**
 * Whether a message could actually leave the building.
 *
 * Callers that must NOT claim success when nothing was sent check this FIRST,
 * before touching the account they were asked about. Password reset is the
 * example: deciding after the lookup would mean the "we cannot send mail"
 * response is only ever returned for addresses that exist, which turns an
 * outage notice into an account-enumeration oracle. This function reads only
 * environment, never input, so its answer is the same for every caller.
 */
export function isEmailConfigured(): boolean {
  if (!process.env.EMAIL_FROM) return false;
  return Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY);
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = input.from || process.env.EMAIL_FROM;

  /**
   * Where a reply goes, deliberately allowed to differ from where mail is sent from.
   * On SMTP through your own domain the two are usually the same address; on a
   * provider they are not, because the sending domain must be one the provider has
   * verified. Supporting both keeps the switch a config change.
   */
  const replyTo = input.replyTo || process.env.EMAIL_REPLY_TO;

  if (!from) {
    console.warn(`[email] EMAIL_FROM not set — would have sent "${input.subject}" to ${redact(input.to)}`);
    return { status: 'skipped', reason: 'EMAIL_FROM not configured' };
  }

  const smtp = getTransporter();
  if (smtp) return sendViaSmtp(smtp, input, from, replyTo);

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) return sendViaResend(apiKey, input, from, replyTo);

  console.warn(`[email] no SMTP_HOST and no RESEND_API_KEY — would have sent "${input.subject}" to ${redact(input.to)}`);
  return { status: 'skipped', reason: 'no email backend configured' };
}

async function sendViaSmtp(
  smtp: Transporter,
  input: SendEmailInput,
  from: string,
  replyTo: string | undefined
): Promise<SendEmailResult> {
  try {
    const info = await smtp.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(replyTo ? { replyTo } : {}),
    });
    return { status: 'sent', id: info.messageId || 'unknown' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The provider's own words are kept: "535 authentication failed" and
    // "Sender address rejected" are the two failures everyone hits first, and a
    // generic message would hide which one it is.
    console.error(`[email] SMTP send failed for "${input.subject}": ${message}`);
    // Drop the pool so the next attempt reconnects rather than reusing a socket the
    // server may have already torn down.
    transporter = null;
    return { status: 'failed', error: message };
  }
}

async function sendViaResend(
  apiKey: string,
  input: SendEmailInput,
  from: string,
  replyTo: string | undefined
): Promise<SendEmailResult> {
  try {
    // Never let a hung provider hold a webhook open. Stripe times out at 20s and
    // retries; a request stuck here would turn a successful payment into a retry
    // storm over an email nobody is waiting on synchronously.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text();
      // The address is redacted but the provider's reason is not — that is the part
      // that says "domain is not verified", the failure everyone hits first.
      console.error(`[email] provider rejected "${input.subject}" (HTTP ${response.status}): ${body.slice(0, 300)}`);
      return { status: 'failed', error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { id?: string };
    return { status: 'sent', id: data.id ?? 'unknown' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[email] send failed for "${input.subject}": ${message}`);
    return { status: 'failed', error: message };
  }
}

/** `mo***@gmail.com` — enough to identify a row in support, not enough to leak a list. */
function redact(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 2)}***@${domain}`;
}
