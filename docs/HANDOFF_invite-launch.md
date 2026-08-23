# Handoff: switching on the invite-only launch

> ## ✅ RESOLVED 2026-08-23 — mail is live, the code is deployed
>
> The Coolify API token arrived and every open item below was closed. Kept as the record
> of *how*, because the DMARC constraint in §2 and the mail-host correction still decide
> anything you do to email later.
>
> **What actually happened, and what was wrong in the plan below:**
>
> - **`support@` was not used.** A dedicated `not-reply@pyramedia.info` mailbox was
>   created instead, with `EMAIL_REPLY_TO=support@pyramedia.info` so replies to an invite
>   still reach a human. Both are at the bare domain, so §2 is satisfied.
> - **The mailbox password is NOT readable from Coolify**, contrary to step 1 below.
>   `docker-mailserver` stores SHA-512 hashes on a volume and the service exposes no env
>   vars at all. A password can only be *set*: `setup email add|update <addr> <pass>`
>   inside the `mailserver` container.
> - **DKIM signing is proved, not assumed** (step 3): `opendkim: DKIM-Signature field
>   added (s=mail, d=pyramedia.info)` — the bare domain, which is what `adkim=s`
>   requires — followed by `status=sent (250 … gsmtp)` from Gmail, for a message sent by
>   the production container. The server is also **not** an open relay.
> - **`REPLICATE_API_TOKEN` (step 5) was not filled in.** The router now filters out any
>   provider without usable credentials before the first network call, so the empty token
>   costs nothing instead of a dead 2.5s stop whose error masked the real failure.
> - **`git push` does NOT deploy.** Coolify's GitHub webhook is not firing — every
>   deployment record is `is_webhook: false`. Trigger the deploy explicitly.
> - **Still open by the founder's decision:** the admin password is unrotated, and the
>   new mailbox password is weak on an internet-facing port 587.
>
> A separate audit run the same day found the launch's real blocker, which is not in this
> document at all: every locale-less URL (`/login`, `/pricing`) was an infinite redirect
> loop in production. See the "Launch readiness" section of `CLAUDE.md`.

---

## The one blocker (historical — resolved)

`coolify.pyramedia.cloud` (→ `72.61.148.81`) answers, but its API returns
`{"message":"Unauthenticated."}` and SSH refuses the only key on this machine:

```
ssh -i ~/.ssh/hermes_pyra_vps_memory root@72.61.148.81
→ Permission denied (publickey,password)
```

That key works on a *different* VPS (`72.61.255.111`, the Hostinger box running
openclaw/hermes/ollama). It is not authorised on the Coolify server.

