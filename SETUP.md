# SETUP — the one file

Everything that has to be configured outside the code, in one place. If a setting is
not here, it is not required.

Three columns matter: **what**, **where it goes**, **what breaks without it**.

---

## 1. Already working — nothing to do

These are set and verified in production. Listed so you don't go looking.

| | |
|---|---|
| Supabase URL / anon key / service-role key | app env |
| Stripe secret key, **webhook secret**, all 8 price ids | app env |
| Gemini, OpenAI, ElevenLabs keys | app env |
| `NEXT_PUBLIC_APP_URL` — set at **build** time too | verified: the live sitemap renders the real domain, not localhost |
| Admin panel login | app env |
| Database migrations 001–037 | applied |
| Monthly credit-reset cron | live, `cron.job` id 1 |
| Orphan-generation reconcile cron | live, `cron.job` id 2 |

Checked against the real production environment on 2026-08-12.

> An earlier version of this file warned that `STRIPE_WEBHOOK_SECRET` might be empty
> in production, because it is empty in the local `.env.local`. **It is set.** The
> money path has its secret. Left here as a correction rather than deleted, so nobody
> re-raises it from an old copy.

---

## 2. Required before the first invite goes out

### 2.1 Rotate the admin password — **do this first**

`ADMIN_PASSWORD` is a short, guessable string, paired with the username `admin`.

That panel can issue invites, change any user's credit balance, ban users, and read
every email address you have collected. It is a higher-value target than the database
key, and unlike the database key it can be guessed without finding anything.

- **Where:** app environment in Coolify
- **Value:** 24+ random characters from a password manager
- **Also rotate:** `ADMIN_JWT_SECRET` at the same time, which invalidates any session
  already issued.

### 2.2 Stripe is in LIVE mode

The keys in production are `pk_live` / `sk_live`. **Every purchase charges a real
card**, including any you make while testing with your invited cohort.

That may be exactly what you want — real revenue from day one. Just decide it
deliberately rather than discovering it. If you would rather rehearse first, swap the
secret key, publishable key, all 8 price ids, and the webhook secret for their test
equivalents; they are not interchangeable individually.

### 2.3 `charge.dispute.created` on the webhook endpoint

- **Where:** Stripe Dashboard → Developers → Webhooks → your endpoint → events
- **Breaks without it:** the chargeback handler exists in the code and can never fire,
  so a customer who disputes a charge keeps their paid plan.

### 2.4 `REPLICATE_API_TOKEN` is empty

Not urgent, but know what it costs you. With no token, `generateFlux` returns a mock,
and `rejectMockInProduction` (`lib/ai/router.ts:110`) throws on it — correctly, rather
than serving a fake image.

The effect is that the image fallback chain is **Gemini → GPT → nothing**. If both
fail, the generation fails and credits are refunded. Each attempt that reaches the
dead third branch also burns 2.5 seconds before throwing.

---

## 3. Email — two separate systems

Confusing these is why password reset stayed broken. Full detail in
[`docs/EMAIL_SETUP.md`](docs/EMAIL_SETUP.md); the values are here.

### 3.1 App email (dunning + waitlist confirmation)

**Use your own mail server — there is nothing to buy.** `mail.pyramedia.info` is
live (Postfix, STARTTLS on 587), already paid for with the hosting, and the SPF
record for `pyramedia.info` already authorises it. Sending as
`support@pyramedia.info` passes SPF with **no DNS changes at all** — and since the
From address is your real inbox, replies simply arrive.

- **Where:** app environment

```
SMTP_HOST=mail.pyramedia.info
SMTP_PORT=587
SMTP_USER=support@pyramedia.info     # the FULL address, not "support"
SMTP_PASS=<the mailbox password>
EMAIL_FROM="PyraSuite <support@pyramedia.info>"
```

