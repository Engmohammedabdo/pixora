# Email setup

There are **two separate email systems** here, and confusing them is why password
reset stayed broken. Fixing one does not fix the other.

| | Sent by | Configured with | Covers |
|---|---|---|---|
| **Auth email** | Supabase Auth (GoTrue) | `SMTP_*` on the Supabase service in **Coolify** | password reset, signup confirmation, magic link, email change |
| **App email** | this Next.js app | `RESEND_API_KEY` + `EMAIL_FROM` | payment-failure notice, waitlist confirmation |

Neither is configured today.

Verified against the live database — no auth email has ever been sent:

```sql
SELECT recovery_sent_at IS NOT NULL, confirmation_sent_at IS NOT NULL FROM auth.users;
-- every row: false, false
```

Signup still works because GoTrue is running with autoconfirm on (`email_confirmed_at`
is set without a round trip). **Password reset is not so lucky** — it has nothing to
fall back on, so today the form says "check your email" and no email is ever sent.

---

## 1. Auth email — the password-reset fix

This is a **Coolify environment change, not a code change.** Nothing in this repo
sends these; GoTrue does, from its own templates.

### Get a sender

Any SMTP provider works. Resend is the same account you will use for app email, so
one setup covers both.

1. Create the account yourself and add `pyramedia.cloud` as a sending domain.
2. Add the DNS records it gives you (SPF, DKIM, and a return-path CNAME). Until
   these resolve, mail either bounces or lands in spam.
3. Create an API key.

> Do not skip domain verification and send from the provider's sandbox domain. A
> password-reset link from an unfamiliar domain is indistinguishable from phishing,
> and Gmail will treat it that way.

### Set these on the Supabase service in Coolify

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<the Resend API key>
SMTP_SENDER_NAME=PyraSuite
SMTP_ADMIN_EMAIL=no-reply@pyramedia.cloud
```

Restart the Supabase service afterwards — GoTrue reads these once at boot.

Depending on the Coolify template these may be prefixed `GOTRUE_SMTP_*`. Match
whatever the existing variables in that service already use; setting the wrong prefix
fails silently, which looks exactly like the current broken state.

### Confirm it worked

Request a reset from `/ar/forgot-password`, then:

```sql
SELECT email, recovery_sent_at FROM auth.users ORDER BY recovery_sent_at DESC NULLS LAST LIMIT 1;
```

`recovery_sent_at` moving from NULL to a timestamp is GoTrue reporting that it handed
the message to SMTP. That is the check that distinguishes "SMTP is wired" from "the
form pretended to send".

### While you are in there

GoTrue's default templates are English-only and Latin-script. On an Arabic-first
product the reset email is the one message a locked-out customer must be able to
read. The templates are editable in the same service configuration — at minimum,
translate the reset and confirmation ones and set `dir="rtl"`.

---

## 2. App email

Two variables, in the app's own environment:

```
RESEND_API_KEY=re_...
EMAIL_FROM="PyraSuite <no-reply@pyramedia.cloud>"
```

**Leaving them unset is a supported state.** `lib/email/client.ts` logs what it would
have sent and returns `{ status: 'skipped' }`. No crash, no retry, no failed webhook.
That is deliberate: email is a notification, and a provider outage must never turn a
settled Stripe payment into a 500 that Stripe then retries.

### What it sends

**Payment failed** — `app/api/stripe/webhook/route.ts`, on `invoice.payment_failed`.

Sent **once**, on the transition from healthy to failed. Stripe's smart retries fire
that event once per attempt over roughly three weeks; mailing on every one is how a
recoverable card problem becomes an unsubscribe. The webhook reads `payment_failed`
before writing it and only mails on the change.

Language comes from `profiles.locale`, which is now written at checkout
(`lib/stripe/locale.ts`). Before that it was a column nothing ever set, so it was
always `'ar'`. A customer who has never been through checkout still defaults to
Arabic — acceptable, since this email only goes to people who have paid.

**Waitlist confirmation** — `app/api/waitlist/route.ts`.

Sent only on a genuinely new signup. Migration 034 makes `join_waitlist` return
`created` vs `existing` **to the server only** — the HTTP response stays byte-identical
either way, so the form still cannot be used to test whether an address is on the
list. Without that distinction, anyone could type a stranger's address repeatedly and
use this endpoint to mail them.

### What it deliberately does NOT send

**Receipts.** Stripe already emails a receipt on every successful charge and hosts
the invoice PDF. Enable "Successful payments" in the Stripe Dashboard rather than
building a second, worse receipt. The in-app billing portal button reaches the same
history.

**Dunning retry reminders.** Stripe Smart Retries sends these. Point them at the
customer portal.

---

## Still missing after both of these

A **support address**. `/privacy` tells the user to "contact us by email" and the
product gives no address anywhere. An error message that says "contact support" with
no way to do so is worse than no message. Pick an address, put it on a contact page,
and set it as `replyTo` on outgoing mail.
