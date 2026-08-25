import { z } from 'zod/v4';

/**
 * What each text studio PARSES back — the counterpart to lib/ai/response-schemas.ts,
 * which is what we ASK the model for.
 *
 * ── WHY THESE LEFT THE ROUTES ──────────────────────────────────────────────
 * Each of these lived as a module-private const inside its own `route.ts`, so
 * nothing outside that route could run them — and a route file cannot export
 * anything else without failing `next build` (the generated route validator
 * constrains the module's non-handler exports to `never`; verified, not assumed).
 *
 * That mattered the moment the development mock started being derived from the
 * response schema: `scripts/tests/mock-from-schema.test.ts` could only check the
 * mock against a RE-IMPLEMENTATION of conformance living in the test itself, and
 * that re-implementation walks the OpenAPI subset — which carried no `minItems`.
 * So a mock of three storyboard scenes "conformed", the test passed, and
 * `POST /api/studios/storyboard` still threw `ScenesSchema.parse` in dev: 3 of the
 * 9 scenes a 14-credit storyboard is sold as. The only thing that decides whether
 * a mock works is the studio's OWN parser, and the test could not reach it.
 *
 * Moving them here is also a straight dedupe: `printable`, `numeric` and
 * `hasPrintableText` had four near-identical copies across five routes.
 *
 * ── THE RULE THESE SHARE ───────────────────────────────────────────────────
 * Completeness is stated on CONTENT, never on `.length`. Every leaf below
 * `.catch('')`-defaults, which never fails — it turns a non-printable value into
 * an empty string. So a non-empty array proves nothing: `{"objectives":[{},{}]}`
 * parses into two entries of empty strings, and counting entries sold that as a
 * finished deliverable. Only fields a screen actually prints may vouch for a
 * result.
 */

/** A field the UI prints. A number where prose was asked for is not worth a
 *  refund; a missing one becomes an empty cell, not `undefined` on screen. */
const printable = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v))
  .catch('');

const printableList = z.array(printable).catch([]);

const numeric = z
  .union([z.number(), z.string()])
  .transform((v) => (Number.isFinite(Number(v)) ? Number(v) : 0))
  .catch(0);

/** Does this section actually SHOW the customer anything? Numbers are left out
 *  on purpose — a week index or a percentage is not a deliverable. */
function hasPrintableText(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasPrintableText);
  return false;
}

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

/*
 * The model's JSON was accepted on "did JSON.parse succeed", finalized as
 * `completed`, and the 5 credits kept. The page then dereferenced nested arrays
 * the top-level types called optional — `plan.budget.breakdown.map`,
 * `week.content.map` — and a render throw trips the segment error boundary, so
 * the customer paid and got a generic Arabic error instead of a plan.
 *
 * Shape is checked BEFORE finalizing so a wrong one takes the existing
 * parse-failure branch (refund + `generation_parse_failed`) rather than being
 * sold, and the value stored and returned is the PARSED one — so the row
 * RecentWork restores later is normalized too.
 */
export const PlanSchema = z
  .object({
    objectives: z.array(z.object({ goal: printable, kpi: printable, target: printable }).loose()).catch([]),
    channels: z.array(z.object({ name: printable, budget_pct: numeric, strategy: printable }).loose()).catch([]),
    calendar: z
      .array(z.object({ week: numeric, content: z.array(printable).catch([]), channel: printable }).loose())
      .catch([]),
    budget: z
      .object({
        total: printable,
        breakdown: z.array(z.object({ item: printable, amount: printable, pct: numeric }).loose()).catch([]),
      })
      .loose()
      .optional()
      .catch(undefined),
    kpis: z.array(z.object({ metric: printable, target: printable, tracking: printable }).loose()).catch([]),
  })
  .loose()
  // Every section above defaults to empty, so `{}` would otherwise parse and be
  // charged for. A plan with nothing in any section is the same failure the
  // campaign studio already treats as one: an empty response sold as nine posts.
  .refine((p) => {
    // Only sections the customer can actually SEE may vouch for a plan. The page
    // renders exactly four tabs — objectives, channels, calendar, budget
    // (plan/page.tsx:146-149) — and there is no generatePlanPdf, so nothing else
    // consumes the parsed object either.
    //
    // `kpis` used to sit in this list. It is parsed and stored and rendered nowhere,
    // so a response carrying nothing but kpis passed the gate, was finalized
    // `completed`, kept the 5 credits, and left the customer looking at four empty
    // tabs with no error. Do not add a section here without first pointing at the
    // code that prints it.
    const sections: unknown[] = [
      p.objectives.map((o) => [o.goal, o.kpi, o.target]),
      p.channels.map((c) => [c.name, c.strategy]),
      p.calendar.map((w) => [w.content, w.channel]),
      p.budget?.breakdown.map((b) => [b.item, b.amount]) ?? [],
    ];
    return sections.some(hasPrintableText);
  }, 'model returned no usable plan sections');