- **Test before deploying:** `npx tsx scripts/db/test-smtp.js you@gmail.com` — it
  uses the same client production uses, so a pass means the real path works. On
  failure it prints the server's own words; `535 authentication failed` almost
  always means the username is missing its `@domain`.
- **Unset is fine.** The code logs what it would have sent and returns `skipped`.
  Nothing crashes. The invite flow never depended on it — you copy links by hand.

### 3.2 Auth email (password reset) — **this is the one that is broken**

Password reset is sent by **Supabase**, not by this app. Verified: `recovery_sent_at`
is NULL for every user who has ever existed. No auth email has ever been sent.

- **Where:** the **Supabase service** in Coolify (not the app)
```
SMTP_HOST=mail.pyramedia.info
SMTP_PORT=587
SMTP_USER=support@pyramedia.info
SMTP_PASS=<the same mailbox password>
SMTP_SENDER_NAME=PyraSuite
SMTP_ADMIN_EMAIL=support@pyramedia.info
```

Same credentials as §3.1 — one mailbox covers both systems.

> **Optional now.** Password reset moved into the app on 2026-08-23 and needs only the
> app-side `EMAIL_FROM` + `SMTP_HOST` from §3.1. This section covers signup
> confirmation and magic link, neither of which this product uses. `NEXT_PUBLIC_AUTH_EMAIL_ENABLED`
> is gone with it — the "forgot password" link is always shown, because the page it
> leads to now either sends the link or says exactly why it cannot.

- Restart the Supabase service afterwards. Some Coolify templates prefix these
  `GOTRUE_SMTP_*` — match whatever that service already uses; the wrong prefix fails
  silently.
- **Do not check with `recovery_sent_at`.** It is stamped by `admin.generateLink()`
  too, which sends nothing — the app's own reset route calls it on every request. The
  column says a token was minted, not that mail left the building. Read the app logs
  for `[email]` / `[recover]` lines instead.
- If you do enable it, translate GoTrue's templates — they are English-only and
  left-to-right.

**Before SMTP is set, a tester who forgets their password is locked out permanently.**
Your only repair is to delete their account from `/admin/users` and re-invite them.

---

## 4. The invite gate

Installed and verified. Migrations 035 + 036, applied to production.

The gate is a `BEFORE INSERT` trigger on `auth.users`. It is **not** application code
— that is the point. The public anon key is in the browser bundle by definition, and
before this, a bare `curl` with it created a real account and returned a live session.

### Day-to-day

Everything is on **`/admin/invites`**:
- see who is waiting, invited, or joined
- invite one person, or everyone matching the current filter
- **copy the invite link** and send it however you like — WhatsApp, DM, email
- revoke an unused invite

Re-inviting the same person returns the **same** link, so clicking twice never
invalidates one you already sent.

### The two knobs

Both live in the database, deliberately not in the admin feature-flags blob (that one
is cached for 60 seconds and fails **open**).

```bash
# Open the doors to everyone (end the beta)
node scripts/db/apply.js --check "UPDATE system_settings SET value = jsonb_set(value,'{enabled}','false') WHERE key='invite_gate'"

# Close them again
node scripts/db/apply.js --check "UPDATE system_settings SET value = jsonb_set(value,'{enabled}','true') WHERE key='invite_gate'"

# Change how many credits an invited tester arrives with (default 100)
node scripts/db/apply.js --check "UPDATE system_settings SET value = jsonb_set(value,'{beta_credits}','150') WHERE key='invite_gate'"
```

**This is also the break-glass.** If the gate ever locks out someone it should not,
the first command opens the door without a deploy.

### Why 100 credits

A new account gets 25 (default) + 5 (onboarding) = 30. One pass through all nine
studios costs **39** at the cheapest settings, 45 at normal. Your hand-picked tester
would run out before seeing the whole product. 100 covers roughly three passes.

Testers still get watermarked 1080p output, because they are on the free plan. If you
want a specific tester to see the real thing, change their plan in `/admin/users`.

