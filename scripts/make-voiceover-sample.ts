/**
 * Generate ONE real voiceover sample from production, for the public
 * /studios/voiceover page.
 *
 *   npx tsx scripts/make-voiceover-sample.ts            # price it, spend nothing
 *   npx tsx scripts/make-voiceover-sample.ts --yes      # actually spend
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Every other studio page shows real product output saved from a live run
 * (public/examples/studios/, built by scripts/build-studio-examples.mjs). The
 * voiceover studio is the one that never saved its deliverable: the harness
 * measured the audio's duration and silence share and then discarded the bytes,
 * so there is no sample to play. A page selling Arabic voiceover with nothing
 * to listen to is the weakest page on the site, and an audio file from any
 * other service would make the sentence "this is what Pyra sounds like" false.
 *
 * So this spends real credits on the real product, exactly the way a customer
 * would, and keeps what comes back.
 *
 * ── WHY IT PRINTS THE PRICE AND REFUSES WITHOUT --yes ──────────────────────
 * Same rule scripts/live/run.ts states: a tool that quietly bills the owner is
 * its own kind of defect.
 *
 * The voice, dialect, tone and speed are values the UI actually offers
 * (app/[locale]/(dashboard)/voiceover/page.tsx:25-38) — not invented ones — so
 * the sample is reproducible by a customer clicking through the product.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mintSession } from './live/session';
import { calculateVoiceoverCost, getVoiceoverConfig } from '../lib/credits/voiceover-costs';

const BASE = process.env.PYRA_LIVE_BASE ?? 'https://pyrasuite.pyramedia.cloud';
const EMAIL = process.env.PYRA_LIVE_EMAIL ?? 'pyra-e2e-shawarma@pyramedia.info';
const OUT_DIR = 'public/examples/studios';
const CONFIRMED = process.argv.includes('--yes');

/**
 * Gulf dialect on purpose. The 2026-09-01 audit measured "تعليق صوتي خليجي" as
 * a HIGH-opportunity keyword with a thin SERP and no competitor ranking a
 * dialect page — so the sample the page plays should be the thing that is
 * hard to find elsewhere, not Modern Standard Arabic.
 *
 * The copy is what a real Gulf restaurant would actually run as a radio or
 * reel voiceover, and it names the same business the account's brand kit
 * describes, so the sample is coherent with every other example on the site.
 */
const SCRIPT =
  'شاورما الشام في الكرامة. لحمة طازة كل يوم، وخبز على الفحم، وتوصيل سريع لباب بيتك. اطلب الحين.';

const BODY = {
  script: SCRIPT,
  voice: 'el_arabic_male_1',
  dialect: 'gulf',
  speed: '1' as const,
  tone: 'friendly' as const,
};

async function readPlan(cookie: string): Promise<string> {
  try {
    const res = await fetch(`${BASE}/api/credits/balance`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json()) as { data?: { planId?: string; balance?: number } };
    if (typeof json.data?.balance === 'number') console.log(`balance      ${json.data.balance} credits`);
    // 'free' when unreadable is the STRICTER polarity for pricing: it prices the
    // sample at the OpenAI rate, which is cheaper, so a misread never
    // under-warns about what this will cost.
    return typeof json.data?.planId === 'string' ? json.data.planId : 'free';
  } catch {
    return 'free';
  }
}

async function main(): Promise<void> {
  const session = await mintSession(process.cwd(), EMAIL);
  const plan = await readPlan(session.cookie);
  const config = getVoiceoverConfig(plan);
  const cost = calculateVoiceoverCost(SCRIPT.length, 1, plan);

  console.log(`target       ${BASE}`);
  console.log(`account      ${EMAIL}`);
  console.log(`plan         ${plan}  (provider: ${config.provider})`);
  console.log(`script       ${SCRIPT.length} chars, dialect ${BODY.dialect}, voice ${BODY.voice}`);
  console.log(`\nTOTAL COST   ${cost} credits of real money\n`);

  if (!CONFIRMED) {
    console.log('Refusing to spend credits without --yes. Re-run with --yes to proceed.');
    return;
  }

  const res = await fetch(`${BASE}/api/studios/voiceover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
    body: JSON.stringify(BODY),
    signal: AbortSignal.timeout(180_000),
  });
  const json = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: { audioUrl?: string; duration?: number; provider?: string; creditsUsed?: number; mock?: boolean; enhancedScript?: string };
  };

  if (!res.ok || !json.success || !json.data?.audioUrl) {
    console.log(`FAILED  HTTP ${res.status}  ${json.error ?? '(no error code)'}`);
    process.exit(1);
  }

  // Narrowed to a local const so `audioUrl` stays a string past the guard
  // above: TypeScript does not carry a `json.data?.audioUrl` check through a
  // later `json.data` alias, and the download below takes it directly.
  const d: { audioUrl: string; duration?: number; provider?: string; creditsUsed?: number; mock?: boolean; enhancedScript?: string } = {
    ...json.data,
    audioUrl: json.data.audioUrl,
  };
  if (d.mock) {
    console.log('FAILED  the response is a MOCK — no real provider served it, nothing worth saving');
    process.exit(1);
  }

  console.log(`provider     ${d.provider}`);
  console.log(`duration     ${d.duration}s`);
  console.log(`charged      ${d.creditsUsed} credits (declared ${cost})`);
  if (d.enhancedScript && d.enhancedScript !== SCRIPT) {
    console.log(`\nthe dialect rewrite that was actually spoken:\n  ${d.enhancedScript}`);
  }

  const audio = await fetch(d.audioUrl, { signal: AbortSignal.timeout(120_000) });
  if (!audio.ok) {
    console.log(`FAILED  could not download the audio: HTTP ${audio.status}`);
    process.exit(1);
  }
  const bytes = Buffer.from(await audio.arrayBuffer());
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, 'voiceover-gulf-sample.mp3');
  writeFileSync(file, bytes);

  const meta = {
    file: '/examples/studios/voiceover-gulf-sample.mp3',
    bytes: bytes.length,
    durationSeconds: d.duration,
    provider: d.provider,
    voice: BODY.voice,
    dialect: BODY.dialect,
    tone: BODY.tone,
    scriptAsWritten: SCRIPT,
    scriptAsSpoken: d.enhancedScript ?? SCRIPT,
    creditsCharged: d.creditsUsed,
    generatedAt: new Date().toISOString(),
    generatedOn: BASE,
  };
  writeFileSync(join(OUT_DIR, 'voiceover-gulf-sample.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

  console.log(`\nsaved        ${file}  (${Math.round(bytes.length / 1024)} KB)`);
  console.log('             + voiceover-gulf-sample.json with the script, dialect, provider and duration');
  console.log('\nNOW LISTEN TO IT before putting it on a page. A duration is not a verdict on the audio.');
}

main();