So: **ask the founder for a Coolify API token**, or have them add this key to
`/root/.ssh/authorized_keys` on `72.61.148.81`:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBwqLhcLUT16EKocdFARBR8+lVnxm6EAKy4xwi6DH2fM hermes-pyra-vps-memory-link
```

---

## Before you touch mail: the constraint that decides everything

```
_dmarc.pyramedia.info
v=DMARC1; p=reject; rua=mailto:admin@pyramedia.info; ruf=mailto:admin@pyramedia.info; adkim=s; aspf=s
```

`p=reject` with **strict** alignment on both SPF and DKIM. A From address on a
*subdomain* passes SPF, passes DKIM, and is **rejected by the receiver** — not
spam-foldered. The sender sees success; the invitee never sees anything. For a launch
whose entire funnel is one email, this is the failure mode to design against.

**Therefore `EMAIL_FROM` must be at the bare domain:** `PyraSuite <support@pyramedia.info>`.

### The mail server is on Coolify, not cPanel

Every version of `docs/EMAIL_SETUP.md` before 2026-08-23 said cPanel. It was wrong, and
following it produces credentials that cannot log in to the server the app dials.

| Host | IP | What answers |
|---|---|---|
| `mail.pyramedia.info` | `72.61.148.81` | **Postfix on the Coolify VPS** — also the MX for the domain |
| `coolify.pyramedia.cloud` | `72.61.148.81` | the Coolify panel — same machine |
| `pyrasuite.pyramedia.cloud` | `72.61.148.81` | the app — same machine |
| `pixoradb.pyramedia.cloud` | `72.61.148.81` | self-hosted Supabase — same machine |
| `webmail.pyramedia.info` | `162.241.218.109` | `box5557.bluehost.com`, **Exim** — a *different* server |

Measured on `mail.pyramedia.info:587`: Postfix, STARTTLS, valid cert
`CN=mail.pyramedia.info`, and `AUTH PLAIN LOGIN` offered **only after STARTTLS** (correct
and secure). **Port 465 is closed** — it times out rather than failing cleanly, which is
the confusing failure mode. Use 587.

SPF already authorises the box three ways over
(`v=spf1 mx a:mail.pyramedia.info ip4:72.61.148.81 include:websitewelcome.com -all`), so
**no DNS change is needed**.

DKIM public keys are published at selectors `mail` and `default`. **Publication is not
signing** — it only proves somebody generated a keypair. Under `adkim=s` + `p=reject`
that must be confirmed from a real inbox, never inferred from DNS. See step 3.

---

## Open items, in order

### 1. Get the mailbox credentials from Coolify

Open the mail service in Coolify and read its environment / mailbox config. The address
must be at `@pyramedia.info` (see the DMARC note above). Put them in `.env.local`:

```
SMTP_HOST=mail.pyramedia.info
SMTP_PORT=587
SMTP_USER=support@pyramedia.info
SMTP_PASS=<the mailbox password>
EMAIL_FROM="PyraSuite <support@pyramedia.info>"
```

`SMTP_USER` is the **full address**. `support` alone fails as `535 authentication failed`.

### 2. Preflight, then send

```bash
npm run check:mail
```

Checks DNS, DMARC alignment (resolving it the way a *receiver* does, including the
organisational-domain fallback) and the TLS/AUTH handshake. Sends nothing, needs no
password. Currently reports all-pass for the config above, with one standing warning it
cannot resolve on its own — that DKIM signing is unproven.

```bash
npx tsx scripts/db/test-smtp.js you@gmail.com
```

Sends one real message through `lib/email/client.ts` — the same code production runs.

### 3. Prove DKIM signing from a real inbox — do not skip this

Send to **Gmail**, open the message → ⋮ → **Show original**, confirm all three:

```
SPF:   PASS  with domain pyramedia.info
DKIM:  PASS  with domain pyramedia.info     ← d= must be the BARE domain (adkim=s)
DMARC: PASS
```

`DKIM: FAIL`/absent means Postfix is not signing — OpenDKIM needs the private key for the
`mail` selector. Fix it **before announcing**: SPF alone does not survive a forwarded
message, and `p=reject` turns that into a rejection nobody can see.

### 4. Set the same five variables on the **app** service in Coolify, redeploy

Then verify against production:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://pyrasuite.pyramedia.cloud/api/auth/recover -H 'Content-Type: application/json' -d '{"email":"you@your-real-account.com","locale":"ar"}'
```

`503` = still no backend. `200` = accepted (it says the same for an unknown address, on
purpose — it must not leak who the customers are). Today it returns **503**.

### 5. `REPLICATE_API_TOKEN` is present but EMPTY

`generateFlux` returns a mock, which `rejectMockInProduction` (`lib/ai/router.ts:110`)
throws on. The image fallback chain is effectively **gemini → gpt → dead**, and every
attempt that reaches flux burns ~2.5s first. Either set a real token or accept the
two-model chain knowingly.

### 6. Decisions the founder must make (do NOT do these unprompted)

- **Admin password.** Username `admin` with a weak, guessable password. That panel issues
  invites, adjusts any user's credits, bans users and reads every email address. Highest-
  value unrotated credential. See `docs/ROTATE_SECRETS.md`.
- **Stripe stays LIVE.** Asked and answered 2026-08-23: the invited cohort is meant to pay
  from day one. Every test purchase charges a real card — that is intended, not an
  oversight.
- **Deploying.** Not done in this session by design.

---

## What was built (all merged, all verified)

### Invite delivery — `a92369c`

The gate itself was already live and correct. `invite_gate_status()` on production returns
`installed: true, enabled: true`, and refusal is a BEFORE INSERT trigger on `auth.users`
(migrations 035/036) — an AFTER trigger would leave half-created accounts behind.

What was missing was delivery: the admin panel minted a token and showed the founder a
link, and sending it was manual. Now:

