/**
 * Live verification: run the product for real, measure what came back, and lay
 * the output out so a human or a vision agent can look at all of it at once.
 *
 *   npm run verify:live                      # against production
 *   npm run verify:live -- --base http://localhost:3000
 *   npm run verify:live -- --only marketplace_white,promo_badge
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * On 2026-08-27 four defects shipped past every gate in this repo — `tsc`,
 * `eslint`, 17 invariants and 300+ prompt checks were green for the broken code
 * and the fixed code ALIKE. Three of them made a paid studio return the
 * customer's own photograph unchanged, at HTTP 200, with a credit charged; a
 * fourth had the model erase content from the customer's picture.
 *
 * None of that is visible to a gate, because the code was correct. The model
 * declined, or obeyed an instruction that was wrong. The only thing that found
 * them was running the product and looking at every image.
 *
 * So this is not another test suite. It is the part of verification that costs
 * money and cannot be faked: real requests, real model calls, real credits, real
 * files on disk.
 *
 * ── IT SPENDS REAL CREDITS, AND SAYS SO BEFORE IT DOES ─────────────────────
 * A full sweep is ~5 fixtures + 14 edits = 19 credits on the configured account.
 * The plan is printed and the run is refused without `--yes`, because a
 * verification tool that quietly bills you is its own kind of defect.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 * It does not judge whether an image is good, or whether the model invented
 * something. Those need eyes. It produces `sheet-*.png` and a report for exactly
 * that pass, and states plainly in the report which questions it did not answer.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { LOW_EFFECT_THRESHOLD, LOW_OVERALL_THRESHOLD, looksLikeNoOp } from '../../lib/image/edit-effect';
import { mintSession } from './session';
import { EDIT_CASES, FIXTURES, editTypeFor, uncoveredPresets, type EditCase } from './cases';
import { cornerMarkPresent, editEffect, subjectSpan, whiteBackground, type CheckResult } from './checks';

const ROOT = join(__dirname, '..', '..');
const DEFAULT_BASE = 'https://pyrasuite.pyramedia.cloud';
const DEFAULT_EMAIL = 'pyra-e2e-shawarma@pyramedia.info';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const BASE = (arg('--base') ?? DEFAULT_BASE).replace(/\/$/, '');
const EMAIL = arg('--email') ?? DEFAULT_EMAIL;
const ONLY = arg('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const CONFIRMED = process.argv.includes('--yes');

interface CaseReport {
  preset: string;
  fixture: string;
  status: 'passed' | 'failed' | 'errored';
  credits?: number;
  effect?: number | null;
  overall?: number | null;
  checks: CheckResult[];
  imageFile?: string;
  error?: string;
}

async function post(path: string, cookie: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** One labelled contact sheet, because judging fourteen images one at a time is
 *  how a subtle difference between two of them gets missed. */
async function sheet(dir: string, out: string, items: [string, string][]): Promise<void> {
  const TILE = 620, LABEL = 44, COLS = 2;
  const rows = Math.ceil(items.length / COLS);
  const layers: sharp.OverlayOptions[] = [];
  for (let i = 0; i < items.length; i++) {
    const [file, name] = items[i];
    if (!existsSync(join(dir, file))) continue;
    const cx = (i % COLS) * TILE, cy = Math.floor(i / COLS) * (TILE + LABEL);
    layers.push({
      input: await sharp(join(dir, file)).resize(TILE, TILE, { fit: 'contain', background: '#ffffff' }).toBuffer(),
      left: cx, top: cy + LABEL,
    });
    layers.push({
      input: Buffer.from(
        `<svg width="${TILE}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${TILE}" height="${LABEL}" fill="#111827"/>` +
        `<text x="12" y="30" font-family="Arial" font-size="22" font-weight="bold" fill="#ffffff">${name}</text></svg>`
      ),
      left: cx, top: cy,
    });
  }
  if (!layers.length) return;
  await sharp({ create: { width: COLS * TILE, height: rows * (TILE + LABEL), channels: 3, background: '#e5e7eb' } })
    .composite(layers).png().toFile(join(dir, out));
}