### Verify it is actually on

```bash
node scripts/db/verify-invite-gate.js
```

Twelve checks against the **real** GoTrue endpoint with the public anon key. Testing
through the signup form proves nothing — the browser refuses first and the request
never reaches the database.

### The one durability risk

The trigger lives on `auth.users`, a table the Supabase service owns. A Coolify
redeploy or a restore can drop it, and signup would silently revert to fully open.

`/api/health` now reports unhealthy in exactly that case. If you have an uptime
monitor, it is already watching. If not, that is the one thing worth adding.

---

## 5. Stripe Dashboard

Not code. None of it can be assumed done.

1. **Billing → Manage failed payments → "Cancel subscription"** on retry exhaustion.
   The code defends against the other two settings, but don't rely on code alone for
   something one dropdown fixes.
2. **Enable Smart Retries** and failed-payment emails, pointed at the customer portal.
3. **Save a default Customer Portal configuration** (invoice history, payment method,
   cancellation). Without a saved default, the portal API throws and the "Manage
   subscription" button is broken out of the box.
4. **Enable receipt emails** for successful payments.
5. **Subscribe the webhook endpoint to `charge.dispute.created`.** The handler exists
   and cannot fire without this.
6. **Turn on dispute notifications.**

---

## 6. Business decisions — not deferrable

These are not settings; they are things only you can decide.

1. ~~A support address.~~ **Done.** `/contact` is live and public, messages land in
   `/admin/support`. Nothing to configure — it stores rather than emails on purpose,
   so it works with no provider. Reply from your own mail client using the address
   shown on each message. If you later set `EMAIL_FROM`, put a real inbox behind it
   so replies reach you.
2. **The Terms page** names no legal entity, no address, and no governing law. It
   needs the entity that will appear on Stripe invoices, a governing-law line, and an
   explicit refund position for unused subscription time and unused purchased credits.
3. **"Not VAT-registered; prices exclude VAT."** Below the AED 375,000 threshold you
   have no TRN and issuing a document stating VAT is *prohibited*. Add this line, and
   swap it for a TRN when you register.
4. **Credit breakage.** Purchased credits expire after 12 months, and every new top-up
   currently extends the whole pool. Decide whether that is intended before you
   publish refund terms.

---

## 7. Secrets — do this last, but do it

The service-role key and database password are in **git history**, and the repository
is **public**. Commits `7ba4b45`, `305dca8`, `a35a54d`.

Deleting the lines did not help — the values are in the history and GitHub indexes it.
This is the same key used to apply every migration in this project.

Procedure, including the order that keeps the site up:
[`docs/ROTATE_SECRETS.md`](docs/ROTATE_SECRETS.md).

`SERVICE_PASSWORD_JWT` signs both the anon and service-role keys, so all three rotate
together. `POSTGRES_PASSWORD` as an env var does not change the actual password —
that needs `ALTER USER`. Never touch `VAULT_ENC_KEY`.

---

## Launch checklist

```
[x] STRIPE_WEBHOOK_SECRET set in production          (§1)
[x] NEXT_PUBLIC_APP_URL set at BUILD time            (§1)
[ ] Admin password + JWT secret rotated              (§2.1)  ← highest value
[ ] Decided: stay on Stripe LIVE, or switch to test  (§2.2)
[ ] charge.dispute.created subscribed                (§2.3)
[ ] Stripe portal default configuration saved        (§5.3)
[ ] Retry exhaustion set to "cancel"                 (§5.1)
[ ] node scripts/db/verify-invite-gate.js passes     (§4)
[x] Support channel live at /contact                 (§6.1)
[ ] Terms name an entity + refund position           (§6.2)
[ ] SMTP_* on the Supabase service                   (§3.2)  ← or accept: no password reset
[ ] Secrets rotated                                  (§7)
```

The first six are enough to invite people. The last four are what you owe them.
