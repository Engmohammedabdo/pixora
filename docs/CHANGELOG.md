# Changelog

Dated record of what shipped. Every entry names the files that prove it.

The convention here is deliberate: **an entry is only written after the change is
verified**, and the verification is stated. This repo has a documented history of
marking work complete before it worked — `FIXPLAN.md:19` marks "Stripe webhook —
no idempotency protection" as done, and that same handler turned out to be the
worst defect in the money path.

---

## 2026-07-21 — Money path hardened, waitlist live

### Fixed: paid customers were not receiving credits

The Stripe webhook made 23 database writes and checked the result of none of
them. `supabase-js` resolves with `{ data, error }` instead of throwing, so the
surrounding `try/catch` never fired on a database failure. Execution continued to
the `processed: true` marker, the route returned 200, and Stripe — seeing a
successful delivery — never retried. The customer had paid and received nothing,
with no error anywhere and no way to replay the event.

Critical writes now go through a `mustSucceed` helper that throws on error, so
the failure reaches the catch block, returns 500, and Stripe retries.

`app/api/stripe/webhook/route.ts` — 10 critical writes guarded.

### Fixed: upgrading created a second parallel subscription

`create-checkout` opened a new `mode: 'subscription'` session with no check for
an existing one. Stripe creates a second subscription rather than replacing the
first, so a Starter subscriber who clicked Pro was billed $12 + $29 = $41/month.
The webhook then overwrote the stored subscription id, leaving the original
billing forever with no way to cancel it from the app.

Now returns 409 with a message and a link to the billing portal.

`app/api/stripe/create-checkout/route.ts`, `app/[locale]/(dashboard)/billing/page.tsx`

### Fixed: a full month of credits on any subscription update

`customer.subscription.updated` fires for payment-method edits, trial changes and
cancel-at-period-end — not just plan changes. The handler granted a full month of
credits on every one of them, and read the plan from `metadata`, which Stripe does
not update when a subscription item changes.

Now reads the plan from the price, requires an `active`/`trialing` status, and
skips the grant when the tier has not actually changed.

### Fixed: credits granted before payment settled

`checkout.session.completed` fires while a delayed payment method is still
pending. Now requires `payment_status === 'paid'`.

### Removed: annual billing

All four annual price ids were `price_*_annual_placeholder`, and the env vars
were absent even from `.env.local.example` — so every annual checkout returned
500 while a "save 18%" badge advertised it on an indexed public page. Worse, the
renewal handler is tied to the Stripe billing cycle, so a correctly configured
annual subscriber would have paid for a year and received one month of credits.

Removed entirely rather than half-fixed: config, API field, and both UI toggles.
Zero references remain.

### Added: pre-launch waitlist

`/[locale]/waitlist` (ar + en, static) collects interested emails while the rest
of the product is finished. It promises nothing the product cannot do — no
pricing, no "try it now", no feature claims.

Security shape:
- Reads are server-only. The public key cannot enumerate the list; a leaked email
  list is a real breach, not an embarrassment.
- Writes go through a `SECURITY DEFINER` RPC accepting exactly four fields,
  rather than a table-level INSERT grant.
- Rate limited to 5/minute per IP, plus a honeypot field.
- A repeat signup returns the same response as a new one, so the form cannot be
  used to test whether a given address is on the list.

`supabase/migrations/030_waitlist.sql`, `app/api/waitlist/route.ts`,
`components/landing/WaitlistForm.tsx`

**Verified end to end against production:** signup returns 200 and stores exactly
one row; a repeat signup in different case updates that row instead of
duplicating it; an Arabic name round-trips intact; honeypot submissions are
accepted with a normal 200 and never stored; `anon` can neither read the table
nor call the RPC.

### Fixed: the honeypot announced itself

The Zod field was `.max(0)`, so a filled honeypot failed validation and returned
400 — telling a bot exactly which field caught it, which is the one thing a
honeypot must never do. It now accepts the value and discards the submission with
an ordinary 200.

### Added: migration runner and ledger

Port 5432 is closed to the internet (correct) and no `exec_sql` RPC exists, but
this self-hosted deployment exposes pg-meta's `/pg/query` through Kong. The
runner uses it, reading the service-role key from `.env.local` rather than argv
so it cannot reach shell history. `scripts/db/` is gitignored.

It refuses a migration whose version is already in `schema_migrations`. That
check paid for itself immediately: the waitlist migration was numbered 026, but
`026_referral_abuse_controls.sql` was already applied in production — and the
ledger writes use `ON CONFLICT DO UPDATE`, so applying it would have silently
overwritten the record of that migration. Renumbered to 030.

---

## Verified state of production (2026-07-21)

Read directly from the database, not inferred:

| Check | Result |
|-------|--------|
| Migrations recorded | 022–030 |
| `authenticated` can execute `deduct_credits` / `refund_credits` | **no** |
| `authenticated` can INSERT into `projects` | **no** |
| Self-referencing `team_members` policies (the 42P17 recursion) | **0** |
| Integrity trigger on `generations` | present |
| Public tables without RLS | **0** |

The 42P17 recursion that made every read of `projects`, `teams` and
`team_members` fail is resolved — those tables now respond normally.

---

## Known open items

Ordered by what blocks revenue first. Detail in the audit report.

1. **Transactional email** — none at all. Password reset is broken in production
   today, and this blocks team invites, receipts and payment-failure notices.
2. **Support channel** — no contact page, no support email, no widget. An error
   message tells the user to "contact support" with no way to do so.
3. **Tax invoice, VAT, refund handling** — blocks selling to Gulf companies.
4. **Admin panel stored XSS** — `components/admin/ExpandableRow.tsx` injects
   unescaped user-controlled JSON via `dangerouslySetInnerHTML`, executing in the
   admin session.
5. **Exposed credentials** — the service-role key and database password remain in
   git history and the repository is public. See `docs/ROTATE_SECRETS.md`.
