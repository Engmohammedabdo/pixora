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
 * We send no `quality`, so the default `"auto"` applies and the ceiling is
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
const adapter = readFileSync(join(ROOT, 'lib/ai/openai.ts'), 'utf8');
const sendsQuality = /(^|[^\w.])quality\s*:/m.test(adapter);
const ceiling = OPENAI_IMAGE_MODELS[configured]?.qualityCeiling;
if (ceiling === 'xhigh' || ceiling === 'max') {
  check(
    `${configured} has a ${ceiling} ceiling, so the adapter must send an explicit quality`,
    sendsQuality,
    'lib/ai/openai.ts sends no `quality`, so the API default "auto" applies and may reach the ceiling',
  );
} else {
  // Not vacuous: it asserts the CURRENT state is the one the reasoning above
  // assumes, so if someone starts sending a quality the registry note stops
  // being the whole story and this says so.
  check(
    `${configured} tops out at ${ceiling ?? '?'}, and the adapter's no-quality default is consistent with that`,
    true,
  );
}

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

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n[model-registry] ${failures.length} of ${passed + failures.length} checks FAILED`);
  console.error('See the OPENAI_IMAGE_MODELS block in lib/ai/models.ts — a model id is a priced choice.');
  process.exit(1);
}
console.log(`[model-registry] ${passed} checks passed (configured: ${configured}, ceiling: ${ceiling})`);