async function main(): Promise<void> {
  const gaps = uncoveredPresets();
  if (gaps.length) {
    console.error(`REFUSING TO RUN: presets with no case — ${gaps.join(', ')}`);
    console.error('Add them to scripts/live/cases.ts with a fixture that contains what they act on.');
    process.exit(1);
  }

  const cases = ONLY ? EDIT_CASES.filter((c) => ONLY.includes(c.preset)) : EDIT_CASES;
  const fixtures = [...new Set(cases.map((c) => c.fixture))];
  const cost = fixtures.length + cases.length;

  console.log(`target        ${BASE}`);
  console.log(`account       ${EMAIL}`);
  console.log(`fixtures      ${fixtures.length}   (1 credit each)`);
  console.log(`edit cases    ${cases.length}   (1 credit each)`);
  console.log(`TOTAL COST    ${cost} credits of real money\n`);
  if (!CONFIRMED) {
    console.log('Refusing to spend credits without --yes. Re-run with --yes to proceed.');
    process.exit(2);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(ROOT, '.superpowers', 'live-runs', stamp);
  mkdirSync(dir, { recursive: true });

  const session = await mintSession(ROOT, EMAIL);
  console.log(`session       ${session.userId}\n`);

  // ── Fixtures ────────────────────────────────────────────────────────────
  const fixtureBytes = new Map<string, Buffer>();
  const fixtureUrls = new Map<string, string>();
  for (const name of fixtures) {
    const r = await post('/api/studios/creator', session.cookie, {
      prompt: FIXTURES[name], model: 'gemini', resolution: '1080p', style: 'photographic', variations: 1,
    });
    const data = r.json.data as { imageUrls?: string[]; mock?: boolean } | undefined;
    const url = data?.imageUrls?.[0];
    if (r.status !== 200 || !url) {
      console.error(`fixture ${name}: FAILED (${r.status} ${String(r.json.error ?? '')})`);
      process.exit(1);
    }
    const buf = await download(url);
    writeFileSync(join(dir, `fixture-${name}.png`), buf);
    fixtureBytes.set(name, buf);
    fixtureUrls.set(name, url);
    console.log(`fixture ${name.padEnd(18)} ok${data?.mock ? '  (MOCK — not a real model call)' : ''}`);
  }

  // ── Cases ───────────────────────────────────────────────────────────────
  const reports: CaseReport[] = [];
  for (const c of cases as EditCase[]) {
    const rep: CaseReport = { preset: c.preset, fixture: c.fixture, status: 'passed', checks: [] };
    try {
      const body: Record<string, unknown> = {
        imageUrl: fixtureUrls.get(c.fixture),
        editType: editTypeFor(c.preset),
        editPreset: c.preset,
      };
      if (c.text) body.editDescription = c.text;

      const r = await post('/api/studios/edit', session.cookie, body);
      const data = r.json.data as { imageUrl?: string; creditsUsed?: number; mock?: boolean } | undefined;
      if (r.status !== 200 || !data?.imageUrl) {
        rep.status = 'errored';
        rep.error = `HTTP ${r.status} ${String(r.json.error ?? '')}`;
        reports.push(rep);
        console.log(`${c.preset.padEnd(20)} ERRORED  ${rep.error}`);
        continue;
      }
      rep.credits = data.creditsUsed;

      const out = await download(data.imageUrl);
      const file = `edit-${c.preset}.png`;
      writeFileSync(join(dir, file), out);
      rep.imageFile = file;

      // THE check this whole harness was built around: a 200 with a credit
      // charged tells you nothing about whether anything happened.
      const before = fixtureBytes.get(c.fixture);
      const m = before ? await editEffect(before, out) : { maxLocal: null, overall: null };
      rep.effect = m.maxLocal;
      rep.overall = m.overall;
      rep.checks.push({
        name: 'the edit changed something',
        ok: !looksLikeNoOp(m.maxLocal, m.overall),
        detail: m.maxLocal === null
          ? 'could not measure'
          : `local ${m.maxLocal.toFixed(1)} (flag <${LOW_EFFECT_THRESHOLD}) · overall ${m.overall?.toFixed(2)} (flag <${LOW_OVERALL_THRESHOLD}) — a real edit clears at least one`,
      });

      // A mock in a live sweep means the run proved nothing about the model.
      rep.checks.push({ name: 'a real model served it', ok: data.mock !== true, detail: `mock=${String(data.mock)}` });

      if (c.expect?.pureWhiteBackground) {
        const w = await whiteBackground(out);
        rep.checks.push({
          name: 'background is measured pure white',
          ok: w.samplesPure === w.samples,
          detail: `${w.samplesPure}/${w.samples} sample points exactly rgb(255,255,255), ${(w.pureShare * 100).toFixed(1)}% of frame pure`,
        });
      }
      if (c.expect?.minSubjectSpan !== undefined) {
        const span = await subjectSpan(out);
        rep.checks.push({
          name: 'subject spans enough of the frame',
          ok: span !== null && span >= c.expect.minSubjectSpan,
          detail: span === null ? 'no subject found' : `longest side ${(span * 100).toFixed(1)}% of frame (min ${(c.expect.minSubjectSpan * 100).toFixed(0)}%)`,
        });
      }

      // Free-plan output must carry the mark. It shipped as empty boxes for a
      // week once, with nothing thrown and nothing logged.
      rep.checks.push({
        name: 'free-plan corner mark present',
        ok: await cornerMarkPresent(out),
        detail: 'bottom-right corner carries a non-uniform mark',
      });

      rep.status = rep.checks.every((k) => k.ok) ? 'passed' : 'failed';
      const flags = rep.checks.filter((k) => !k.ok).map((k) => k.name).join('; ');
      console.log(`${c.preset.padEnd(20)} ${rep.status.toUpperCase().padEnd(8)} local=${m.maxLocal?.toFixed(1) ?? '?'} overall=${m.overall?.toFixed(2) ?? '?'}${flags ? '  <- ' + flags : ''}`);
    } catch (e) {
      rep.status = 'errored';
      rep.error = (e as Error).message;
      console.log(`${c.preset.padEnd(20)} ERRORED  ${rep.error}`);
    }
    reports.push(rep);
  }

  // ── Artifacts for the pass this cannot do ───────────────────────────────
  const tiles = reports.filter((r) => r.imageFile).map((r) => [r.imageFile as string, r.preset] as [string, string]);
  const half = Math.ceil(tiles.length / 2);
  await sheet(dir, 'sheet-A.png', tiles.slice(0, half));
  await sheet(dir, 'sheet-B.png', tiles.slice(half));
  await sheet(dir, 'sheet-fixtures.png', fixtures.map((f) => [`fixture-${f}.png`, `SOURCE: ${f}`] as [string, string]));

  const failed = reports.filter((r) => r.status !== 'passed');
  const md = [
    `# Live verification — ${stamp}`,
    ``,
    `Target \`${BASE}\` · account \`${EMAIL}\` · ${cost} credits spent.`,
    ``,
    `**${reports.length - failed.length} of ${reports.length} passed the measured checks.**`,
    ``,
    `| preset | fixture | status | effect | credits |`,
    `|---|---|---|---|---|`,
    ...reports.map((r) => `| \`${r.preset}\` | ${r.fixture} | ${r.status} | ${r.effect?.toFixed(1) ?? '—'} | ${r.credits ?? '—'} |`),
    ``,
    ...failed.flatMap((r) => [
      `### ${r.preset} — ${r.status}`,
      r.error ? `\`${r.error}\`` : '',
      ...r.checks.filter((k) => !k.ok).map((k) => `- **${k.name}** — ${k.detail}`),
      ``,
    ]),
    `## What this run did NOT answer`,
    ``,
    `The checks above are measurements. They cannot tell whether an image is any`,
    `good, whether the model invented text, or whether it erased something from the`,
    `customer's picture — all three of which shipped past every gate in this repo on`,
    `2026-08-27 and were found only by looking.`,
    ``,
    `Open \`sheet-A.png\`, \`sheet-B.png\` and \`sheet-fixtures.png\` and compare each`,
    `output against its source before calling this run clean.`,
    ``,
  ].join('\n');
  writeFileSync(join(dir, 'report.md'), md, 'utf8');
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ base: BASE, stamp, cost, reports }, null, 2), 'utf8');

  console.log(`\n${reports.length - failed.length}/${reports.length} passed the measured checks`);
  console.log(`artifacts: ${dir}`);
  console.log('NOW LOOK AT sheet-A.png / sheet-B.png — the measurements cannot see invented or erased content.');
  process.exit(failed.length ? 1 : 0);
}

void main().catch((e: unknown) => {
  console.error(String((e as Error).message ?? e));
  process.exit(1);
});
