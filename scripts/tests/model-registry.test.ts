/**
 * THE IMAGE MODEL ON THE PAID PATH IS A PRICED CHOICE, NOT A STRING.
 *
 * `MODELS.openaiImage` reads `PYRA_MODEL_OPENAI_IMAGE`, so the model serving the
 * fallback image path can be changed on production with no code, no review and no
 * gate. On 2026-09-08 that stopped being harmless: OpenAI shipped gpt-image-2.5 as
 * TWO ids (`-flare`, `-sunburst`, and no bare `gpt-image-2.5`), and added quality
 * tiers `xhigh` and `max` above `high` — documented at **$0.211 per 1024x1024 at
 * `max`**, against $0.119-$0.240 of revenue for a 4K image depending on plan.
 *
 * We USED to send no `quality`, so the default `"auto"` applied and the ceiling was
 * whatever the configured model's ladder tops out at. Changing one env string
 * therefore moves a cost ceiling without touching anything that mentions money —
 * the exact shape of defect this repo's money-path rounds exist to prevent.
 *
 * ── WHAT THIS GATE CAN AND CANNOT DO, STATED ───────────────────────────────
 * It reads the SOURCE default in lib/ai/models.ts. It cannot read production's
 * env, so it cannot stop a bad value being set there — nothing in a build can.
 * What it does is make the registry the place the decision is recorded, and fail
 * the build if the shipped default drifts away from it. A gate that overstated
 * its reach would be worse than none, so: **this does not protect production from
 * an env override.** It protects the default, and it makes an unpriced model id
 * impossible to introduce quietly in code.
 */
import { readFileSync } from 'node:fs';
import { stripComments } from '../lib/strip-comments';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, OPENAI_IMAGE_MODELS } from '../../lib/ai/models.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`FAIL  ${name}${detail ? `  → ${detail}` : ''}`);
}

// ── 1. The shipped default is a model we have priced ───────────────────────
const configured = MODELS.openaiImage;
check(
  'the configured OpenAI image model is in the priced registry',
  Object.hasOwn(OPENAI_IMAGE_MODELS, configured),
  `${configured} — add it to OPENAI_IMAGE_MODELS with its quality ceiling, or revert`,
);

// ── 2. The registry is not empty and every entry is complete ───────────────
const ids = Object.keys(OPENAI_IMAGE_MODELS);
check('the registry names at least one model', ids.length > 0, `${ids.length}`);
const CEILINGS = ['low', 'medium', 'high', 'xhigh', 'max'];
for (const [id, entry] of Object.entries(OPENAI_IMAGE_MODELS)) {
  check(`${id}: quality ceiling is a real OpenAI tier`, CEILINGS.includes(entry.qualityCeiling), entry.qualityCeiling);
  check(`${id}: carries a note saying what it costs us`, entry.note.trim().length >= 40, entry.note);
}

// ── 3. gpt-image-1 can never come back ─────────────────────────────────────
// It shuts down 2026-12-01. A gate is cheaper than the outage.
check('the deprecated gpt-image-1 is not configured', configured !== 'gpt-image-1', configured);
check('the deprecated gpt-image-1 is not in the registry', !Object.hasOwn(OPENAI_IMAGE_MODELS, 'gpt-image-1'));

// ── 4. The id OpenAI does NOT publish must never be introduced ─────────────
// `gpt-image-2.5` is the name a human says and the name that 400s: the release
// shipped `-flare` and `-sunburst` only. This is the single likeliest wrong edit.
check('the non-existent bare "gpt-image-2.5" is not configured', configured !== 'gpt-image-2.5', configured);
check('the non-existent bare "gpt-image-2.5" is not in the registry', !Object.hasOwn(OPENAI_IMAGE_MODELS, 'gpt-image-2.5'));

