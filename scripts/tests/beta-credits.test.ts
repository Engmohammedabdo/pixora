/**
 * The number the waitlist page PROMISES must equal the number the database GRANTS.
 *
 *   npm run test:beta-credits
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The grant is decided by `system_settings.invite_gate.beta_credits`, read by
 * `redeem_invite()` (migration `035:201`) at redemption time. The waitlist page
 * is statically prerendered, so it cannot read that row — it interpolates
 * `BETA_CREDITS` from `lib/credits/beta.ts` into copy in two locales.
 *
 * Two sources of truth for one number, and only one of them is enforced by
 * anything. Lower the database value and the marketing page keeps promising the
 * old figure to every visitor: the customer signs up expecting 100 and receives
 * 50, with nothing in the product technically wrong. That is a refund
 * conversation, and it is exactly the class of defect this repo keeps
 * cataloguing — a claim that outlived the thing it described.
 *
 * ── WHY THIS IS NOT A BUILD GATE ───────────────────────────────────────────
 * It reads the live database, so it cannot run in `prebuild` on a machine with
 * no credentials, and a build must not fail because a network hop did. Same
 * class as `test:logo-parity` and `test:rate-limit`. Run it after changing
 * either side of the number.
 *
 * A missing key, an unreadable row or a non-numeric value all FAIL. "I could not
 * check" is not "they agree" — a probe that cannot reach a verdict certifies
 * nothing, which is the rule this repo already applies to migration probes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BETA_CREDITS } from '../../lib/credits/beta';

const ROOT = join(__dirname, '..', '..');

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail?: string): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

function readEnv(key: string): string | null {
  try {
    const src = readFileSync(join(ROOT, '.env.local'), 'utf8');
    const m = src.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  // ── 1. The constant itself is sane, checkable without any network ────────
  check('BETA_CREDITS is a positive integer', Number.isInteger(BETA_CREDITS) && BETA_CREDITS > 0,
    `got ${String(BETA_CREDITS)}`);

  // ── 2. Both locales interpolate it rather than hardcoding a figure ───────
  // A literal "100" in the copy passes every other gate in this repo and is
  // precisely what this file exists to prevent, so it is checked as text.
  for (const locale of ['ar', 'en']) {
    const raw = readFileSync(join(ROOT, 'messages', `${locale}.json`), 'utf8');
    const messages = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const waitlist = messages.waitlist as Record<string, string>;
    const landing = messages.landing as Record<string, Record<string, string>>;

    const carriers: [string, string][] = [
      [`waitlist.giftBadge`, waitlist.giftBadge],
      [`waitlist.bonusCredits`, waitlist.bonusCredits],
      [`landing.hero.giftNote`, landing.hero.giftNote],
      [`landing.cta.giftNote`, landing.cta.giftNote],
    ];

    for (const [key, value] of carriers) {
      check(`${locale}: ${key} exists`, typeof value === 'string' && value.length > 0);
      if (typeof value !== 'string') continue;
      check(`${locale}: ${key} interpolates {credits}`, value.includes('{credits}'),
        `"${value}" — a hardcoded number here cannot be kept in step with the grant`);
      check(`${locale}: ${key} carries no literal credit figure`, !/\d{2,}/.test(value),
        `"${value}" contains a bare number`);
    }
  }

  // ── 3. The live database agrees. This is the whole point of the file ─────
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  check('.env.local carries NEXT_PUBLIC_SUPABASE_URL', !!url);
  check('.env.local carries SUPABASE_SERVICE_ROLE_KEY', !!serviceKey);
  if (!url || !serviceKey) {
    console.log('\n[beta-credits] cannot reach the database — treating as FAILURE, not as a pass.');
    console.log(`[beta-credits] ${checks - failures}/${checks}`);
    process.exit(1);
  }

  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/system_settings?key=eq.invite_gate&select=value`;
  let live: number | null = null;
  let detail = '';
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) {
      detail = `HTTP ${res.status}`;
    } else {
      const rows = (await res.json()) as { value?: { beta_credits?: unknown } }[];
      if (!rows.length) {
        detail = 'no system_settings row with key = invite_gate';
      } else {
        const raw = rows[0]?.value?.beta_credits;
        if (typeof raw === 'number') live = raw;
        else detail = `beta_credits is ${JSON.stringify(raw)}, not a number`;
      }
    }
  } catch (e) {
    detail = String((e as Error).message ?? e);
  }

  check('the live invite_gate row was read', live !== null, detail);
  if (live !== null) {
    check(`the promise (${BETA_CREDITS}) equals the grant (${live})`, live === BETA_CREDITS,
      'lib/credits/beta.ts and system_settings.invite_gate.beta_credits disagree — ' +
        'the waitlist page is promising a number the database will not grant');
  }

  console.log(`\n[beta-credits] ${checks - failures}/${checks}`);
  process.exit(failures > 0 ? 1 : 0);
}

void main();
