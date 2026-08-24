/**
 * Proof that each studio's response schema matches the Zod schema its route parses.
 *
 *   npx tsx scripts/tests/response-schemas.test.ts
 *
 * WHY A KEY-PARITY TEST AND NOT A ROUND TRIP
 *
 * The value of asking the model for JSON is lost entirely if the shape we ask for
 * is not the shape we then validate — we would have replaced "hope the prose
 * parses" with "hope the two schemas agree", which is worse because it looks
 * solved. The route schemas are declared inline in the route files and are not
 * exported; exporting them just to compare would be scope creep, so the expected
 * key set is stated here as a literal and must be updated deliberately when a route
 * schema changes. That is the point: a silent drift becomes a failing test.
 */
import {
  ANALYSIS_RESPONSE_SCHEMA,
  CAMPAIGN_RESPONSE_SCHEMA,
  PLAN_RESPONSE_SCHEMA,
  PROMPT_BUILDER_RESPONSE_SCHEMA,
  STORYBOARD_RESPONSE_SCHEMA,
} from '../../lib/ai/response-schemas';

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}\n        got      ${String(actual)}`);
  }
}

/** An object schema's top-level property names, sorted. */
function keysOf(schema: Record<string, unknown>): string {
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  return Object.keys(props).sort().join(',');
}

/** An array schema's ITEM property names, sorted. */
function itemKeysOf(schema: Record<string, unknown>): string {
  const items = (schema.items ?? {}) as Record<string, unknown>;
  const props = (items.properties ?? {}) as Record<string, unknown>;
  return Object.keys(props).sort().join(',');
}

// ---- Keys must match the Zod schema each route actually parses. ----
// PlanSchema — app/api/studios/plan/route.ts. `kpis` stays in the schema even
// though the completeness gate no longer counts it: it is parsed and stored, just
// not proof of a finished plan.
check('plan', keysOf(PLAN_RESPONSE_SCHEMA), 'budget,calendar,channels,kpis,objectives');

// AnalysisSchema — app/api/studios/analysis/route.ts
check('analysis', keysOf(ANALYSIS_RESPONSE_SCHEMA), 'competitors,kpis,personas,roadmap,swot');

// ScenesSchema — app/api/studios/storyboard/route.ts, an ARRAY of scenes.
check('storyboard is an array', STORYBOARD_RESPONSE_SCHEMA.type, 'array');
check(
  'storyboard scene',
  itemKeysOf(STORYBOARD_RESPONSE_SCHEMA),
  'camera_angle,camera_movement,dialogue,duration_seconds,mood,music_note,scene_number,visual_description'
);

// CampaignPostSchema — app/api/studios/campaign/route.ts, an ARRAY of posts.
check('campaign is an array', CAMPAIGN_RESPONSE_SCHEMA.type, 'array');
check('campaign post', itemKeysOf(CAMPAIGN_RESPONSE_SCHEMA), 'caption,hashtags,scenario,schedule,tov');

// prompt-builder returns an array of { prompt, style, tip }.
check('prompt-builder is an array', PROMPT_BUILDER_RESPONSE_SCHEMA.type, 'array');
check('prompt-builder item', itemKeysOf(PROMPT_BUILDER_RESPONSE_SCHEMA), 'prompt,style,tip');

// ---- Every schema must be a shape the providers actually accept. ----
for (const [name, schema] of Object.entries({
  plan: PLAN_RESPONSE_SCHEMA,
  analysis: ANALYSIS_RESPONSE_SCHEMA,
  storyboard: STORYBOARD_RESPONSE_SCHEMA,
  campaign: CAMPAIGN_RESPONSE_SCHEMA,
  promptBuilder: PROMPT_BUILDER_RESPONSE_SCHEMA,
})) {
  check(`${name}: declares a type`, typeof schema.type, 'string');
  const json = JSON.stringify(schema);
  // Gemini's responseSchema is an OpenAPI 3.0 subset and rejects these outright.
  check(`${name}: no $ref (unsupported by the OpenAPI subset)`, json.includes('"$ref"'), false);
  check(`${name}: no additionalProperties`, json.includes('"additionalProperties"'), false);
  check(`${name}: no oneOf`, json.includes('"oneOf"'), false);
}

if (failures > 0) {
  console.log(`\n[response-schemas] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[response-schemas] ${checks} checks passed`);
