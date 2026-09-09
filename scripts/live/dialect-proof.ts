/**
 * DOES THE DIALECT REACH THE CAPTIONS?
 *
 * `docs/POSITIONING.md` §3 makes the campaign studio the front door and the free
 * tier the proof: a text-only campaign costs 3 credits against the free plan's 25,
 * so a stranger gets EIGHT nine-post Arabic campaigns a month with no card. That
 * sentence is the strongest true claim available — and it is only worth saying if
 * the Arabic that comes back actually reads like the dialect the customer picked.
 *
 * Nobody had ever checked. The dialect reaches the model as ONE English hint
 * (`app/api/studios/campaign/route.ts` DIALECTS -> `guideline`), the run is billed,
 * and no test in the repo reads a caption. `test:prompts` pins the WORDING of the
 * prompt, which is a different claim: it proves what we ask for, never what comes
 * back.
 *
 * So this spends 9 credits (3 runs x 3 credits, images OFF) and PRINTS THE CAPTIONS
 * for a human to read. It asserts only what a machine can honestly assert — that
 * nine posts came back, that they are Arabic, and that the three runs are not
 * identical to each other. Whether `gulf` reads Gulf to a Gulf reader needs eyes,
 * and that limit is stated here rather than dressed up as a passing check.
 *
 *   npx tsx scripts/live/dialect-proof.ts
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { mintSession } from './session.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://pyrasuite.pyramedia.cloud';
const EMAIL = 'pyra-e2e-shawarma@pyramedia.info';

/** Exactly the three the positioning doc argues about. `formal` and `saudi` are
 *  deliberately not run: 9 credits buys the comparison that decides the copy. */
const DIALECTS = ['gulf', 'emirati', 'egyptian'] as const;

/** Copied from the route's own InputSchema, never recalled — CLAUDE.md records two
 *  harness defects from invented field names in exactly this position. */
const BRIEF = {
  productDescription: 'مطعم شاورما صغير في الكرامة بدبي، شاورما دجاج ولحمة وصحون جانبية، أسعار في المتناول وتوصيل سريع',
  targetAudience: 'موظفين وعائلات في دبي بيدوروا على غدا سريع وبسعر معقول',
  platform: 'instagram',
  generateImages: false,
  useBrandKit: false,
} as const;

interface Post { caption?: string; hashtags?: string[]; scenario?: string }

async function balance(cookie: string): Promise<number | null> {
  const r = await fetch(`${BASE}/api/credits/balance`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) return null;
  const j = await r.json() as { data?: { balance?: number } };
  return j.data?.balance ?? null;
}

async function main(): Promise<void> {
  const session = await mintSession(ROOT, EMAIL);
  const before = await balance(session.cookie);
  console.log(`account ${session.email}  balance ${before ?? '?'}\n`);

  const results: { dialect: string; posts: Post[]; ok: boolean; note: string }[] = [];

  for (const dialect of DIALECTS) {
    process.stdout.write(`── ${dialect} … `);
    const res = await fetch(`${BASE}/api/studios/campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
      body: JSON.stringify({ ...BRIEF, dialect }),
      signal: AbortSignal.timeout(300_000),
    });
    // The payload is nested under `data` — this script's first version read
    // `body.posts`, got 200 with undefined, and reported three FAILED runs after
    // the credits had already been spent. CLAUDE.md records two harness defects of
    // exactly this shape: copy the route's own return, never recall it.
    const body = await res.json() as { data?: { posts?: Post[]; creditsUsed?: number }; error?: string };
    const posts = body.data?.posts;
    if (!res.ok || !posts?.length) {
      console.log(`FAILED ${res.status} ${body.error ?? ''}`);
      results.push({ dialect, posts: [], ok: false, note: `${res.status} ${body.error ?? ''}` });
      continue;
    }
    console.log(`${posts.length} posts, ${body.data?.creditsUsed ?? '?'} credits`);
    results.push({ dialect, posts, ok: true, note: '' });
  }

  const after = await balance(session.cookie);
  console.log(`\nbalance ${before ?? '?'} -> ${after ?? '?'}  (spent ${before != null && after != null ? before - after : '?'})\n`);

  // ── What a machine may assert ──────────────────────────────────────────
  const arabic = (s: string): number => (s.match(/[ء-ي]/g) ?? []).length;
  let fails = 0;
  for (const r of results) {
    const caps = r.posts.map((p) => p.caption ?? '').filter(Boolean);
    const allArabic = caps.length > 0 && caps.every((c) => arabic(c) / Math.max(1, c.replace(/\s/g, '').length) > 0.5);
    const nine = r.posts.length === 9;
    console.log(`  ${r.dialect}: ${nine ? 'OK  ' : 'FAIL'} nine posts (${r.posts.length})   ${allArabic ? 'OK  ' : 'FAIL'} captions are Arabic`);
    if (!nine || !allArabic) fails++;
  }
  // Three identical caption sets would mean the dialect never reached the model —
  // the one machine-checkable form of "it was ignored".
  const first = results.filter((r) => r.ok).map((r) => (r.posts[0]?.caption ?? '').trim());
  const distinct = new Set(first).size;
  console.log(`  cross-dialect: ${distinct === first.length ? 'OK  ' : 'FAIL'} the ${first.length} runs returned different first captions (${distinct} distinct)`);
  if (distinct !== first.length) fails++;

  // ── What only a human may assert ───────────────────────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('READ THESE. No check below this line — a machine cannot tell you whether');
  console.log('«gulf» reads Gulf to a Gulf reader. That is the whole question.');
  console.log('='.repeat(72));
  for (const r of results) {
    console.log(`\n───── ${r.dialect.toUpperCase()} ─────`);
    r.posts.slice(0, 3).forEach((p, i) => {
      console.log(`\n  [${i + 1}] ${(p.caption ?? '(no caption)').replace(/\n/g, '\n      ')}`);
      if (p.hashtags?.length) console.log(`      ${p.hashtags.slice(0, 6).join(' ')}`);
    });
  }

  const out = join(ROOT, '.superpowers/dialect-proof');
  mkdirSync(out, { recursive: true });
  const file = join(out, 'captions.json');
  writeFileSync(file, JSON.stringify({ brief: BRIEF, results }, null, 2), 'utf8');
  console.log(`\n\nfull output: ${file}`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
