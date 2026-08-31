/**
 * The output canvas: every ratio the product offers must be one all three
 * providers can actually serve, and each adapter's size function must return a
 * value inside that provider's published limits.
 *
 * ── WHY THIS GATE EXISTS ───────────────────────────────────────────────────
 * Until 2026-08-31 `aspectRatio` reached only the gemini adapter, and
 * `router.ts` carried a comment saying not to send it from a text-to-image
 * caller until gpt and flux forwarded it, because "an aspect ratio that is part
 * of a paid spec being quietly ignored is exactly the defect class this file's
 * other comments catalogue."
 *
 * Two things then turned out to be true, and only one was suspected:
 *
 *   - REFUTED: that gpt was already rejecting 1536x1536 and 2048x2048.
 *     gpt-image-2 has no size enum; it accepts any WIDTHxHEIGHT meeting four
 *     documented constraints, and all three values met all four.
 *   - CONFIRMED, and worse: flux was ignoring `width`/`height` on EVERY tier.
 *     Its schema says they are "Only used when aspect_ratio=custom", and
 *     `aspect_ratio` defaults to "1:1". This adapter never sent it. So flux
 *     served the same default square for 1080p, 2K and 4K — the paid plans'
 *     resolution promise was never delivered by that provider.
 *
 * Neither was visible to any gate, because both were about what a REMOTE schema
 * accepts. This file pins the constraints locally so a change to the framing
 * table cannot silently pick a ratio a provider will round, drop or refuse.
 *
 * ── WHAT IT CANNOT DO ──────────────────────────────────────────────────────
 * It cannot tell you the provider still accepts these values. Those limits live
 * on someone else's server and can move without any local signal — which is
 * exactly how the flux defect survived. This gate freezes what was READ from
 * the providers' own schemas on 2026-08-31, so a drift is caught by a live run
 * rather than by this file. `verify:live` is where that happens.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../lib/strip-comments';
import { PLATFORM_FRAMING, PLATFORM_IDS, type PlatformId } from '../../lib/ai/prompts/platform-framing';
import { openaiImageSize } from '../../lib/ai/models';
import { FLUX_ASPECT_RATIOS, fluxSize } from '../../lib/ai/replicate';

const ROOT = join(__dirname, '..', '..');

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// gemini — the 14 documented values, and the 10 the Pro model carries
// ---------------------------------------------------------------------------

/** ImageConfig.aspectRatio, verbatim from https://ai.google.dev/api/generate-content:
 *  "Supported aspect ratios: 1:1, 1:4, 4:1, 1:8, 8:1, 2:3, 3:2, 3:4, 4:3, 4:5,
 *  5:4, 9:16, 16:9, or 21:9." */
const GEMINI_ASPECT_RATIOS = [
  '1:1', '1:4', '4:1', '1:8', '8:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
];

/** The four BANNER ratios are documented for gemini-3.1-flash-image and are
 *  ABSENT from gemini-3-pro-image's table. This matters because `geminiImageSize`
 *  routes the 4K tier to Pro (gemini.ts:187), so a banner ratio would be fine at
 *  1K/2K and unsupported at 4K — a defect that appears only on the most
 *  expensive plans. */
const GEMINI_PRO_UNSUPPORTED = ['1:4', '4:1', '1:8', '8:1'];

for (const id of PLATFORM_IDS) {
  const ratio = PLATFORM_FRAMING[id].aspectRatio;
  check(
    `gemini accepts the ratio offered for "${id}"`,
    GEMINI_ASPECT_RATIOS.includes(ratio),
    `${ratio} is not in the documented 14-value set`
  );
  check(
    `"${id}" is servable at 4K, where the request routes to the Pro model`,
    !GEMINI_PRO_UNSUPPORTED.includes(ratio),
    `${ratio} is a banner ratio: documented for Flash, absent from the Pro table`
  );
}

// ---------------------------------------------------------------------------
// flux — the enum, and the width/height grid behind `custom`
// ---------------------------------------------------------------------------

const FLUX_MAX_EDGE = 1440;
const FLUX_MIN_EDGE = 256;

