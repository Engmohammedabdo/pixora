/**
 * The credits a waitlist signup is granted when their invite is redeemed.
 *
 * ── WHY THIS CONSTANT EXISTS ───────────────────────────────────────────────
 * The grant itself is NOT decided here. It is decided by the live database:
 * `system_settings.invite_gate.beta_credits`, read by `redeem_invite()`
 * (migration `035:201`) at redemption time and by `/api/admin/invites` when it
 * issues one. That is correct — the founder can change the grant without a
 * deploy.
 *
 * But the waitlist page is a PROMISE, and it is statically prerendered, so it
 * cannot read that row. Naming a number in Arabic and English copy therefore
 * creates a second source of truth whether we like it or not. The only question
 * is whether that second source is one constant with its provenance written
 * down, or two string literals in two message files that nobody will ever think
 * to check again.
 *
 * ── THE FAILURE THIS GUARDS ────────────────────────────────────────────────
 * Lower the DB value and the marketing page keeps promising the old, higher
 * number to everyone who lands on it. The customer signs up for 100 and gets
 * 50, and nothing in the product is wrong — only the promise is. That is a
 * refund conversation, not a bug report.
 *
 * So: one constant, interpolated into both locales, and
 * `npm run test:beta-credits` reads the LIVE row and fails if they disagree.
 * It needs the database, so it is not a build gate — same class as
 * `test:logo-parity` and `test:rate-limit`. Run it after changing either side.
 *
 * Verified equal to the live value on 2026-08-25:
 *   system_settings.invite_gate -> {"enabled": true, "beta_credits": 100}
 */
export const BETA_CREDITS = 100;
