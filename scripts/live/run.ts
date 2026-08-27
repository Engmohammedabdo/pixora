/**
 * Live verification: run the product for real, measure what came back, and lay
 * the output out so a human or a vision agent can look at all of it at once.
 *
 *   npm run verify:live                              # edit sweep only (the default)
 *   npm run verify:live -- --studios text --edits off --yes
 *   npm run verify:live -- --studios all --yes
 *   npm run verify:live -- --base http://localhost:3000
 *   npm run verify:live -- --only marketplace_white,plan_en
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
 * Every case declares its price, the whole plan is printed with the account's
 * balance beside it, and the run is refused without `--yes` and refused outright
 * when the plan costs more than the account holds. A verification tool that
 * quietly bills you is its own kind of defect.
 *
 * The studio sweep is opt-in per group for the same reason: storyboard is 14
 * credits and campaign 12, so "run everything" is over budget before it starts.
 * The default stays the edit sweep, and `--studios` prints what each group costs
 * before it is chosen.
 *
 * ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
 * It does not judge whether an image is good, whether a marketing plan is any
 * use, or whether a voice sounds human. Those need eyes and ears. It writes
 * `sheet-*.png` and one JSON file per deliverable for exactly that pass, and
 * states plainly in the report which questions it did not answer.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { CREDIT_COSTS } from '../../lib/credits/costs';
import { LOW_EFFECT_THRESHOLD, LOW_OVERALL_THRESHOLD, looksLikeNoOp } from '../../lib/image/edit-effect';
import { mintSession } from './session';
import { EDIT_CASES, FIXTURES, editTypeFor, uncoveredPresets, type EditCase } from './cases';
import { cornerMarkPresent, editEffect, frameAspect, subjectSpan, whiteBackground, type CheckResult } from './checks';
import { STUDIO_CASES, groupCost, uncoveredStudios, type CaseTools, type StudioCase, type StudioGroup } from './studio-cases';

const ROOT = join(__dirname, '..', '..');
const DEFAULT_BASE = 'https://pyrasuite.pyramedia.cloud';
const DEFAULT_EMAIL = 'pyra-e2e-shawarma@pyramedia.info';
const GROUPS: StudioGroup[] = ['text', 'image', 'audio'];

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const BASE = (arg('--base') ?? DEFAULT_BASE).replace(/\/$/, '');
const EMAIL = arg('--email') ?? DEFAULT_EMAIL;
const ONLY = arg('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const CONFIRMED = process.argv.includes('--yes');
/** Default off, so `npm run verify:live` costs exactly what it always did. */
const STUDIO_SELECTION = (arg('--studios') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
/** Default on, so the existing default run is unchanged; `--edits off` is how a
 *  studio-only sweep avoids paying the edit sweep's 19 credits as well. */
const EDITS_ON = (arg('--edits') ?? 'on') !== 'off';

function selectedGroups(): Set<StudioGroup> {
  if (STUDIO_SELECTION.includes('all')) return new Set(GROUPS);
  const unknown = STUDIO_SELECTION.filter((g) => g !== 'all' && !GROUPS.includes(g as StudioGroup));
  if (unknown.length) {
    console.error(`unknown --studios group: ${unknown.join(', ')}. Valid: ${GROUPS.join(', ')}, all`);
    process.exit(1);
  }
  return new Set(STUDIO_SELECTION as StudioGroup[]);
}

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

interface StudioReport {
  id: string;
  studio: string;
  group: StudioGroup;
  declared: number;
  status: 'passed' | 'failed' | 'errored';
  credits?: number;
  checks: CheckResult[];
  outputFile?: string;
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

/** What the account actually holds, read from the product rather than assumed —
 *  the plan below is only honest if the balance beside it is real. Null when it
 *  cannot be read, which is reported as unknown and never as zero. */
async function readBalance(cookie: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/api/credits/balance`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(60_000) });
    const json = (await res.json()) as { data?: { balance?: number } };
    return typeof json.data?.balance === 'number' ? json.data.balance : null;
  } catch {
    return null;
  }
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
  // ── Coverage, asserted before anything is spent ──────────────────────────
  // Both refusals are the same rule: something the product ships that this sweep
  // has no case for would otherwise ship unrun and unlooked-at, which is exactly
  // the state all fourteen edit presets were in before the first sweep.
  const gaps = uncoveredPresets();
  if (gaps.length) {
    console.error(`REFUSING TO RUN: presets with no case — ${gaps.join(', ')}`);
    console.error('Add them to scripts/live/cases.ts with a fixture that contains what they act on.');
    process.exit(1);
  }
  const studioGaps = uncoveredStudios();
  if (studioGaps.length) {
    console.error(`REFUSING TO RUN: studios with no case — ${studioGaps.join(', ')}`);
    console.error('Every directory under app/api/studios needs a case in scripts/live/studio-cases.ts,');
    console.error('or an entry in COVERED_ELSEWHERE there saying where it IS covered and why.');
    process.exit(1);
  }

  const groups = selectedGroups();
  const cases = (EDITS_ON ? EDIT_CASES : []).filter((c) => !ONLY || ONLY.includes(c.preset));
  const studioCases = STUDIO_CASES
    .filter((c) => groups.has(c.group))
    .filter((c) => !ONLY || ONLY.includes(c.id));

  const fixtures = [...new Set([
    ...cases.map((c) => c.fixture as string),
    ...studioCases.map((c) => c.fixture).filter((f): f is string => Boolean(f)),
  ])];

  const fixtureCost = fixtures.length * CREDIT_COSTS.image['1080p'];
  const editCost = cases.length * CREDIT_COSTS.edit;
  const studioCost = studioCases.reduce((sum, c) => sum + c.cost, 0);
  const cost = fixtureCost + editCost + studioCost;

  console.log(`target        ${BASE}`);
  console.log(`account       ${EMAIL}`);
  console.log('');
  console.log(`fixtures      ${String(fixtures.length).padStart(2)} images   ${String(fixtureCost).padStart(3)} credits   ${fixtures.join(', ') || '—'}`);
  console.log(`edit cases    ${String(cases.length).padStart(2)} cases    ${String(editCost).padStart(3)} credits   ${EDITS_ON ? '(--edits off to skip)' : '(SKIPPED via --edits off)'}`);
  console.log(`studio cases  ${String(studioCases.length).padStart(2)} cases    ${String(studioCost).padStart(3)} credits   ${STUDIO_SELECTION.join(',') || 'none — opt in with --studios'}`);
  for (const c of studioCases) console.log(`                 ${c.id.padEnd(20)} ${String(c.cost).padStart(3)} cr   ${c.intent}`);
  console.log('');
  console.log('groups available (before fixtures):');
  for (const g of GROUPS) {
    const n = STUDIO_CASES.filter((c) => c.group === g).length;
    console.log(`  --studios ${g.padEnd(6)} ${String(groupCost(g)).padStart(3)} credits over ${n} case${n === 1 ? '' : 's'}`);
  }
  console.log(`  --studios all    ${String(GROUPS.reduce((s, g) => s + groupCost(g), 0)).padStart(3)} credits over ${STUDIO_CASES.length} cases`);
  console.log('');
  console.log(`TOTAL COST    ${cost} credits of real money`);

  if (!cases.length && !studioCases.length) {
    console.log('\nNothing selected. Nothing spent.');
    process.exit(0);
  }

  const session = await mintSession(ROOT, EMAIL);
  const balanceBefore = await readBalance(session.cookie);
  console.log(`balance       ${balanceBefore === null ? 'unknown' : balanceBefore} credits`);
  if (balanceBefore !== null && balanceBefore < cost) {
    console.error(`\nREFUSING TO RUN: the plan costs ${cost} credits and the account holds ${balanceBefore}.`);
    console.error('A half-finished sweep spends the money and proves nothing. Narrow it with --studios / --only.');
    process.exit(2);
  }
  if (!CONFIRMED) {
    console.log('\nRefusing to spend credits without --yes. Re-run with --yes to proceed.');
    process.exit(2);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(ROOT, '.superpowers', 'live-runs', stamp);
  mkdirSync(dir, { recursive: true });
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

  // Extra images a studio case asks to keep, laid out on the same contact sheet
  // as the edits — the reading pass should be one pass, not two.
  const extraTiles: [string, string][] = [];

  // ── Edit cases ──────────────────────────────────────────────────────────
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
      if (c.expect?.aspect !== undefined) {
        // The marketplace canvas is the spec's own shape, and the fixture is
        // deliberately non-square — so this only passes if the model actually
        // recomposed rather than returning the source's aspect ratio.
        const a = await frameAspect(out);
        const want = c.expect.aspect;
        rep.checks.push({
          name: 'output canvas matches the marketplace shape',
          ok: a !== null && Math.abs(a - want) / want <= 0.03,
          detail: a === null ? 'could not read dimensions' : `width/height ${a.toFixed(3)} (want ${want.toFixed(3)} ±3%)`,
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

  // ── Studio cases ────────────────────────────────────────────────────────
  const studioReports: StudioReport[] = [];
  for (const c of studioCases as StudioCase[]) {
    const rep: StudioReport = { id: c.id, studio: c.studio, group: c.group, declared: c.cost, status: 'passed', checks: [] };
    try {
      const tools: CaseTools = {
        download,
        keepImage: (file, bytes, label) => {
          writeFileSync(join(dir, file), bytes);
          extraTiles.push([file, label]);
        },
        fixture: c.fixture
          ? { url: fixtureUrls.get(c.fixture) as string, bytes: fixtureBytes.get(c.fixture) as Buffer }
          : null,
      };

      const r = await post(c.path, session.cookie, c.body(tools));
      const data = r.json.data as Record<string, unknown> | undefined;
      if (r.status !== 200 || !data) {
        rep.status = 'errored';
        // The error code is the whole diagnosis for a studio route — a 400 says
        // the request shape is wrong and teaches nothing about the model, a 500
        // `generation_parse_failed` says the model answered and we refused it.
        rep.error = `HTTP ${r.status} ${String(r.json.error ?? '')}${r.json.details ? ' ' + JSON.stringify(r.json.details).slice(0, 300) : ''}`;
        studioReports.push(rep);
        console.log(`${c.id.padEnd(20)} ERRORED  ${rep.error}`);
        continue;
      }
      if (typeof data.creditsUsed === 'number') rep.credits = data.creditsUsed;

      // The deliverable goes to disk whatever the checks say. The numbers below
      // cannot tell whether a marketing plan is any USE — that pass needs a
      // reader, and it needs the text in front of it.
      const file = `${c.id}.json`;
      writeFileSync(join(dir, file), JSON.stringify(c.deliverable(data), null, 2), 'utf8');
      rep.outputFile = file;

      rep.checks = await c.verify(data, tools);
      rep.status = rep.checks.every((k) => k.ok) ? 'passed' : 'failed';
      const flags = rep.checks.filter((k) => !k.ok).map((k) => k.name).join('; ');
      console.log(`${c.id.padEnd(20)} ${rep.status.toUpperCase().padEnd(8)} ${String(rep.credits ?? '—').padStart(2)}cr  ${rep.checks.filter((k) => k.ok).length}/${rep.checks.length} checks${flags ? '  <- ' + flags : ''}`);
    } catch (e) {
      rep.status = 'errored';
      rep.error = (e as Error).message;
      console.log(`${c.id.padEnd(20)} ERRORED  ${rep.error}`);
    }
    studioReports.push(rep);
  }

  const balanceAfter = await readBalance(session.cookie);
  const spent = balanceBefore !== null && balanceAfter !== null ? balanceBefore - balanceAfter : null;

  // ── Artifacts for the pass this cannot do ───────────────────────────────
  const tiles = [
    ...reports.filter((r) => r.imageFile).map((r) => [r.imageFile as string, r.preset] as [string, string]),
    ...extraTiles,
  ];
  const half = Math.ceil(tiles.length / 2);
  await sheet(dir, 'sheet-A.png', tiles.slice(0, half));
  await sheet(dir, 'sheet-B.png', tiles.slice(half));
  await sheet(dir, 'sheet-fixtures.png', fixtures.map((f) => [`fixture-${f}.png`, `SOURCE: ${f}`] as [string, string]));

  const failed = reports.filter((r) => r.status !== 'passed');
  const studioFailed = studioReports.filter((r) => r.status !== 'passed');
  const totalCases = reports.length + studioReports.length;
  const totalFailed = failed.length + studioFailed.length;

  const md = [
    `# Live verification — ${stamp}`,
    ``,
    `Target \`${BASE}\` · account \`${EMAIL}\``,
    ``,
    `| | |`,
    `|---|---|`,
    `| planned cost | ${cost} credits |`,
    `| balance before | ${balanceBefore ?? 'unknown'} |`,
    `| balance after | ${balanceAfter ?? 'unknown'} |`,
    `| actually spent | ${spent === null ? 'unknown' : `${spent} credits`} |`,
    ``,
    `**${totalCases - totalFailed} of ${totalCases} passed the measured checks.**`,
    ``,
    ...(reports.length ? [
      `## Edit presets`,
      ``,
      `| preset | fixture | status | effect | credits |`,
      `|---|---|---|---|---|`,
      ...reports.map((r) => `| \`${r.preset}\` | ${r.fixture} | ${r.status} | ${r.effect?.toFixed(1) ?? '—'} | ${r.credits ?? '—'} |`),
      ``,
    ] : []),
    ...(studioReports.length ? [
      `## Studios`,
      ``,
      `| case | studio | group | status | checks | declared | charged | output |`,
      `|---|---|---|---|---|---|---|---|`,
      ...studioReports.map((r) =>
        `| \`${r.id}\` | ${r.studio} | ${r.group} | ${r.status} | ${r.checks.filter((k) => k.ok).length}/${r.checks.length} | ${r.declared} | ${r.credits ?? '—'} | ${r.outputFile ? `\`${r.outputFile}\`` : '—'} |`),
      ``,
      `### Every measurement, passing or not`,
      ``,
      ...studioReports.flatMap((r) => [
        `**${r.id}** — ${r.status}${r.error ? ` · \`${r.error}\`` : ''}`,
        ``,
        ...r.checks.map((k) => `- ${k.ok ? 'ok' : '**FAIL**'} — ${k.name} — ${k.detail}`),
        ``,
      ]),
    ] : []),
    ...(failed.length ? [
      `## Failed edit presets`,
      ``,
      ...failed.flatMap((r) => [
        `### ${r.preset} — ${r.status}`,
        r.error ? `\`${r.error}\`` : '',
        ...r.checks.filter((k) => !k.ok).map((k) => `- **${k.name}** — ${k.detail}`),
        ``,
      ]),
    ] : []),
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
    ...(studioReports.length ? [
      `For the studios, specifically unanswered:`,
      ``,
      `- **Whether the text is any good.** A plan can name four filled tabs, be in the`,
      `  right language, and still be generic advice that fits any business. Read the`,
      `  \`*.json\` files in this directory — that is what they are written for.`,
      `- **Whether the business context reached the model.** Nothing here proves the`,
      `  deliverable is about the business that was described rather than about`,
      `  restaurants in general.`,
      `- **Whether a voiceover says the right words, in the right dialect, in a voice`,
      `  worth paying for.** The audio checks prove the file decodes, plays for a`,
      `  measured time, stays inside the plan cap and is not digital silence. They`,
      `  cannot hear it. Play the file.`,
      `- **Whether three prompt-builder prompts differ in APPROACH** rather than merely`,
      `  in wording. Distinctness is measurable; usefulness is not.`,
      `- **The campaign image path and multi-shot photoshoot.** This sweep runs campaign`,
      `  with images off (3 credits, not 12) and photoshoot at one shot, so the`,
      `  per-post image loop and the partial-refund arithmetic above one shot are`,
      `  exercised by neither.`,
      ``,
    ] : []),
  ].join('\n');
  writeFileSync(join(dir, 'report.md'), md, 'utf8');
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ base: BASE, stamp, cost, balanceBefore, balanceAfter, spent, reports, studioReports }, null, 2), 'utf8');

  console.log(`\n${totalCases - totalFailed}/${totalCases} passed the measured checks`);
  console.log(`credits: planned ${cost}, actually spent ${spent === null ? 'unknown' : spent}`);
  console.log(`artifacts: ${dir}`);
  if (tiles.length) console.log('NOW LOOK AT sheet-A.png / sheet-B.png — the measurements cannot see invented or erased content.');
  if (studioReports.length) console.log('NOW READ the *.json deliverables — the measurements cannot see whether the text is any use.');
  process.exit(totalFailed ? 1 : 0);
}

void main().catch((e: unknown) => {
  console.error(String((e as Error).message ?? e));
  process.exit(1);
});
