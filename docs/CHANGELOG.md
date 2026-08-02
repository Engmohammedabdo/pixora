# Changelog

Dated record of what shipped. Every entry names the files that prove it.

The convention here is deliberate: **an entry is only written after the change is
verified**, and the verification is stated. This repo has a documented history of
marking work complete before it worked — `FIXPLAN.md:19` marks "Stripe webhook —
no idempotency protection" as done, and that same handler turned out to be the
worst defect in the money path.

---

## 2026-08-02 — Money path, round two

Round one stopped the app losing money on a payment that **succeeded**. This round
covers what happens when a payment is delivered twice, stops arriving, or is taken
back — and makes the billing screen tell the truth while it happens.

Found by a 32-agent audit in which every claimed defect was handed to an independent
agent instructed to refute it. Nine of the twenty-one raised were killed that way,
including two I had already started building against. What follows is what survived.

### Fixed: one top-up delivered twice granted the credits twice

The top-up handler read `purchased_credits`, added to it in Node, and wrote the sum
back — no row lock, no idempotency key on the money. Every other grant in the file
assigns absolutely (`credits_balance = <plan amount>`) and so is replay-safe; this
one was not. Stripe delivers at least once, and the route deliberately re-runs an
event whose row exists but is not yet marked processed. One $59.99 purchase
delivered twice granted 2000 credits.

Now a single RPC in one transaction, keyed on the Stripe payment intent, with a
partial unique index that makes a second grant impossible even under a concurrent
race. The same RPC also fixes `balance_after`, which omitted every previously
purchased credit.

`supabase/migrations/031_grant_purchased_credits.sql`, `app/api/stripe/webhook/route.ts`

**Verified against the live database:** the same event replayed after forcing the
retry condition grants 500 credits once, writes one ledger row, and records
`balance_after` 513 (13 monthly + 500 purchased). Server log:
`top-up for session cs_test_1 was already granted — replay ignored`.

### Fixed: a monthly cron refilled accounts that had stopped paying

`reset_monthly_credits()` selected on `credits_reset_date <= NOW() AND plan_id !=
'free'`. A plan name and a date — no payment state at all. The job is live
(`cron.job` jobid 1, monthly), so an account sitting in Stripe's ~3-week dunning
window, or one that had disputed its charge, was written back up to a full 5000
Agency credits on the 1st of every month, indefinitely.

Now skips any account flagged `payment_failed`. Credits already granted for a month
that *was* paid for stay spendable; no new month is issued until payment recovers,
which happens automatically since the webhook clears the flag on every success.

`supabase/migrations/032_reset_credits_payment_guard.sql`

### Fixed: nothing downgraded a subscriber who stopped paying

`customer.subscription.deleted` was the only exit from a paid plan, and Stripe only
sends it when the dashboard's retry-exhaustion action is "cancel". Under "mark
unpaid" or "leave past due" the subscription object simply changes status, `deleted`
never arrives, and `plan_id` stays on the paid tier forever — while `create-checkout`
still 409s the customer as an existing subscriber.

Added a status branch for `unpaid`, `canceled` and `paused`, sharing one
`downgradeToFree()` with the cancel path so the two cannot drift. `past_due` is
deliberately excluded: that is a soft decline inside the retry window, and the cron
guard above already stops new credits reaching it.

**Verified:** `status: "past_due"` leaves an Agency account untouched;
`status: "unpaid"` downgrades it to free/25, clears the subscription id, and keeps
the customer's separately-purchased credits.

### Added: a dispute is now handled at all

A chargeback fires none of the handled events — the invoice stays `paid` on Stripe's
side, so `invoice.payment_failed` never comes and the subscription keeps cycling. The
account kept its paid tier while the money had already been pulled back plus a fee.

`charge.dispute.created` now resolves the charge to a customer, logs the dispute
loudly, and downgrades.

> Requires `charge.dispute.created` to be enabled on the webhook endpoint in the
> Stripe Dashboard. The handler cannot fire if the endpoint is not subscribed to it.

### Fixed: refunds destroyed credits the customer had bought

