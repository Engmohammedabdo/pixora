/**
 * The shape each text studio ASKS the model for.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * Five paid deliverables were extracted with `text.match(/\{[\s\S]*\}/)` from
 * free-form prose generated at temperature 0.7. The shape contract existed only as
 * English sentences inside the prompt, so a model that prefixed one explanatory
 * line still parsed, and one that wrapped two objects did not. Asking for JSON is
 * the difference between hoping and specifying.
 *
 * These mirror the Zod schemas the routes parse. Kept in ONE module so the two
 * cannot drift silently — scripts/tests/response-schemas.test.ts asserts key parity
 * against a literal key list, so a change to a route schema that is not reflected
 * here fails the build.
 *
 * OPENAPI 3.0 SUBSET ONLY. Gemini's `responseSchema` rejects `$ref`,
 * `additionalProperties` and `oneOf`; the OpenAI path shares the same object with
 * `strict: false`, which tolerates the subset. Do not "improve" these with JSON
 * Schema features — the failure is a 400 that costs all five studios their fallback
 * provider, which is the same shape as the max_tokens defect already documented in
 * lib/ai/openai.ts.
 *
 * The regex scrape at each call site is deliberately LEFT IN PLACE: it still
 * matches a pure-JSON body, so a model or endpoint that ignores these fields
 * degrades to the previous behaviour rather than failing.
 */

const text = { type: 'string' } as const;
const num = { type: 'number' } as const;
const textList = { type: 'array', items: text } as const;

export const PLAN_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    objectives: {
      type: 'array',
      items: { type: 'object', properties: { goal: text, kpi: text, target: text }, required: ['goal', 'kpi', 'target'] },
    },
    channels: {
      type: 'array',
      items: { type: 'object', properties: { name: text, budget_pct: num, strategy: text }, required: ['name', 'budget_pct', 'strategy'] },
    },
    calendar: {
      type: 'array',
      items: { type: 'object', properties: { week: num, content: textList, channel: text }, required: ['week', 'content', 'channel'] },
    },
    budget: {
      type: 'object',
      properties: {
        total: text,
        breakdown: {
          type: 'array',
          items: { type: 'object', properties: { item: text, amount: text, pct: num }, required: ['item', 'amount', 'pct'] },
        },
      },
      required: ['total', 'breakdown'],
    },
    kpis: {
      type: 'array',
      items: { type: 'object', properties: { metric: text, target: text, tracking: text }, required: ['metric', 'target', 'tracking'] },
    },
  },
  required: ['objectives', 'channels', 'calendar', 'budget'],
};

export const ANALYSIS_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    swot: {
      type: 'object',
      properties: { strengths: textList, weaknesses: textList, opportunities: textList, threats: textList },
      required: ['strengths', 'weaknesses', 'opportunities', 'threats'],
    },
    personas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: text, age: text, role: text, goals: text, pain_points: text, channels: text },
        required: ['name', 'age', 'role', 'goals', 'pain_points', 'channels'],
      },
    },
    competitors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: text, strengths: text, weaknesses: text, market_share: text },
        required: ['name', 'strengths', 'weaknesses', 'market_share'],
      },
    },
    roadmap: {
      type: 'object',
      properties: { day_30: textList, day_60: textList, day_90: textList },
      required: ['day_30', 'day_60', 'day_90'],
    },
    kpis: {
      type: 'array',
      items: { type: 'object', properties: { metric: text, target: text, timeframe: text }, required: ['metric', 'target', 'timeframe'] },
    },
  },
  required: ['swot', 'personas', 'competitors', 'roadmap'],
};

export const STORYBOARD_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      scene_number: num,
      visual_description: text,
      dialogue: text,
      camera_angle: text,
      camera_movement: text,
      duration_seconds: num,
      mood: text,
      music_note: text,
    },
    required: ['scene_number', 'visual_description', 'dialogue', 'camera_angle', 'camera_movement', 'duration_seconds', 'mood', 'music_note'],
  },
};

export const CAMPAIGN_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'array',
  items: {
    type: 'object',
    properties: { scenario: text, caption: text, tov: text, schedule: text, hashtags: text },
    required: ['scenario', 'caption', 'tov', 'schedule', 'hashtags'],
  },
};

export const PROMPT_BUILDER_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'array',
  items: {
    type: 'object',
    properties: { prompt: text, style: text, tip: text },
    required: ['prompt', 'style', 'tip'],
  },
};