for (const id of PLATFORM_IDS) {
  const ratio = PLATFORM_FRAMING[id].aspectRatio;
  const out = fluxSize('2K', ratio);

  // The whole point of the fix: something must always tell flux what shape to
  // make, because its own default is 1:1 and width/height are inert without it.
  check(
    `flux is always told a shape for "${id}"`,
    typeof out.aspect_ratio === 'string' && out.aspect_ratio.length > 0
  );

  // ── THE CHECK THAT WAS ENFORCING THE DEFECT ──────────────────────────────
  // An earlier version of this file asserted "flux uses its own enum rather
  // than custom", and fluxSize obliged. Adversarial review then measured what
  // that produced: identical output for 1080p, 2K and 4K, because width/height
  // are the model's ONLY resolution channel and are read only under `custom`.
  // The gate was pinning a shape that silently sold a 4K request at 1080p size.
  //
  // So the rule is the opposite, and it is stated on the quantity that actually
  // matters: the tier must reach the request.
  check(
    `flux always sends dimensions for "${id}"`,
    out.aspect_ratio === 'custom' && typeof out.width === 'number' && typeof out.height === 'number',
    `aspect_ratio=${out.aspect_ratio} width=${out.width} height=${out.height}`
  );

  // `multipleOf` appears NOWHERE in flux's schema — the multiple-of-32 rule is
  // description-only and an off-grid value is silently ROUNDED, not refused. So
  // a wrong width does not error; it changes the delivered aspect ratio. That is
  // why this is asserted here rather than left to the provider.
  for (const [edge, v] of [['width', out.width], ['height', out.height]] as const) {
    check(`flux ${edge} for "${id}" is on the 32px grid`, v % 32 === 0, `got ${v}`);
    check(
      `flux ${edge} for "${id}" is within [${FLUX_MIN_EDGE}, ${FLUX_MAX_EDGE}]`,
      v >= FLUX_MIN_EDGE && v <= FLUX_MAX_EDGE,
      `got ${v}`
    );
  }
}

// THE tier check: a paid resolution must actually change the request. This is
// the assertion whose absence let the enum path ship — every other check here
// passed on output that was byte-identical across all three tiers.
for (const id of PLATFORM_IDS) {
  const ratio = PLATFORM_FRAMING[id].aspectRatio;
  const small = fluxSize('1080p', ratio);
  const large = fluxSize('2K', ratio);
  check(
    `flux "${id}": 2K asks for a larger frame than 1080p`,
    Math.max(large.width, large.height) > Math.max(small.width, small.height),
    `1080p ${small.width}x${small.height} vs 2K ${large.width}x${large.height}`
  );
}

// Aspect ratio must SURVIVE the grid snapping. Rounding both edges to 32 can
// move the delivered ratio, and the provider does that silently.
for (const id of PLATFORM_IDS) {
  const [w, h] = PLATFORM_FRAMING[id].aspectRatio.split(':').map(Number);
  for (const res of ['1080p', '2K', '4K']) {
    const out = fluxSize(res, PLATFORM_FRAMING[id].aspectRatio);
    const wanted = w / h;
    const got = out.width / out.height;
    check(
      `flux "${id}" at ${res}: the snapped frame still has the requested ratio`,
      Math.abs(got - wanted) / wanted <= 0.03,
      `wanted ${wanted.toFixed(3)}, got ${got.toFixed(3)} (${out.width}x${out.height})`
    );
  }
}

// The 4K tier cannot exceed flux's ceiling, whatever the tier table says.
for (const res of ['1080p', '2K', '4K']) {
  const out = fluxSize(res, '4:5');
  const longest = Math.max(out.width ?? 0, out.height ?? 0);
  check(
    `flux at ${res} never exceeds the schema maximum`,
    out.aspect_ratio !== 'custom' || longest <= FLUX_MAX_EDGE,
    `longest edge ${longest} > ${FLUX_MAX_EDGE}`
  );
}

