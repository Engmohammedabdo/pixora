import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizePrompt } from '@/lib/ai/prompts/safety';
import { buildBrandContextBlock, type BrandContextPromptInput } from '@/lib/ai/prompts/brand-context';

/**
 * Which Brand Kit is this Generation for?
 *
 * See CONTEXT.md ("Working Identity") for the concept and
 * docs/adr/0001-a-foreign-kit-id-resolves-to-no-identity.md for the one rule in
 * here that will look wrong to a future reader.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Measured 2026-09-01, before this file: the question was answered at EIGHT
 * deciding sites with SIX different rules, seven of them in the browser.
 *
 *   plan / analysis          the account default; the project is IGNORED
 *   storyboard               a raw unvalidated id out of localStorage
 *   campaign                 project ?? (toggle ? default), toggle OFF by default
 *   creator                  project ?? (toggle ? default), toggle ON by default
 *   photoshoot / edit page   project ?? default
 *   edit ROUTE               explicit -> project -> is_default DESC, created_at DESC
 *
 * Only `edit` resolved anything server-side. Every other studio believed an id
 * the browser computed, so any caller that was not that exact page — a restored
 * past run, an automation, and `scripts/live/`, which never sent one at all —
 * produced a paid prompt with no business identity in it and nothing reporting
 * the absence.
 *
 * ── THE RULE, STATED ONCE ──────────────────────────────────────────────────
 *
 *   1. an explicit `brandKitId` — the customer is looking at that kit, and that
 *      beats any inference;
 *   2. the selected Project's kit — switching client switches identity, which is
 *      what client workspaces are sold for;
 *   3. the account default.
 *
 * Step 1 does NOT fall through when the id is not the caller's. That is
 * deliberate and it is ADR-0001: the id is stale because the customer was
 * working on a different client a moment ago, so substituting the nearest kit is
 * exactly "one client's look leaks into another's shoot". `source` reports it.
 *
 * ── ON THROWING ────────────────────────────────────────────────────────────
 *
 * This function runs `sanitizePrompt` and therefore throws `PromptBlockedError`.
 * Call it ABOVE `reserveCredits()`, always. `check-invariants`'s
 * `working-identity-before-reserve` rule fails the build otherwise. Filtering
 * after the reservation is the defect that regressed twice in this repo already
 * (`sanitize-before-reserve`'s own header records it).
 *
 * WHAT IT FILTERS, AND WHY IT IS NOT MORE THAN BEFORE. The four business-fact
 * columns always meet the filter, because `buildBrandContextBlock` already ran
 * in all seven routes — that is the status quo, moved. The three colour columns,
 * `brand_voice` and the standalone `name` are filtered ONLY when the caller asks
 * for them via `need`.
 *
 * The first version of this module filtered all of them unconditionally, and
 * that was wrong. `sanitizePrompt` THROWS rather than stripping, and its
 * blocklist contains ordinary marketing words — `kill`, `gun`, `weapon`. A
 * customer whose `brand_voice` reads "killer offers, no fluff" can today still
 * use plan, analysis, storyboard, photoshoot and edit, because none of those
 * five reads that column. Filtering it for all of them would have turned five
 * working studios into a 400 naming a term that appears nowhere in the form the
 * customer just filled in — a widening of a customer-facing failure, sold as
 * consistency. `need` makes the throw surface exactly the read surface.
 *
 * It does close one real hole: `lib/ai/prompts/photoshoot.ts` interpolated
 * `primary_color`/`secondary_color` with no filter and no cap — the only
 * unfiltered brand-kit read in any builder. photoshoot passes `need: ['colors']`
 * and gets capped values.
 */

/** The columns any prompt path reads. Measured: no `lib/ai/**` file touches
 *  another one. `select('*')` returned all 17 in six of the seven routes, so
 *  `logo_url`, the two font columns, `website_url`, `user_id` and `created_at`
 *  were being carried into the prompt path by every one of them and read by
 *  nothing. `is_default` is here for the ordering in step 3, not for a prompt. */
export const WORKING_IDENTITY_COLUMNS =
  'id, name, industry, description, target_audience, city, primary_color, secondary_color, accent_color, brand_voice, is_default';

export interface WorkingIdentityKit {
  id: string;
  name: string;
  industry: string | null;
  description: string | null;
  target_audience: string | null;
  city: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  brand_voice: string | null;
  is_default: boolean;
}

/** Which step answered. `'none'` means no kit is in force — a reportable state,
 *  never an error. See ADR-0001. */
export type IdentitySource = 'explicit' | 'project' | 'account' | 'none';

/** The five business-fact fields a studio may suppress because its own form
 *  already collects them. `plan` and `analysis` are the only callers today, and
 *  the rule they state is not a fixed list — it is "whatever THIS studio asks
 *  the customer for" — which is why it is a parameter and not a constant. */
