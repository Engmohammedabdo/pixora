# Email setup

**You already own a working mail server. Use it. There is nothing to buy.**

`pyramedia.info` runs Postfix on `mail.pyramedia.info` — verified live: ports 25, 465
and 587 all open, STARTTLS advertised on 587. It comes with the hosting you already
pay for.

Better still, the SPF record for that domain already authorises it:

```
v=spf1 mx a:mail.pyramedia.info ip4:72.61.148.81 include:websitewelcome.com -all
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

So sending as `support@pyramedia.info` through your own server passes SPF **with no
DNS changes at all** — and the From address is the real inbox, so replies just arrive.

> An earlier version of this file recommended sending from `pyramedia.cloud` through
> a hosted provider. That advice existed only to route around the strict `-all` on
> the `.info` SPF. Sending through your own server *is* covered by that record, so
> the whole complication disappears. Ignore any older copy.

---

## Two systems, one set of credentials

| | Sent by | Configured on | Covers |
|---|---|---|---|
| **Auth email** | Supabase Auth (GoTrue) | the **Supabase** service in Coolify | password reset, confirmation, magic link |
| **App email** | this Next.js app | the **app** service in Coolify | payment-failure notice, waitlist confirmation |

Same SMTP credentials in both places. Set it up once, paste it twice.

---

## 1. Get the mailbox credentials

In cPanel → **Email Accounts**:

- Create `support@pyramedia.info` if it does not exist, or use the existing password.
- Under **Connect Devices**, cPanel shows the outgoing settings. They will be
  `mail.pyramedia.info`, port 587 (STARTTLS) or 465 (SSL).
- The SMTP **username is the full address**, `support@pyramedia.info` — not `support`.
  This is the single most common mistake and it fails as `535 authentication failed`.

---

## 2. Test it before configuring anything

Put the values in your local `.env.local`:

```
SMTP_HOST=mail.pyramedia.info
SMTP_PORT=587
SMTP_USER=support@pyramedia.info
SMTP_PASS=<the mailbox password>
EMAIL_FROM="PyraSuite <support@pyramedia.info>"
```

Then send yourself a real message:

```bash
npx tsx scripts/db/test-smtp.js you@gmail.com
```

It uses the same `lib/email/client.ts` that production uses, so a pass here means the
real path works — not a parallel test implementation that could drift.

If it fails, the server's own words are printed. The two you will actually hit:

| Error | Cause |
|---|---|
| `535 authentication failed` | wrong password, or `SMTP_USER` is missing the `@domain` part |
| `Sender address rejected` | `EMAIL_FROM` is not a mailbox this server owns |

**When it succeeds, check the spam folder too.** Landing in spam is a different
problem from failing to send, and only opening the inbox tells them apart. In Gmail,
open the message → ⋮ → *Show original*, and confirm `spf=pass` and `dkim=pass`.

### If DKIM does not pass

SPF alone will usually deliver, but DKIM materially improves it. cPanel →
**Email Deliverability** → next to `pyramedia.info` click **Manage**, and it will show
you the DKIM record to add. Add it and re-check.

---

## 3. App email

Same five variables, on the **app** service in Coolify. Redeploy after.

**Leaving them unset is a supported state.** `lib/email/client.ts` logs what it would
have sent and returns `{ status: 'skipped' }`. No crash, no retry, no failed webhook.
Email is a notification, and an outage must never turn a settled Stripe payment into a
500 that Stripe then retries.

**This is why no email arrived when you joined the waitlist.** The feature shipped
2026-08-06 and you signed up 2026-08-12, so the code ran — it had no backend
configured, logged the intent, and skipped. Not a bug; the missing config is the whole
story.

### What it sends

**Waitlist confirmation** — on a genuinely new signup only. Migration 034 lets the
server tell a new signup from a repeat one while the HTTP response stays
byte-identical, so the form still cannot be used to check whether an address is on the
list. Without that, anyone could type a stranger's address repeatedly and use your
server to mail them.

**Payment failed** — on the healthy→failed transition **once**. Stripe's smart retries
fire that event once per attempt over roughly three weeks; mailing on every one is how
a recoverable card problem turns into an unsubscribe.

### What it deliberately does not send

**Receipts** — Stripe already emails one on every successful charge and hosts the
invoice PDF. Turn on "Successful payments" in the Stripe Dashboard instead of building
a second, worse receipt.

**Dunning reminders** — Stripe Smart Retries sends those.

---

## 4. Auth email — the password-reset fix

A **Coolify change on the Supabase service**, not a code change. Nothing in this repo
sends these; GoTrue does, from its own templates.

Verified against the live database — no auth email has ever been sent:

```sql
SELECT recovery_sent_at IS NOT NULL, confirmation_sent_at IS NOT NULL FROM auth.users;
-- every row: false, false
```

Signup still works because GoTrue runs with autoconfirm on. **Password reset has no
such fallback**, so today the form says "check your email" and nothing is sent.

Set on the **Supabase** service:

```
SMTP_HOST=mail.pyramedia.info
SMTP_PORT=587
SMTP_USER=support@pyramedia.info
SMTP_PASS=<the mailbox password>
SMTP_SENDER_NAME=PyraSuite
SMTP_ADMIN_EMAIL=support@pyramedia.info
```

Restart the Supabase service afterwards; GoTrue reads these once at boot.

Depending on the Coolify template these may be prefixed `GOTRUE_SMTP_*`. Match
whatever that service already uses — the wrong prefix fails silently and looks
identical to the current broken state.

### Then turn the UI back on

On the app: `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true`

The "forgot password" link stays hidden until you set this, because advertising a
recovery path that cannot recover anyone is the worst thing to put in front of a
hand-picked cohort.

### Confirm it actually worked

Request a reset from `/ar/forgot-password`, then:

```sql
SELECT email, recovery_sent_at FROM auth.users ORDER BY recovery_sent_at DESC NULLS LAST LIMIT 1;
```

`recovery_sent_at` moving from NULL to a timestamp is GoTrue reporting it handed the
message to SMTP. That is what distinguishes "SMTP is wired" from "the form pretended
to send".

### While you are in there

GoTrue's default templates are English-only and left-to-right. On an Arabic-first
product, the reset email is the one message a locked-out customer must be able to
read. Translate at least the reset and confirmation templates and set `dir="rtl"`.

---

## The honest trade-off, and when to revisit

Shared-hosting IPs carry weaker sending reputation than a dedicated provider, and the
host caps outbound volume — typically a few hundred an hour on a shared plan.

At this product's volume, a waitlist and an invited cohort, neither matters. Your
mail is transactional and low-volume, which is the easiest kind to deliver.

Revisit only if you are sending thousands a day, or you see messages landing in spam
despite `spf=pass` and `dkim=pass`. At that point switch to a provider — and because
`lib/email/client.ts` picks its backend from the environment, that is an env change,
not a code change: clear `SMTP_HOST`, set `RESEND_API_KEY`, and set `EMAIL_REPLY_TO`
to your support address so replies still reach you.

---

## 5. End-to-end check

```bash
curl -s -X POST https://pyrasuite.pyramedia.cloud/api/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@gmail.com","locale":"ar","source":"smtp-test"}'
```

Then clean up the test row:

```bash
node scripts/db/apply.js --check "DELETE FROM waitlist WHERE source='smtp-test'"
```

If nothing arrives, read the app logs before touching DNS again — an `[email]` line
tells you whether the app tried and the server refused (the reason is logged verbatim)
or whether nothing is configured at all.