// ---------------------------------------------------------------------------
// The call site — the only place the original defect could live
// ---------------------------------------------------------------------------
//
// Every check above tests `fluxSize()`, and `fluxSize()` did not exist when the
// defect did. The bug was in the REQUEST BODY: `width` and `height` were sent
// and `aspect_ratio` was not, so the model applied its own 1:1 default and
// discarded both. No amount of testing the helper would have found that.
//
// So this reads the adapter's source and asserts the shape of what it sends.
// Comments are stripped first: replicate.ts documents this defect by quoting the
// old `sizeMap`, and an unstripped scan would match the very code being warned
// about.
{
  const src = stripComments(readFileSync(join(ROOT, 'lib/ai/replicate.ts'), 'utf8'));
  const body = src.slice(src.indexOf('input: {'), src.indexOf('}', src.indexOf('input: {')) + 1);

  check(
    'replicate.ts spreads fluxSize() into the request input',
    /\.\.\.size\b/.test(body),
    `input block was: ${body.replace(/\s+/g, ' ').slice(0, 160)}`
  );
  // The literal defect: a dimension written directly into the body, beside no
  // aspect_ratio, is inert. `fluxSize()` is the only thing allowed to decide
  // dimensions, precisely because it is the only thing that also decides the
  // shape they belong to.
  check(
    'replicate.ts sets no width/height outside fluxSize()',
    !/\b(width|height)\s*:/.test(body),
    `input block was: ${body.replace(/\s+/g, ' ').slice(0, 160)}`
  );
  check(
    'replicate.ts computes its size from the requested aspect ratio',
    /fluxSize\(\s*options\.resolution\s*,\s*options\.aspectRatio\s*\)/.test(src)
  );
}

// ---------------------------------------------------------------------------
// gpt — the four constraints gpt-image-2 publishes
// ---------------------------------------------------------------------------

const OPENAI_MAX_EDGE = 3840;
const OPENAI_MIN_PIXELS = 655_360;
const OPENAI_MAX_PIXELS = 8_294_400;

for (const id of PLATFORM_IDS) {
  const ratio = PLATFORM_FRAMING[id].aspectRatio;
  for (const res of ['1080p', '2K', '4K']) {
    const size = openaiImageSize(res, ratio);
    const [w, h] = size.split('x').map(Number);
    const label = `"${id}" at ${res} (${size})`;

    check(`gpt ${label}: both edges are multiples of 16`, w % 16 === 0 && h % 16 === 0);
    check(`gpt ${label}: max edge <= ${OPENAI_MAX_EDGE}`, Math.max(w, h) <= OPENAI_MAX_EDGE);
    check(
      `gpt ${label}: long:short ratio does not exceed 3:1`,
      Math.max(w, h) / Math.min(w, h) <= 3 + 1e-9,
      `got ${(Math.max(w, h) / Math.min(w, h)).toFixed(3)}:1`
    );
    check(
      `gpt ${label}: total pixels within [${OPENAI_MIN_PIXELS}, ${OPENAI_MAX_PIXELS}]`,
      w * h >= OPENAI_MIN_PIXELS && w * h <= OPENAI_MAX_PIXELS,
      `got ${w * h}`
    );
  }
}

// The square sizes this function returned BEFORE it took a ratio must be
// byte-identical, so the change cannot have silently moved what every existing
// caller receives.
check('gpt 1080p square is unchanged', openaiImageSize('1080p') === '1024x1024', openaiImageSize('1080p'));
check('gpt 2K square is unchanged', openaiImageSize('2K') === '1536x1536', openaiImageSize('2K'));
check('gpt 4K square is unchanged', openaiImageSize('4K') === '2048x2048', openaiImageSize('4K'));

// An unparseable ratio must degrade to the square rather than throw or emit
// something the API will refuse — the adapters have no size-specific error to
// recognise, and OpenAI documents that image user errors must not be retried.
for (const junk of ['', 'wide', '16-9', '0:0', '1:', ':1', '-1:2']) {
  const size = openaiImageSize('2K', junk);
  check(`gpt degrades "${junk}" to the square`, size === '1536x1536', `got ${size}`);
  const f = fluxSize('2K', junk);
  check(`flux degrades "${junk}" to a declared shape`, (FLUX_ASPECT_RATIOS as readonly string[]).includes(f.aspect_ratio), `got ${f.aspect_ratio}`);
}

// Every platform the campaign route accepts must exist in the framing table —
// campaign's z.enum is its own list, and a platform in one and not the other
// means images silently composed for the wrong canvas.
const CAMPAIGN_ENUM = ['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook'];
for (const p of CAMPAIGN_ENUM) {
  check(`campaign platform "${p}" has a framing entry`, PLATFORM_IDS.includes(p as PlatformId));
}

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n[image-canvas] ${failures.length} of ${passed + failures.length} checks FAILED`);
  process.exit(1);
}
console.log(`[image-canvas] ${passed} checks passed`);