export type BusinessField = keyof BrandContextPromptInput;

export interface WorkingIdentity {
  /** The resolved kit, narrowed to `WORKING_IDENTITY_COLUMNS`. */
  kit: WorkingIdentityKit | null;
  source: IdentitySource;
  /** The five fields, reshaped and with `omit` applied. Pass to any builder that
   *  takes `BrandContextPromptInput` and calls `buildBrandContextBlock` itself. */
  context: BrandContextPromptInput | null;
  /** The built CLIENT CONTEXT block. `''` when there is nothing to say. Pass to
   *  the builders that take a pre-built string (`photoshoot`, `edit`). */
  block: string;
  /** `true` only when `block` is non-empty. "A kit resolved" and "the kit had
   *  something to say" are different facts and were indistinguishable before:
   *  `buildBrandContextBlock` returns `''` for every kit created before
   *  migration 045, which is the common shape, not an edge case. */
  contributed: boolean;
  /** Capped at 100 — the length five of the six existing sites already used.
   *  `creator/route.ts`'s 200 was the outlier and is gone. */
  safeName: string | null;
  /** Capped at 40 each, the length `edit` already used. */
  safeColors: { primary: string; secondary: string; accent: string } | null;
  /** Composed from the capped parts above rather than by re-filtering a raw
   *  concatenation, so the components and the line can never disagree. */
  safeColorLine: string | null;
  /** Capped at 500 — the length creator and campaign already used. */
  safeVoice: string | null;
}

const NO_IDENTITY: WorkingIdentity = {
  kit: null,
  source: 'none',
  context: null,
  block: '',
  contributed: false,
  safeName: null,
  safeColors: null,
  safeColorLine: null,
  safeVoice: null,
};

export interface ResolveWorkingIdentityOptions {
  /**
   * The customer said "not this time". Checked BEFORE step 1 and terminal:
   * no query, no fallback, `source: 'none'`.
   *
   * "No explicit id" and "no identity, deliberately" are different requests and
   * the three-step ladder cannot tell them apart. creator and campaign both
   * render an Apply-Brand-Kit toggle whose OFF state simply omits `brandKitId`;
   * with only the ladder, turning it off resolved the project's kit or the
   * account default instead — silently overriding the one control the customer
   * has for saying no. Caught by adversarial review of this very conversion,
   * which is the fourth consecutive round in this repo where that step found
   * more than the gates did.
   */
  optedOut?: boolean;
  /** Step 1. The kit the customer is looking at, straight off the request. */
  brandKitId?: string;
  /** Step 2. MUST be the value returned by `resolveProjectId()`, never the raw
   *  `input.projectId` — that one has not been proved to belong to the caller. */
  projectId?: string | null;
  /** Fields this studio's own form already collects. Omitted from `context` and
   *  therefore from `block`, so the prompt cannot carry two business identities
   *  and two `- Industry:` lines. `plan/route.ts` and `analysis/route.ts` record
   *  what that produced at 5 and 3 credits a run. */
  omit?: readonly BusinessField[];
  /**
   * The extra columns THIS studio's prompt actually reads. Each one is filtered
   * and capped only when asked for, and `sanitizePrompt` throws, so this is the
   * throw surface as well as the read surface — keeping the two identical is the
   * whole point. Ask for nothing and nothing beyond the four business facts is
   * filtered, which is what plan and analysis need.
   *
   * Today: storyboard ['name'] · photoshoot ['colors'] · edit ['colors'] ·
   * creator and campaign ['name','colors','voice'] · plan and analysis none.
   * Each list was read off the builder that consumes it, not guessed.
   */
  need?: readonly WorkingIdentityExtra[];
}

/** The brand-kit columns beyond the four business facts. */
export type WorkingIdentityExtra = 'name' | 'colors' | 'voice';

/**
 * Resolve the Working Identity for one Generation.
 *
 * Query cost: ONE query when `brandKitId` is supplied — which is what every
 * studio page sends today, so the hot path is unchanged. Two when a project must
 * be consulted, two when falling through to the account default. `creator`'s
 * `Promise.all` (creator/route.ts:143-154) parallelised three reads precisely
 * because its kit read never consulted the project; call this alongside the
 * profile read instead of inside that group and the parallelism is preserved on
 * the path that matters.
 */
export async function resolveWorkingIdentity(
  supabase: SupabaseClient,
  userId: string,
  opts: ResolveWorkingIdentityOptions = {},
): Promise<WorkingIdentity> {
  // Before step 1, and before any query: an explicit refusal is an answer.
  if (opts.optedOut) return NO_IDENTITY;
  const kit = await findKit(supabase, userId, opts);
  if (!kit.row) return { ...NO_IDENTITY, source: kit.source };
  return describe(kit.row, kit.source, opts.omit, opts.need);
}

