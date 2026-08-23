# Email setup

**You already run a working mail server, and it is on your own Coolify box. Use it.
There is nothing to buy.**

> **Correction, 2026-08-23.** Every earlier version of this file sent you to cPanel to
> create the mailbox. That was the wrong machine, and following it would have produced
> credentials that cannot log in to the server this app actually talks to. The
> measurements below replace it. Ignore any older copy.

---

## 1. What is actually there — measured, not assumed

| | Address | What answered |
|---|---|---|
| **`mail.pyramedia.info`** | `72.61.148.81` | **Postfix**, `220 mail.pyramedia.info ESMTP` |
| `coolify.pyramedia.cloud` | `72.61.148.81` | the Coolify panel — **the same machine** |
| `pyrasuite.pyramedia.cloud` | `72.61.148.81` | the app — the same machine again |
| `pixoradb.pyramedia.cloud` | `72.61.148.81` | self-hosted Supabase — same machine |
| `webmail.pyramedia.info` | `162.241.218.109` | `box5557.bluehost.com`, **Exim** — a *different* machine |

**`mail.pyramedia.info` is your Coolify VPS.** The cPanel/Bluehost host is a separate
server that no longer receives this domain's mail:

```
MX pyramedia.info → mail.pyramedia.info → 72.61.148.81   (the Coolify box)
```

That is why the old instruction failed. A mailbox created in cPanel lives on Bluehost's
Exim at `162.241.218.109`; the app connects to `mail.pyramedia.info`, reaches Postfix on
the Coolify box, and those credentials mean nothing there. **Get the mailbox from
Coolify, not from cPanel.**

### The Postfix server's own answers

Port **587**, plaintext `EHLO`:

```
250-PIPELINING          250-SIZE 209715200     250-ETRN
250-STARTTLS            250-ENHANCEDSTATUSCODES
250-8BITMIME            250-DSN                250 CHUNKING
```

After `STARTTLS` — a valid certificate, `CN=mail.pyramedia.info` — the same `EHLO`
gains the line that matters:

```
250-AUTH PLAIN LOGIN
```

So: **AUTH is offered only after STARTTLS**, which is the correct and secure
arrangement, and it is exactly what `lib/email/client.ts` does on port 587
(`secure: false` + automatic STARTTLS upgrade).

**Port 465 is closed** on this host — it times out. An earlier version of this file
said 25, 465 and 587 were all open. Do not set `SMTP_PORT=465`; it will hang rather
than fail cleanly, which is the confusing failure mode. **Use 587.**

---

## 2. The constraint that decides everything: DMARC is `p=reject`

```
_dmarc.pyramedia.info
v=DMARC1; p=reject; rua=mailto:admin@pyramedia.info; ruf=mailto:admin@pyramedia.info; adkim=s; aspf=s
```

Read that carefully before changing any address, because it is stricter than most
domains and it fails *silently from the sender's side*:

- **`p=reject`** — mail that fails is **rejected by the receiver**, not delivered to
  spam. Nobody gets it, and the recipient never sees it to go looking. For an
  invite-only launch this is the entire funnel: a misaligned invite does not land in
  junk where the invitee might find it, it evaporates.
- **`aspf=s` (strict)** — the envelope sender's domain must be **exactly**
  `pyramedia.info`. A subdomain such as `support@mail.pyramedia.info` does **not**
  align and is rejected.
- **`adkim=s` (strict)** — the DKIM signature's `d=` must be **exactly**
  `pyramedia.info`, likewise no subdomain.

**Therefore `EMAIL_FROM` must be an address at the bare domain**, e.g.
`PyraSuite <support@pyramedia.info>`. This is not a style preference; anything else is
rejected mail.

### SPF already authorises the Coolify box, three times over

```
v=spf1 mx a:mail.pyramedia.info ip4:72.61.148.81 include:websitewelcome.com -all
       ^^                       ^^^^^^^^^^^^^^^^
       │                        └─ the Coolify box, named explicitly
       └─ resolves to mail.pyramedia.info → the same address
```

So sending from this server passes SPF with **no DNS change at all**.

### DKIM keys are published — but publication is not signing