- `inviteEmail(locale, url, credits)` in `lib/email/templates.ts` — ar/en, RTL, states the
  beta-credit grant, says the link is single-use and personal, and promises **no expiry**
  (invite tokens have none in the schema; writing "expires in 7 days" would be a lie the
  database does not enforce).
- `sendInviteEmail()` in `lib/email/send.ts` — builds the URL from
  `NEXT_PUBLIC_APP_URL`, never from caller input.
- `POST /api/admin/invites` issues, then mails at concurrency 4, and reports **per address**
  whether the send landed.

**The one design rule worth preserving:** `sent` is a separate axis from `error`.
Issued-but-not-delivered is surfaced in the UI as its own error with a 15s toast, because
the seat is open and its owner has not been told — and that is the only state the founder
can act on. `isEmailConfigured()` is checked once **before** any send, so an unconfigured
deployment reports `skipped` for the whole batch rather than discovering it 40 sends in and
leaving a batch half-delivered with no way to tell which half.

Resend reuses `issue_invite`, which is idempotent — the same token, never a second one that
would silently break the link already sent.

### Text-studio retrieval — same commit

`plan` (5cr), `analysis` (3cr) and `storyboard` (14cr) wrote their result **only** into
`generations.output`, and every read of that column lived under `/app/admin/`. Closing the
tab destroyed paid work, with no warning and no way back.

- `GET /api/generations` — metadata only, `TEXT_STUDIOS` only, `status = completed`.
- `GET /api/generations/[id]` — one row's output.
- `components/shared/RecentWork.tsx` — renders nothing until it has something to show.

**Why the detail route refuses the image studios:** measured on the live table, `output`
averages 904 kB for creator, 921 kB for edit and 2.8 MB for photoshoot — they embed base64
image data. Those files are already retrievable through `assets`. Serving them here would
be a multi-megabyte response duplicating a better surface.

**Why not-found and not-yours answer identically (404):** RLS makes another user's row
invisible, so the query returns nothing either way. Reporting 403 for the second case would
turn the route into an oracle for which generation ids exist.

Nothing was lost in practice — those three studios had **zero rows** when this was found.

### Also fixed

The shared email layout told every recipient "you have a PyraSuite account" — including the
waitlist confirmation and the invite, neither of whose recipients has one. `layout()` now
takes a `reason` per template.

### `npm run check:mail` — `scripts/check-mail-dns.js`

Deliberately **not** under `scripts/db/`, which is gitignored — this needs to ship.

**A bug in it is worth knowing about, because it is easy to reintroduce:** the first version
looked up `_dmarc.<from-domain>` only. DMARC falls back to the *organisational* domain when
the subdomain has no record — so for `support@mail.pyramedia.info` it found no policy,
concluded alignment was relaxed, and downgraded **the exact failure it exists to catch**
into a warning. It now resolves the way a receiver does, and honours `sp=`. Caught by
running it against a subdomain address rather than by reading it.

---

## How this was verified

Not by reading code. Against the live database, through the real signup form, with a real
browser session:

1. `issue_invite('e2e-recentwork-test@example.com')` → token
2. Signed up through the actual form at `/ar/signup?invite=…`
3. Account created, invite marked redeemed, **100 beta credits** granted to
   `purchased_credits` (not `credits_balance`, which the monthly cron overwrites), 125 total
   shown in the UI
4. Seeded a completed `plan` row → listed by `RecentWork` → clicked → restored into the page
5. Boundaries, all as `authenticated` over a real session:
   - own image generation → `400 unsupported_studio` (46 bytes, not 3 MB)
   - another user's row → `404 not_found`
   - malformed id → `404`, not raw driver text
   - unfiltered list → excludes image rows
6. Test account and all rows deleted; `invite_gate_status()` reads identical to before
   (`waiting: 1, invited: 0, redeemed: 0`)

Gates: `tsc` clean, `lint` clean, invariants 12/12, `[safety] 65`, `[uploaded-url] 37`,
production build clean with both new routes present.

**Note on tooling:** the in-app browser pane was not compositing during this session
(screenshots time out, `read_page` returns an empty tree, and DOM reads went stale while
React was demonstrably rendering). Playwright was reliable. If DOM assertions contradict
console evidence, suspect the pane before suspecting the code.
