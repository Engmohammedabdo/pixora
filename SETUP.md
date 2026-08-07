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
| Stripe secret key + all 8 price ids | app env |
| AI providers (Gemini, OpenAI, Replicate, ElevenLabs) | app env |
| Admin panel login | app env |
| Database migrations 001–036 | applied |
| Monthly credit-reset cron | live, `cron.job` id 1 |
| Orphan-generation reconcile cron | live, `cron.job` id 2 |

---

## 2. Required before the first invite goes out

### 2.1 Stripe webhook secret — **check this first**

`STRIPE_WEBHOOK_SECRET` is present but **empty** in `.env.local`.

If it is also empty in production, every Stripe webhook returns 500 and **no
customer ever receives credits**. The failure is safe (Stripe retries, no money is
lost silently) but the money path is dead until it is set.

- **Where:** app environment in Coolify
- **Value:** Stripe Dashboard → Developers → Webhooks → your endpoint → signing secret (`whsec_…`)
- **Check:** the endpoint must also be subscribed to `charge.dispute.created`, or the
  chargeback handler can never fire.

### 2.2 `NEXT_PUBLIC_APP_URL` at **build** time

Not just at runtime. `sitemap.ts` and `robots` bake this in when the image is built —
the committed build output currently shows `http://localhost:3000`, which means it was
unset during the last build.

- **Where:** Coolify build environment for the app
- **Value:** `https://pyrasuite.pyramedia.cloud`
- **Breaks without it:** Google is told your site lives on localhost.

---

## 3. Email — two separate systems

Confusing these is why password reset stayed broken. Full detail in
[`docs/EMAIL_SETUP.md`](docs/EMAIL_SETUP.md); the values are here.

### 3.1 App email (dunning + waitlist confirmation)

- **Where:** app environment
```
RESEND_API_KEY=re_...
EMAIL_FROM="PyraSuite <no-reply@pyramedia.cloud>"
```
- **Unset is fine.** The code logs what it would have sent and returns `skipped`.
  Nothing crashes. The invite flow does not depend on it — you copy links by hand.

### 3.2 Auth email (password reset) — **this is the one that is broken**

Password reset is sent by **Supabase**, not by this app. Verified: `recovery_sent_at`
is NULL for every user who has ever existed. No auth email has ever been sent.

- **Where:** the **Supabase service** in Coolify (not the app)
```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<the same Resend key>
SMTP_SENDER_NAME=PyraSuite
SMTP_ADMIN_EMAIL=no-reply@pyramedia.cloud
```
- Restart the Supabase service afterwards. Some Coolify templates prefix these
  `GOTRUE_SMTP_*` — match whatever that service already uses; the wrong prefix fails
  silently and looks identical to the current broken state.
- **Then set on the app:** `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true`. That un-hides the
  "forgot password" link, which is deliberately hidden while reset cannot work.
- **Check:** request a reset, then
  `SELECT email, recovery_sent_at FROM auth.users ORDER BY recovery_sent_at DESC NULLS LAST LIMIT 1;`
  A timestamp appearing is the proof.
- Also translate GoTrue's email templates — they are English-only and left-to-right,
  and this is the one message a locked-out Arabic customer must be able to read.

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
[ ] STRIPE_WEBHOOK_SECRET set in production          (§2.1)
[ ] charge.dispute.created subscribed                (§5.5)
[ ] NEXT_PUBLIC_APP_URL set at BUILD time            (§2.2)
[ ] Stripe portal default configuration saved        (§5.3)
[ ] Retry exhaustion set to "cancel"                 (§5.1)
[ ] node scripts/db/verify-invite-gate.js passes     (§4)
[x] Support channel live at /contact                 (§6.1)
[ ] Terms name an entity + refund position           (§6.2)
[ ] SMTP_* on the Supabase service                   (§3.2)  ← or accept: no password reset
[ ] Secrets rotated                                  (§7)
```

The first six are enough to invite people. The last four are what you owe them.