Two selectors resolve:

```
default._domainkey.pyramedia.info   v=DKIM1; k=rsa; p=MIIBIjANBgkq…
mail._domainkey.pyramedia.info      v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkq…
```

A published public key proves only that *somebody* generated a keypair. It does **not**
prove Postfix on this box is loading the matching private key and signing outbound mail.
With `adkim=s` and `p=reject`, "DKIM is probably fine" is not good enough —
**§5 checks it against a real inbox** rather than inferring it from DNS.

---

## 3. Two systems, one set of credentials

| | Sent by | Configured on | Covers |
|---|---|---|---|
| **App email** | this Next.js app | the **app** service in Coolify | **password reset**, **invites**, payment-failure notice, waitlist confirmation |
| **Auth email** | Supabase Auth (GoTrue) | the **Supabase** service in Coolify | signup confirmation, magic link — neither of which this product uses |

**There is one place to configure**: the app service. §6 is optional — signup
confirmation is off (`mailer_autoconfirm: true`) and the magic-link control was removed
from the login page.

---

## 4. Get the mailbox and test it before configuring anything

The mailbox lives on the **Coolify** mail service, not cPanel. Open the mail service in
Coolify and read its environment / mailbox configuration for the account and password —
whatever the stack exposes (the address must be at `@pyramedia.info`; see §2).

Put them in your local `.env.local`:

```
SMTP_HOST=mail.pyramedia.info
SMTP_PORT=587
SMTP_USER=support@pyramedia.info
SMTP_PASS=<the mailbox password>
EMAIL_FROM="PyraSuite <support@pyramedia.info>"
```

The SMTP **username is the full address** — `support@pyramedia.info`, not `support`.
This is the single most common mistake and it fails as `535 authentication failed`.

First, check the parts that need no password — DNS, alignment and the TLS handshake:

```bash
npm run check:mail
```

It reads `EMAIL_FROM`/`SMTP_HOST` from `.env.local`, resolves DMARC the way a *receiver*
does (including the organisational-domain fallback, so a subdomain From is caught), and
fails on anything that would make `p=reject` bite. It sends nothing.

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

---

## 5. The check that actually matters — headers, not delivery

**A message arriving is not proof the configuration is right.** Your own provider may
accept mail that Gmail rejects, and with `p=reject` the failure is invisible from here.

Send to a **Gmail** address, open the message → ⋮ → **Show original**, and confirm all
three:

```
SPF:   PASS  with domain pyramedia.info
DKIM:  PASS  with domain pyramedia.info      ← d= must be the bare domain (adkim=s)
DMARC: PASS
```

- `DKIM: FAIL` or absent → Postfix is not signing. The keys in DNS do not sign anything
  by themselves; OpenDKIM must be configured on the mail service with the private key
  for the `mail` selector. **Fix this before announcing**, because SPF alone will not
  save a forwarded message, and `p=reject` turns that into a rejection.
- `DKIM: PASS` but with `d=mail.pyramedia.info` → strict alignment fails. The signing
  domain must be `pyramedia.info`.
- If the message never arrives at all, read the app logs before touching DNS: an
  `[email]` line says whether the app tried and the server refused (the reason is
  logged verbatim) or whether nothing is configured.

---

## 6. Auth email — optional, and not what unlocks password reset

> Password reset moved into the app in the 2026-08-23 change; setting SMTP on the app
> service (§4) is all it needs. An earlier version of this file sent you here instead.

What GoTrue still owns: **signup confirmation** and **magic link**. Neither is in use —
`/auth/v1/settings` reports `mailer_autoconfirm: true`, and the magic-link control was
removed from the login page. Configure this only if you want one of those back.

If you do, set the same credentials from §4 on the **Supabase** service in Coolify:

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

An earlier version of this file said a timestamp in `auth.users.recovery_sent_at`
proves SMTP is wired. **It proves nothing.** That column is also stamped by
`auth.admin.generateLink()`, which sends no mail at all — the app's own reset route
calls it on every request, and so does any maintenance script. It records "a recovery
token was minted", not "a message left the building". Read the app logs instead:
`POST /api/auth/recover` logs `[recover] REACHABLE CUSTOMER NOT REACHED` with the
transport's own error whenever a link was generated and the send failed.