// ── 5. Adopting a `max`-ceiling model requires sending an explicit quality ──
// The whole exposure is `auto` on a longer ladder. If a future edit points the
// default at a model whose ceiling is `xhigh` or `max`, the adapter MUST also
// have started sending a named quality — otherwise the cost ceiling moved and
// nothing that mentions money changed.
const adapter = stripComments(readFileSync(join(ROOT, 'lib/ai/openai.ts'), 'utf8'));
// The VALUE, not the key. The first version of this check asked only whether
// `quality:` appeared anywhere — so `quality: 'auto'`, `quality: 'max'` and a
// commented-out pin all passed, which is the whole exposure this file names.
// Comment-stripped, because the adapter documents the tiers in prose.
const PRICED_QUALITIES = ['low', 'medium', 'high'];
const pinned = adapter.match(/(?:^|[^\w.])quality\s*:\s*'([a-z]+)'/m)?.[1];
check('the image adapter pins an explicit quality', Boolean(pinned), 'no `quality:` in the comment-stripped adapter — the API default "auto" applies');
check(
  `the pinned quality is a priced tier (${PRICED_QUALITIES.join('/')}), never auto/xhigh/max`,
  Boolean(pinned) && PRICED_QUALITIES.includes(pinned as string),
  String(pinned),
);

// ── 6. The paid-provider clamps in the creator route ──────────────────────
// Added 2026-09-09 with the gpt switch, and both guard a hole that switch OPENED
// rather than one it inherited: creator's InputSchema takes a free model enum and
// the route never gated it by plan, which was harmless only while the form
// defaulted to gemini.
//
//   free  -> a $0 plan on the per-token provider BY DEFAULT, with signup open
//   4K    -> gemini switches to geminiImagePro for that tier (gemini.ts:187) and
//            gpt does not, so the 4-credit price would buy 4.19MP from a model it
//            was not set against
//
// Stated on the source because both are one line and one line is easy to delete
// while tidying. `servingModel` is asserted to be what actually reaches the
// router, so renaming the clamp without rewiring it fails here too.
const creator = readFileSync(join(ROOT, 'app/api/studios/creator/route.ts'), 'utf8');
check(
  'creator clamps the serving model for the free plan',
  /planId\s*===\s*'free'\s*\?\s*'gemini'/.test(creator),
  'a $0 plan must not default to the per-token provider',
);
check(
  'creator clamps 4K to the provider whose 4K the price was set against',
  /input\.resolution\s*===\s*'4K'\s*\?\s*'gemini'/.test(creator),
  'gemini.ts:187 switches model at 4K; gpt does not',
);
check(
  'the clamped model is the one handed to the router, not input.model',
  !/model:\s*input\.model/.test(creator),
  'a call site still passes input.model, so the clamp is decorative there',
);

check(
  'creator clamps a reference-image request to the provider that can take one',
  /input\.referenceImageUrl\s*\?\s*'gemini'/.test(creator),
  'only gemini takes a reference image (router.ts IMAGE_INPUT_CAPABLE); unclamped, every such paid run reports a fallback',
);

// Campaign is the other route that serves images — nine per run. The review of
// 2026-09-11 found it on gpt for every plan, free included: 9de39be switched it,
// and 8c9c0a6's free clamp was written, and gated, for creator only.
const campaign = stripComments(readFileSync(join(ROOT, 'app/api/studios/campaign/route.ts'), 'utf8'));
check(
  "campaign serves a free account's images on gemini",
  /planId\s*===\s*'free'\s*\?\s*'gemini'\s*:\s*'gpt'/.test(campaign),
  'the $0 rule must hold on the route that makes nine images per run',
);
check(
  'campaign reads the plan BEFORE the image fan-out',
  campaign.indexOf(".select('plan_id')") > -1 && campaign.indexOf(".select('plan_id')") < campaign.indexOf('generateImage('),
  'read after the images are made, the clamp cannot exist',
);

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n[model-registry] ${failures.length} of ${passed + failures.length} checks FAILED`);
  console.error('See the OPENAI_IMAGE_MODELS block in lib/ai/models.ts — a model id is a priced choice.');
  process.exit(1);
}
console.log(`[model-registry] ${passed} checks passed (configured: ${configured}, pinned quality: ${pinned})`);
