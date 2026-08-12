# Email setup

There are **two separate email systems** here, and confusing them is why password
reset stayed broken. Fixing one does not fix the other.

| | Sent by | Configured with | Covers |
|---|---|---|---|
| **Auth email** | Supabase Auth (GoTrue) | `SMTP_*` on the **Supabase service** in Coolify | password reset, signup confirmation, magic link |
| **App email** | this Next.js app | `RESEND_API_KEY` + `EMAIL_FROM` on the **app** | payment-failure notice, waitlist confirmation |

One Resend account covers both. You set it up once and paste the key in two places.

---

## 0. Read this before you touch DNS

`pyramedia.info` **already sends mail**, through HostGator, and its SPF record ends in
a hard fail:

```
v=spf1 mx a:mail.pyramedia.info ip4:72.61.148.81 include:websitewelcome.com -all
                                                                            ^^^^
```

`-all` means *"anyone not listed above is forging my name — reject the message."*

So if you point Resend at `pyramedia.info` and send as `support@pyramedia.info`
without editing that line, Gmail rejects or spam-folders every message, and it will
look exactly like Resend is broken. This is the single most common way this setup
fails.

You have two ways around it.

### Recommended: send from a domain that sends nothing today

Verify **`pyramedia.cloud`** in Resend and send from there. It is the domain your
product actually lives on (`pyrasuite.pyramedia.cloud`), so the sender matches the
link in the email — which matters more than it sounds for an invite-only beta, where
a recipient's first instinct is to wonder whether the message is phishing.

It also touches nothing that already works: your HostGator mail on `pyramedia.info`
is left completely alone.

Replies still reach you, because `EMAIL_REPLY_TO` points at your real inbox:

```
EMAIL_FROM="PyraSuite <no-reply@pyramedia.cloud>"
EMAIL_REPLY_TO=support@pyramedia.info
```

Someone hits reply on a failed-payment notice and it lands in the mailbox you already
read. Nothing is lost by not sending *from* it.

### If you insist on sending as `support@pyramedia.info`

Then you must add Resend to the existing SPF record — edit it, never add a second
`v=spf1` line, because two SPF records is itself a hard failure:

```
v=spf1 mx a:mail.pyramedia.info ip4:72.61.148.81 include:websitewelcome.com include:_spf.resend.com -all
```

Workable, but it puts your transactional mail's reputation and your company mail's
reputation in one basket: a spam complaint from a beta invite can affect delivery of
a real client email. At your stage the recommended path is better.

---

## 1. Resend

You have to create the account yourself.

1. Sign up at resend.com.
2. **Domains → Add Domain → `pyramedia.cloud`.**
3. It gives you three records to add at your DNS provider. Add all three:
   - a **TXT** record for DKIM (looks like `resend._domainkey`)
   - a **TXT** SPF record for the sending subdomain
   - a **MX** record for the bounce/return path
4. Wait for all three to show **Verified**. Usually minutes, sometimes hours.
5. **API Keys → Create** → copy it once, it is not shown again.

> Do not skip step 4 and send from Resend's sandbox domain. A password-reset link
> from an unfamiliar domain is indistinguishable from phishing, and Gmail treats it
> that way.

---

## 2. App email

Three variables, on the **app** service in Coolify:

```
RESEND_API_KEY=re_...
EMAIL_FROM="PyraSuite <no-reply@pyramedia.cloud>"
EMAIL_REPLY_TO=support@pyramedia.info
```

Redeploy after setting them.

**Leaving them unset is a supported state.** `lib/email/client.ts` logs what it would
have sent and returns `{ status: 'skipped' }`. No crash, no retry, no failed webhook.
That is deliberate: email is a notification, and a provider outage must never turn a
settled Stripe payment into a 500 that Stripe then retries.

**This is why no email arrived when you joined the waitlist.** The feature shipped
2026-08-06 and you signed up 2026-08-12, so the code ran — it just had no key, logged
the intent, and skipped. Not a bug; the missing key is the whole story.

### What it sends

**Waitlist confirmation** — `app/api/waitlist/route.ts`, on a genuinely new signup
only. Migration 034 lets the server tell a new signup from a repeat one while the HTTP
response stays byte-identical, so the form still cannot be used to check whether an
address is on the list. Without that, anyone could type a stranger's address
repeatedly and use your server to mail them.

**Payment failed** — `app/api/stripe/webhook/route.ts`, on the healthy→failed
transition **once**. Stripe's smart retries fire that event once per attempt over
roughly three weeks; mailing on every one is how a recoverable card problem turns into
an unsubscribe.

### What it deliberately does NOT send

**Receipts.** Stripe already emails a card receipt on every successful charge and
hosts the invoice PDF. Turn on "Successful payments" in the Stripe Dashboard rather
than building a second, worse receipt.

**Dunning reminders.** Stripe Smart Retries sends those. Point them at the customer
portal.

---

## 3. Auth email — the password-reset fix

This is a **Coolify environment change on a different service**, not a code change.
Nothing in this repo sends these; GoTrue does, from its own templates.

Verified against the live database — no auth email has ever been sent:

```sql
SELECT recovery_sent_at IS NOT NULL, confirmation_sent_at IS NOT NULL FROM auth.users;
-- every row: false, false
```

Signup still works because GoTrue runs with autoconfirm on. **Password reset has no
such fallback**, so today the form says "check your email" and nothing is sent.

Set these on the **Supabase** service (not the app), using the same Resend key:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<the Resend API key>
SMTP_SENDER_NAME=PyraSuite
SMTP_ADMIN_EMAIL=no-reply@pyramedia.cloud
```

`SMTP_USER` really is the literal string `resend` — that is Resend's SMTP username for
every account; the API key goes in `SMTP_PASS`.

Restart the Supabase service afterwards; GoTrue reads these once at boot.

Depending on the Coolify template these may be prefixed `GOTRUE_SMTP_*`. Match
whatever the existing variables in that service already use — the wrong prefix fails
silently and looks identical to the current broken state.

### Then turn the UI back on

```
NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true
```

on the app. The "forgot password" link is hidden until you set this, because
advertising a recovery path that cannot recover anyone is the worst thing to put in
front of a hand-picked cohort.

### Confirm it actually worked

Request a reset from `/ar/forgot-password`, then:

```sql
SELECT email, recovery_sent_at FROM auth.users ORDER BY recovery_sent_at DESC NULLS LAST LIMIT 1;
```

`recovery_sent_at` moving from NULL to a timestamp is GoTrue reporting it handed the
message to SMTP. That is the check that distinguishes "SMTP is wired" from "the form
pretended to send".

### While you are in there

GoTrue's default templates are English-only and left-to-right. On an Arabic-first
product, the reset email is the one message a locked-out customer must be able to
read. Translate at least the reset and confirmation templates and set `dir="rtl"`.

---

## 4. Verify the whole thing

After both are set:

```bash
# App email: join the waitlist with an address you can check
curl -s -X POST https://pyrasuite.pyramedia.cloud/api/waitlist \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","locale":"ar","source":"smtp-test"}'
```

Then check the inbox, and check it came **from** `no-reply@pyramedia.cloud` with
**reply-to** `support@pyramedia.info`. Hit reply and confirm it addresses your support
inbox.

If nothing arrives, look at the app logs before touching DNS again — a `[email]`
line tells you whether the app tried and the provider refused (the reason is logged
verbatim, and "domain is not verified" is the usual one) or whether the key is still
missing.

Remember to delete the test row afterwards:

```bash
node scripts/db/apply.js --check "DELETE FROM waitlist WHERE source='smtp-test'"
```
