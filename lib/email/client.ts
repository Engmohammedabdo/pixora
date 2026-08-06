/**
 * The one place that actually puts an email on the wire.
 *
 * Plain `fetch` against the provider's REST API rather than an SDK, for two
 * reasons: no new dependency on the money path, and swapping provider means
 * editing this one function instead of every call site.
 *
 * Two rules that the rest of the codebase depends on:
 *
 *  1. **This never throws.** It returns a result object. Email is a notification,
 *     not a transaction — a Resend outage must not turn a Stripe webhook into a 500
 *     and make Stripe retry a payment that already succeeded. Callers log and move on.
 *
 *  2. **Unconfigured is a valid state, not an error.** With no API key it logs what
 *     it would have sent and reports `skipped`. Local dev and CI then work with no
 *     secrets, and a missing key in production is loud in the logs rather than a
 *     crash on the first customer.
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative. Spam filters penalise HTML-only mail. */
  text: string;
  /** Overrides EMAIL_FROM. Used for the one address that must differ (support). */
  from?: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { status: 'sent'; id: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = input.from || process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    const missing = !apiKey ? 'RESEND_API_KEY' : 'EMAIL_FROM';
    console.warn(`[email] ${missing} not set — would have sent "${input.subject}" to ${redact(input.to)}`);
    return { status: 'skipped', reason: `${missing} not configured` };
  }

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
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text();
      // The address is redacted but the provider's reason is not — that is the part
      // that says "domain not verified", which is the failure everyone hits first.
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