`refund_credits` always returned credits to `credits_balance`, whatever pool the
spend actually drew on. That column is overwritten wholesale at five sites, so a
credit **bought for money** and refunded after a failed generation was deleted at the
next renewal. The exposure is `reconcile_orphaned_generations()` (cron jobid 2, every
15 minutes), which refunds stranded generations in bulk while the customer is offline
and cannot re-spend before the overwrite lands.

Usage rows now record which pool each spend came from, and a refund goes back the
same way. Repeated partial refunds — campaign refunds per failed image — are capped
cumulatively so they cannot mint purchased credits out of monthly ones. Rows written
before the migration have NULL splits and fall back to the old behaviour, so no
backfill was needed.

`supabase/migrations/033_refund_to_source_pool.sql`

**Verified:** twelve assertions run against the live database inside a rolled-back
transaction (`scripts/db/tests/money-path.sql`), covering purchased-only, mixed,
three-way partial, and expired-pool refunds.

### Fixed: `payment_failed` was written by the webhook and read by nothing

The flag had zero readers outside the type definition. A customer whose card declined
experienced no in-app change whatsoever, then was silently downgraded weeks later.

It now drives two things: the cron guard above, and a red dashboard banner with a
one-click route to the billing portal. With no transactional email in the product,
that banner plus Stripe's own dunning emails are the entire notification path.

`components/shared/PaymentFailedBanner.tsx`, `app/api/credits/balance/route.ts`

### Fixed: the screen a customer sees right after paying

The billing page rendered "Success!" from the URL parameter alone, over a profile
read once at mount and never invalidated by the webhook. A customer returning from a
$29 checkout could see a green success banner above a `Free` badge, a `1000 / 25`
balance, and no Manage Subscription button — until they thought to reload.

The plan now comes from the server via the balance poll the layout already runs, so
the badge, the denominator, the plan cards and the portal button all heal within 30s.
While the plan is still settling, the banner is amber and honest — "payment received,
activating your plan" — and every plan card is inert so a paid customer cannot open a
second checkout.

### Fixed: three ways the billing screen was lying or unreachable

- **The portal button was gated on the plan**, so a customer who had only ever bought
  top-ups — and a churned subscriber — were locked out of their own receipts and
  payment history. It is now gated on having a Stripe customer, which is what the
  route actually checks, and relabels to "الفواتير وطريقة الدفع" for non-subscribers.
- **Every Stripe route returned English customers to the Arabic page.** The portal
  hardcoded `/ar/billing`; checkout and top-up *looked* correct but read
  `profiles.locale` — a column declared in migration 001 and written by nothing, so
  it was always `'ar'`. The caller's real locale is now passed in the request.
- **Raw error codes were shown to customers.** `toast.error(data.error || t('…'))`
  never reached the fallback, because these routes always populate `error` — so an
  Arabic customer saw the literal token `portal_failed` in an RTL page.

### Removed: a fake ledger row on every failed payment

`invoice.payment_failed` wrote `amount: 0, type: 'reset', balance_after: 0` without
reading the profile. `TransactionTable` renders that type as a red "Monthly reset — 0"
row — one per Stripe retry attempt, directly above a widget showing the customer's
real balance. A payment failure is not a credit transaction.

### Also

- The webhook's `processed: true` marker is now checked like every other write. Left
  unchecked, the route returned 200 while `processed` stayed false, and the next
  at-least-once delivery ran the handler again.
- `credits_balance: 25` on downgrade now reads `getCreditsForPlan('free')`.
- Subscription events with no `userId` in metadata now log a warning instead of
  vanishing — that is what a subscription created in the Stripe Dashboard looks like.
- Dead `annual` / `save18` / `billingCycle` translation keys removed, left behind when
  annual billing was deleted.

### Still not done — deliberately

Tax invoices, VAT and `tax_id_collection` remain absent, and that is correct: below
the AED 375,000 threshold the business has no TRN and **may not issue a document
stating VAT**. Shipping `tax_id_collection` alone would produce a non-compliant
invoice. This becomes real work at registration, not before.

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