async function findKit(
  supabase: SupabaseClient,
  userId: string,
  opts: ResolveWorkingIdentityOptions,
): Promise<{ row: WorkingIdentityKit | null; source: IdentitySource }> {
  // ── Step 1: an explicit id. Terminal either way — see ADR-0001. ──────────
  if (opts.brandKitId) {
    const row = await kitById(supabase, userId, opts.brandKitId);
    return row ? { row, source: 'explicit' } : { row: null, source: 'none' };
  }

  // ── Step 2: the project's kit. ──────────────────────────────────────────
  if (opts.projectId) {
    const { data: project } = await supabase
      .from('projects')
      .select('brand_kit_id')
      .eq('id', opts.projectId)
      .eq('user_id', userId)
      .single();
    const projectKitId = project?.brand_kit_id ?? null;
    if (projectKitId) {
      const row = await kitById(supabase, userId, projectKitId);
      // A project pointing at a kit that no longer resolves is NOT the stale-id
      // case ADR-0001 refuses to fall through: nothing here came from the
      // browser, `projects.brand_kit_id` is `ON DELETE SET NULL` (011:8), and the
      // customer never asked for that specific kit. Falling through to their
      // account default is the right answer.
      if (row) return { row, source: 'project' };
    }
  }

  // ── Step 3: the account default. ────────────────────────────────────────
  // `nullsFirst: false` is load-bearing until migration 046 is applied and
  // redundant afterwards, and it is stated either way. Postgres orders a boolean
  // DESC as NULLS FIRST and supabase-js emits no directive when this is
  // undefined (postgrest-js PostgrestTransformBuilder.ts:339-341), so without it
  // a NULL row outranks a genuinely `true` one — while the client's
  // `find(kit => kit.is_default)` skips the NULL. That divergence is exactly what
  // this module exists to remove, so it must not be reintroduced by its own query.
  const { data } = await supabase
    .from('brand_kits')
    .select(WORKING_IDENTITY_COLUMNS)
    .eq('user_id', userId)
    .order('is_default', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);

  const row = (data?.[0] as WorkingIdentityKit | undefined) ?? null;
  return row ? { row, source: 'account' } : { row: null, source: 'none' };
}

async function kitById(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<WorkingIdentityKit | null> {
  // Scoped by `user_id` as well as `id`. RLS already restricts the rows, but the
  // scope is stated here too: this is the one query in the module a customer
  // supplies an id to, and a module that relies on a policy it does not name is
  // a module that breaks silently if the policy is ever widened.
  const { data } = await supabase
    .from('brand_kits')
    .select(WORKING_IDENTITY_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .single();
  return (data as WorkingIdentityKit | null) ?? null;
}

function describe(
  row: WorkingIdentityKit,
  source: IdentitySource,
  omit: readonly BusinessField[] = [],
  need: readonly WorkingIdentityExtra[] = [],
): WorkingIdentity {
  const wanted = new Set<WorkingIdentityExtra>(need);
  const drop = new Set<BusinessField>(omit);
  const pick = (field: BusinessField, value: string | null): string | null =>
    drop.has(field) ? null : value;

  const context: BrandContextPromptInput = {
    name: pick('name', row.name ?? null),
    industry: pick('industry', row.industry ?? null),
    description: pick('description', row.description ?? null),
    targetAudience: pick('targetAudience', row.target_audience ?? null),
    city: pick('city', row.city ?? null),
  };

  // Built here, not by the caller. This is where `sanitizePrompt` meets the four
  // business columns, so it is also where `PromptBlockedError` is thrown — above
  // the reservation, at every call site, without seven routes each remembering to.
  const block = buildBrandContextBlock(context);

  // Each of these runs `sanitizePrompt`, which THROWS. Computing one the caller
  // will not read turns a working generation into a 400 over a column that
  // studio's prompt never sees — see the header. Gated on `need`, not on truthiness.
  const safeColors = wanted.has('colors')
    ? {
        primary: sanitizePrompt(String(row.primary_color ?? ''), 40),
        secondary: sanitizePrompt(String(row.secondary_color ?? ''), 40),
        accent: sanitizePrompt(String(row.accent_color ?? ''), 40),
      }
    : null;

  return {
    kit: row,
    source,
    context,
    block,
    contributed: block !== '',
    // NOT gated on `omit`: a studio that suppresses the `- Business:` line in the
    // context block may still label the image itself with the brand name, and
    // `creator` does exactly that. `omit` is about the CLIENT CONTEXT block.
    safeName: wanted.has('name') && row.name ? sanitizePrompt(String(row.name), 100) : null,
    safeColors,
    safeColorLine: safeColors
      ? `Primary ${safeColors.primary}, Secondary ${safeColors.secondary}, Accent ${safeColors.accent}`
      : null,
    safeVoice: wanted.has('voice') && row.brand_voice ? sanitizePrompt(String(row.brand_voice), 500) : null,
  };
}
