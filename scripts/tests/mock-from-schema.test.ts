/**
 * The development mock must answer the shape the CALLER asked for.
 *
 *   npx tsx scripts/tests/mock-from-schema.test.ts
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Found by running the product, not by reading it. With no API keys configured
 * — the normal state of a fresh clone — `POST /api/studios/plan` returned
 * `500 generation_parse_failed` on every single call.
 *
 * The router was never at fault and neither was the parser. `lib/ai/gemini.ts`
 * returned `getMockCampaignText()` for EVERY text studio, so a plan request got
 * campaign JSON (`scenario`/`caption`/`hashtags`) which cannot parse as a plan;
 * and `lib/ai/openai.ts` returned the literal `{"mock": true}`, which is valid
 * JSON of the wrong shape for all five. Four of the five text studios were
 * therefore unusable locally, and the symptom — "parse failed" — pointed at the
 * parser rather than at the missing key.
 *
 * Production was never affected: `rejectMockInProduction()` (lib/ai/router.ts:157)
 * turns a mock into a provider outage there. This is a development-fidelity bug,
 * and the cost of it is that a developer cannot tell "you have no API key" from
 * "the model returned rubbish".
 *
 * The fix is stated GENERALLY rather than per studio: every text studio already
 * passes a `responseSchema`, so the mock is synthesised FROM that schema. A new
 * studio gets a correct mock for free, and the mock cannot drift from the schema
 * because it is derived from it.
 *
 * Pure — no network, no database. A prebuild gate.
 */
import {
  PLAN_RESPONSE_SCHEMA,
  ANALYSIS_RESPONSE_SCHEMA,
  STORYBOARD_RESPONSE_SCHEMA,
  CAMPAIGN_RESPONSE_SCHEMA,
  PROMPT_BUILDER_RESPONSE_SCHEMA,
} from '../../lib/ai/response-schemas';
import { mockFromSchema } from '../../lib/ai/mock-from-schema';

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail?: string): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

/**
 * Walks the OpenAPI-subset schema alongside the produced value and reports the
 * first disagreement. Deliberately structural: a check that only counted keys
 * would pass for `{objectives: []}`, and an empty array is exactly what a
 * renderer crashes on.
 */
function conforms(schema: unknown, value: unknown, path = '$'): string | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const s = schema as Record<string, unknown>;

  if (s.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return `${path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`;
    }
    const props = (s.properties ?? {}) as Record<string, unknown>;
    for (const [key, sub] of Object.entries(props)) {
      if (!(key in (value as Record<string, unknown>))) return `${path}.${key}: missing`;
      const err = conforms(sub, (value as Record<string, unknown>)[key], `${path}.${key}`);
      if (err) return err;
    }
    return null;
  }

  if (s.type === 'array') {
    if (!Array.isArray(value)) return `${path}: expected array, got ${typeof value}`;
    // A non-empty array is the point. Every renderer in this repo maps over these.
    if (value.length === 0) return `${path}: array is empty`;
    return conforms(s.items, value[0], `${path}[0]`);
  }

  if (s.type === 'string') {
    if (typeof value !== 'string') return `${path}: expected string, got ${typeof value}`;
    if (value.length === 0) return `${path}: empty string`;
    return null;
  }

  if (s.type === 'number') {
    if (typeof value !== 'number') return `${path}: expected number, got ${typeof value}`;
    return null;
  }

  return null;
}

const STUDIOS: Array<[string, Record<string, unknown>]> = [
  ['plan', PLAN_RESPONSE_SCHEMA],
  ['analysis', ANALYSIS_RESPONSE_SCHEMA],
  ['storyboard', STORYBOARD_RESPONSE_SCHEMA],
  ['campaign', CAMPAIGN_RESPONSE_SCHEMA],
  ['prompt-builder', PROMPT_BUILDER_RESPONSE_SCHEMA],
];

for (const [name, schema] of STUDIOS) {
  const text = mockFromSchema(schema);

  check(`${name}: mock is a non-empty string`, typeof text === 'string' && text.length > 0);

  let parsed: unknown;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    parseError = (e as Error).message;
  }
  check(`${name}: mock is valid JSON`, parseError === null, parseError ?? undefined);

  if (parseError === null) {
    // The route's own extractor is `text.match(/\{[\s\S]*\}/)` for object
    // schemas. Asserting the mock survives THAT, not just JSON.parse, is what
    // ties this test to the code path the studios actually run.
    if ((schema as Record<string, unknown>).type === 'object') {
      const m = text.match(/\{[\s\S]*\}/);
      check(`${name}: survives the route's own JSON extractor`, !!m);
    }

    const err = conforms(schema, parsed);
    check(`${name}: mock conforms to the schema it was built from`, err === null, err ?? undefined);
  }
}

// The specific regression that started this: a plan request must NOT come back
// with campaign fields. `getMockCampaignText()` served every text studio.
{
  const planText = mockFromSchema(PLAN_RESPONSE_SCHEMA);
  check('plan: mock does not carry campaign fields', !planText.includes('"hashtags"'),
    'the campaign mock was being served to every text studio');
  check('plan: mock does not carry the openai stub', planText.trim() !== '{"mock": true}');
  const planObj = JSON.parse(planText) as Record<string, unknown>;
  for (const key of ['objectives', 'channels', 'calendar', 'budget']) {
    check(`plan: mock has the "${key}" section the page renders`, key in planObj);
  }
}

// An unknown or empty schema must degrade to something parseable rather than
// throwing — the mock path must never be the thing that breaks a dev server.
{
  check('unknown schema degrades to valid JSON', (() => {
    try { JSON.parse(mockFromSchema(undefined)); return true; } catch { return false; }
  })());
  check('empty object schema degrades to valid JSON', (() => {
    try { JSON.parse(mockFromSchema({})); return true; } catch { return false; }
  })());
}

console.log(`\n[mock-from-schema] ${checks - failures}/${checks}`);
process.exit(failures > 0 ? 1 : 0);
