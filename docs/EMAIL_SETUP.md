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
| **App email** | this Next.js app | the **app** service in Coolify | **password reset**, payment-failure notice, waitlist confirmation |
| **Auth email** | Supabase Auth (GoTrue) | the **Supabase** service in Coolify | signup confirmation, magic link — neither of which this product uses |

**Password reset moved.** It used to be GoTrue's job and that is why it never worked:
GoTrue is a different service with its own SMTP, and it has none. As of the
2026-08-23 change the app generates the recovery link itself
(`app/api/auth/recover/route.ts`) and sends it on the transport below.

So **there is one place to configure**, the app service, and section 4 is now
optional — signup confirmation is off (`mailer_autoconfirm: true`) and the
magic-link control was removed from the login page. Configure it only if you want
those back.

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

**Password reset** — the link a locked-out customer clicks. The app calls
`auth.admin.generateLink({ type: 'recovery' })`, which mints a real token and sends
nothing, then puts that token in its own Arabic-first email. Two things about the
implementation are worth knowing before you change any of it, because both were found
by testing rather than by reading:

- GoTrue builds its `action_link` from `API_EXTERNAL_URL`, which on this deployment is
  the **internal** docker host `http://supabase-kong:8000` — dead in any inbox. The
  route therefore does not use `action_link` at all; it builds a link to our own
  `/[locale]/reset-password` carrying `properties.hashed_token`.
- `@supabase/ssr` hard-codes `flowType: 'pkce'`, so the implicit-flow fragment
  GoTrue's verify endpoint redirects with is **rejected** by our own client. The reset
  page redeems the token with `verifyOtp({ token_hash, type: 'recovery' })` instead,
  which does not care about flow type and still writes the session to cookies.

### What it deliberately does not send

**Receipts** — Stripe already emails one on every successful charge and hosts the
invoice PDF. Turn on "Successful payments" in the Stripe Dashboard instead of building
a second, worse receipt.

**Dunning reminders** — Stripe Smart Retries sends those.

---

## 4. Auth email — optional, and no longer what unlocks password reset

> **This section used to be the fix. It is not any more.** Password reset moved to the
> app in the 2026-08-23 change; setting SMTP on the app service (§3) is all it needs.
> An earlier version of this file sent you here instead, and following it would have
> configured a service that no longer sends the message you were trying to unblock.

What GoTrue still owns: **signup confirmation** and **magic link**. Neither is in use —
`/auth/v1/settings` reports `mailer_autoconfirm: true`, so signups are confirmed
without email, and the magic-link control was removed from the login page. Configure
this only if you want one of those back.

If you do, set the same credentials from §1 on the **Supabase** service in Coolify:

```
SMTP_HOST=mail.pyramedia.info
SMTP_PORT=587
SMTP_USER=support@pyramedia.info
SMTP_PASS=<the mailbox password>
SMTP_SENDER_NAME=PyraSuite
SMTP_ADMIN_EMAIL=support@pyramedia.info
```

Restart the Supabase service afterwards; GoTrue reads these once at boot. Depending on
the Coolify template they may need a `GOTRUE_SMTP_*` prefix — match whatever that
service already uses, because the wrong prefix fails silently.

### Do NOT verify with `recovery_sent_at`

An earlier version of this file said a timestamp appearing in
`auth.users.recovery_sent_at` proves SMTP is wired. **It proves nothing.** That column
is also stamped by `auth.admin.generateLink()`, which sends no mail at all — the app's
own reset route calls it on every request, and so does any maintenance script. The
column measures "a recovery token was minted", not "a message left the building".

Verify by reading the app's logs instead. `POST /api/auth/recover` logs
`[recover] REACHABLE CUSTOMER NOT REACHED` with the transport's own error whenever a
link was generated and the send failed, and `[email] SMTP send failed …` carries the
server's words — `535 authentication failed` and `Sender address rejected` being the
two everyone hits first. Silence on both is the success signal.

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

### And check the one that matters most

```bash
curl -s -o /dev/null -w '%{http_code}
' -X POST https://pyrasuite.pyramedia.cloud/api/auth/recover   -H 'Content-Type: application/json'   -d '{"email":"you@your-real-account.com","locale":"ar"}'
```

- `503` means the app has no mail backend — `EMAIL_FROM` plus `SMTP_HOST` are not both
  set on the app service. Nothing was attempted and nobody's rate limit was spent.
- `200` means it accepted the request. It says the same thing for an address with no
  account, on purpose, so a stranger cannot use this endpoint to discover who your
  customers are — which is also why the only way to know a real send failed is the log
  line, not the response.
- `429` means you have already asked three times for that address this hour.

Then open the link that arrives. It should land on `/[locale]/reset-password` and show
the password form. If it shows "الرابط ده مش شغال" the token was already used or
expired — request a fresh one; each link works exactly once.
