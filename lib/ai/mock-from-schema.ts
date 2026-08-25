/**
 * Build a development mock that matches the shape the CALLER asked for.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * With no API keys configured — the normal state of a fresh clone —
 * `POST /api/studios/plan` returned `500 generation_parse_failed` on every call.
 * Found by running the product, not by reading it.
 *
 * Neither the router nor the parser was at fault. `lib/ai/gemini.ts` returned
 * `getMockCampaignText()` for EVERY text studio, so a plan request came back as
 * campaign JSON (`scenario`/`caption`/`hashtags`) which cannot parse as a plan;
 * and `lib/ai/openai.ts` returned the literal `{"mock": true}`, valid JSON of
 * the wrong shape for all five. Four of the five text studios were unusable
 * locally, and the symptom — "parse failed" — pointed at the parser rather than
 * at the missing key.
 *
 * Production was never affected: `rejectMockInProduction()` (router.ts:157)
 * turns a mock into a provider outage there, so an unconfigured provider fails
 * loudly instead of selling filler. This is a development-fidelity bug, and its
 * cost is that a developer cannot tell "you have no API key" from "the model
 * returned rubbish".
 *
 * ── WHY IT IS STATED ON THE SCHEMA, NOT PER STUDIO ─────────────────────────
 * Every text studio already passes a `responseSchema` (lib/ai/response-schemas.ts)
 * down to both adapters. Deriving the mock FROM that schema means a new studio
 * gets a correct mock for free, and the mock cannot drift from the schema the way
 * a hand-written per-studio fixture would — which is precisely how one campaign
 * fixture came to serve all five.
 *
 * The schemas are an OpenAPI 3.0 SUBSET (`type`, `properties`, `items`,
 * `required` — no `$ref`, no `oneOf`), which is what makes this walk small and
 * total. See the header of lib/ai/response-schemas.ts for why the subset is
 * mandatory.
 */

/** Marks every generated leaf, so a mock can never be mistaken for real output
 *  in a log, a screenshot or a database row someone is reading later. */
const MOCK_MARK = '[mock]';

function leafString(key: string): string {
  return `${MOCK_MARK} ${key || 'value'}`;
}

/**
 * Arrays are filled with THREE entries, not one.
 *
 * One entry hides the bugs that only appear with several: a `.map()` that
 * renders but a `key` collision that does not, a layout that only breaks at the
 * second row, a "first item is special" branch. Three is the smallest count that
 * exercises first / middle / last.
 */
const ARRAY_FILL = 3;

function build(schema: unknown, key: string, depth: number): unknown {
  // A malformed or unknown schema degrades to a string rather than throwing.
  // The mock path must never be the thing that takes down a dev server.
  if (typeof schema !== 'object' || schema === null) return leafString(key);
  const s = schema as Record<string, unknown>;

  // Guards a schema that is cyclic or absurdly deep. The real ones are 3 levels.
  if (depth > 8) return leafString(key);

  switch (s.type) {
    case 'object': {
      const props = (s.properties ?? {}) as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(props)) {
        out[name] = build(sub, name, depth + 1);
      }
      return out;
    }
    case 'array': {
      const items = s.items;
      return Array.from({ length: ARRAY_FILL }, (_, i) =>
        build(items, `${key} ${i + 1}`, depth + 1)
      );
    }
    case 'number':
    case 'integer':
      return 1;
    case 'boolean':
      return true;
    case 'string':
    default:
      return leafString(key);
  }
}

/**
 * A JSON string matching `schema`, ready to be returned as a model response.
 *
 * Returns a string rather than an object because that is what the adapters'
 * `text` field carries and what each studio's `text.match(/\{[\s\S]*\}/)`
 * extractor consumes — the mock therefore travels the SAME path as a real
 * response instead of a shortcut around it.
 */
export function mockFromSchema(schema: unknown): string {
  return JSON.stringify(build(schema, 'field', 0));
}