---

## 7. What the app sends

**Invite** — the message the invite-only launch runs on. `/api/admin/invites` mints the
token and mails the link in the invitee's own language, then **reports per address
whether the send succeeded**. An invite that was issued but not delivered is called out
explicitly in the admin UI, because the seat is open and its owner has not been told.
With no mail backend configured the invite is still issued and the panel says so, so
copying the link by hand remains a complete fallback.

**Password reset** — the link a locked-out customer clicks. The app calls
`auth.admin.generateLink({ type: 'recovery' })`, which mints a real token and sends
nothing, then puts that token in its own Arabic-first email. Two implementation facts
worth knowing before changing any of it, both found by testing rather than reading:

- GoTrue builds its `action_link` from `API_EXTERNAL_URL`, which on this deployment is
  the **internal** docker host `http://supabase-kong:8000` — dead in any inbox. The
  route therefore ignores `action_link` and builds a link to our own
  `/[locale]/reset-password` carrying `properties.hashed_token`.
- `@supabase/ssr` hard-codes `flowType: 'pkce'`, so the implicit-flow fragment GoTrue's
  verify endpoint redirects with is **rejected** by our own client. The reset page
  redeems the token with `verifyOtp({ token_hash, type: 'recovery' })` instead, which
  does not care about flow type and still writes the session to cookies.

**Waitlist confirmation** — on a genuinely new signup only. Migration 034 lets the
server tell a new signup from a repeat one while the HTTP response stays
byte-identical, so the form still cannot be used to check whether an address is on the
list.

**Payment failed** — on the healthy→failed transition **once**. Stripe's smart retries
fire that event once per attempt over roughly three weeks; mailing on every one is how
a recoverable card problem turns into an unsubscribe.

### What it deliberately does not send

**Receipts** — Stripe already emails one on every successful charge and hosts the
invoice PDF. Turn on "Successful payments" in the Stripe Dashboard instead of building
a second, worse receipt. **Dunning reminders** — Stripe Smart Retries sends those.

---

## 8. End-to-end check

```bash
curl -s -X POST https://pyrasuite.pyramedia.cloud/api/waitlist -H 'Content-Type: application/json' -d '{"email":"you@gmail.com","locale":"ar","source":"smtp-test"}'
```

Then clean up the test row:

```bash
node scripts/db/apply.js --check "DELETE FROM waitlist WHERE source='smtp-test'"
```

### And the one that matters most

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://pyrasuite.pyramedia.cloud/api/auth/recover -H 'Content-Type: application/json' -d '{"email":"you@your-real-account.com","locale":"ar"}'
```

- `503` — the app has no mail backend; `EMAIL_FROM` plus `SMTP_HOST` are not both set on
  the app service. Nothing was attempted and nobody's rate limit was spent.
- `200` — accepted. It says the same thing for an address with no account, on purpose,
  so a stranger cannot use this endpoint to discover who your customers are. That is
  also why the only way to know a real send failed is the log line, not the response.
- `429` — you have already asked three times for that address this hour.

Then open the link that arrives. It should land on `/[locale]/reset-password` and show
the password form. If it shows "الرابط ده مش شغال" the token was already used or
expired — request a fresh one; each link works exactly once.

---

## The honest trade-off, and when to revisit

This is a single self-hosted Postfix on a VPS that also runs the app and the database.
Its sending reputation is entirely your own — there is no shared pool to hide in, which
cuts both ways: nobody else's spam can hurt you, and nothing but your own good behaviour
helps you. At the volume of a waitlist and an invited cohort, transactional and
low-volume, that is the easy case.

Revisit if you are sending thousands a day, or you see messages failing DMARC despite a
correct configuration. Because `lib/email/client.ts` picks its backend from the
environment, switching is an env change, not a code change: clear `SMTP_HOST`, set
`RESEND_API_KEY`, verify `pyramedia.info` in the provider (**including DKIM at the bare
domain — `adkim=s` leaves no room**), and set `EMAIL_REPLY_TO` so replies still reach
you.