// ---------------------------------------------------------------------------
// analysis
// ---------------------------------------------------------------------------

/*
 * Same defect, same shape: JSON.parse success was treated as a result, the page
 * then dereferenced the SWOT quadrant arrays — `q.items.map`, guarded only by
 * `analysis.swot` being truthy — and the customer paid 3 credits for a generic
 * Arabic error. Sections nothing renders (usp/gtm/pricing) ride through on the
 * top-level `.loose()` untouched.
 */
export const AnalysisSchema = z
  .object({
    swot: z
      .object({
        strengths: printableList,
        weaknesses: printableList,
        opportunities: printableList,
        threats: printableList,
      })
      .loose()
      .optional()
      .catch(undefined),
    personas: z
      .array(
        z
          .object({
            name: printable, age: printable, role: printable,
            goals: printable, pain_points: printable, channels: printable,
          })
          .loose(),
      )
      .catch([]),
    competitors: z
      .array(z.object({ name: printable, strengths: printable, weaknesses: printable, market_share: printable }).loose())
      .catch([]),
    roadmap: z
      .object({ day_30: printableList, day_60: printableList, day_90: printableList })
      .loose()
      .optional()
      .catch(undefined),
    kpis: z.array(z.object({ metric: printable, target: printable, timeframe: printable }).loose()).catch([]),
  })
  .loose()
  .refine((a) => {
    const swot = a.swot;
    const roadmap = a.roadmap;
    const sections: unknown[] = [
      swot ? [swot.strengths, swot.weaknesses, swot.opportunities, swot.threats] : [],
      roadmap ? [roadmap.day_30, roadmap.day_60, roadmap.day_90] : [],
      a.personas.map((p) => [p.name, p.age, p.role, p.goals, p.pain_points, p.channels]),
      a.competitors.map((c) => [c.name, c.strengths, c.weaknesses, c.market_share]),
      a.kpis.map((k) => [k.metric, k.target, k.timeframe]),
    ];
    return sections.some(hasPrintableText);
  }, 'model returned no usable analysis sections');

// ---------------------------------------------------------------------------
// storyboard
// ---------------------------------------------------------------------------

// Only `visual_description` is required: a scene without one is not a scene, and
// that is the field the page dereferences. Everything else is decoration — one
// thin field must never cost the customer the whole 14 credits.
export const SceneSchema = z
  .object({
    scene_number: numeric,
    visual_description: z.string().min(1),
    dialogue: printable,
    camera_angle: printable,
    camera_movement: printable,
    duration_seconds: numeric,
    mood: printable,
    music_note: printable,
  })
  .loose();

/**
 * The number of scenes a storyboard is sold as and priced for: the prompt asks for
 * "exactly 9 scenes" (lib/ai/prompts/storyboard.ts), STORYBOARD_RESPONSE_SCHEMA's
 * `minItems` asks the model for the same number, and the flat 14-credit price is
 * built on it. Mirrors EXPECTED_POSTS.
 */
export const EXPECTED_SCENES = 9;

/**
 * `.min(1)` accepted one scene of the nine that were sold, marked the row completed
 * and kept all 14 credits. A storyboard is not a bag of independent items like a
 * campaign's posts — its scene durations must sum to the requested video length, so
 * a short response is unusable rather than partial. Refusing here routes it into the
 * existing parse-failure branch: full refund, `generation_parse_failed`, free retry.
 */
export const ScenesSchema = z.array(SceneSchema).min(EXPECTED_SCENES);

// ---------------------------------------------------------------------------
// campaign
// ---------------------------------------------------------------------------

export const CampaignPostSchema = z.object({
  scenario: z.string(),
  caption: z.string(),
  tov: z.string(),
  schedule: z.string(),
  hashtags: z.string(),
});

/**
 * The number of posts a campaign is sold as and priced for:
 * lib/ai/prompts/campaign.ts:40 asks for "exactly 9 posts",
 * CAMPAIGN_RESPONSE_SCHEMA's `minItems` asks the model for the same number, the
 * reservation is described as "Campaign - 9 posts", and the flat 12-credit price
 * decomposes as 9 images x 1 credit + 3 for the text. Every refund in
 * campaign/route.ts is sized against this, never against what the model happened
 * to return.
 */
export const EXPECTED_POSTS = 9;

// ---------------------------------------------------------------------------
// prompt-builder
// ---------------------------------------------------------------------------

/**
 * What the route hands back. Every field is one the page renders.
 *
 * `printable` rather than z.string(): a model that returns a number for `style`
 * should cost the customer a plain-looking card, not a 500.
 */
export const PromptListSchema = z
  .array(z.object({ prompt: printable, style: printable, tip: printable }).loose())
  .min(1)
  // Stated on CONTENT, not on length: every leaf above `.catch('')`-defaults, so a
  // non-empty array proves nothing — `[{},{}]` would otherwise pass as a result.
  .refine((list) => list.some((p) => p.prompt.trim().length > 0), 'model returned no usable prompts');
