/**
 * Proof for the Working Identity rule (lib/brand-kits/working-identity.ts).
 *
 *   npx tsx scripts/tests/working-identity.test.ts
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * "Which Brand Kit is this Generation for?" was answered at EIGHT deciding sites
 * with SIX different rules, seven of them in the browser, and NOTHING asserted
 * any of them. There is still no gate today that would notice a studio sending
 * no business context at all — which is how `scripts/live/` came to run six of
 * the seven kit-capable studios with no identity for a month without anyone
 * seeing it.
 *
 * The dependency here is a Supabase client, so the seam is at that client and
 * the tests inject a stand-in. Every case below is stated through the module's
 * own interface — the resolved identity — never through its internals.
 *
 * ── WHAT THIS FILE CANNOT PROVE ────────────────────────────────────────────
 *
 * That the ROUTES call it, and call it above `reserveCredits()`. That is
 * `check-invariants`'s `working-identity-before-reserve` rule, and it has to be
 * a build rule rather than a test because the failure it guards is an absent
 * call, which no test of this module can see.
 */
import { PromptBlockedError } from '../../lib/ai/prompts/safety';
import {
  STUDIO_IDENTITY_POLICY,
  WORKING_IDENTITY_COLUMNS,
  resolveWorkingIdentity,
  type WorkingIdentityKit,
} from '../../lib/brand-kits/working-identity';

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
  }
}

function checkTrue(label: string, actual: boolean): void {
  check(label, actual, true);
}

// ── The stand-in ───────────────────────────────────────────────────────────
// Records every query it is asked for, so a case can assert what was NOT asked
// as well as what was — which is the whole of ADR-0001.

interface RecordedQuery {
  table: string;
  select: string;
  filters: Record<string, unknown>;
  order: { column: string; opts: unknown }[];
}

interface FakeRows {
  brand_kits?: Record<string, WorkingIdentityKit>;
  /** userId -> ordered rows for the step-3 list query */
  brand_kits_list?: WorkingIdentityKit[];
  projects?: Record<string, { brand_kit_id: string | null }>;
}

function fakeSupabase(rows: FakeRows): { client: never; queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    const q: RecordedQuery = { table, select: '', filters: {}, order: [] };
    queries.push(q);
    const builder = {
      select(cols: string) { q.select = cols; return builder; },
      eq(col: string, val: unknown) { q.filters[col] = val; return builder; },
      order(col: string, opts: unknown) { q.order.push({ column: col, opts }); return builder; },
      limit(_n: number) { return Promise.resolve({ data: listResult(q) }); },
      single() { return Promise.resolve({ data: singleResult(q) }); },
    };
    return builder;
  }

  function singleResult(q: RecordedQuery): unknown {
    if (q.table === 'projects') {
      const p = rows.projects?.[String(q.filters.id)];
      // Scoped by user_id in the module; the stand-in honours that so a case can
      // prove another customer's project is not readable.
      return p && q.filters.user_id ? p : null;
    }
    const kit = rows.brand_kits?.[String(q.filters.id)];
    if (!kit) return null;
    return q.filters.user_id && kit.id ? kit : null;
  }

  function listResult(q: RecordedQuery): unknown[] {
    if (q.table !== 'brand_kits') return [];
    return (rows.brand_kits_list ?? []).slice(0, 1);
  }

  return { client: { from } as unknown as never, queries };
}

function kit(over: Partial<WorkingIdentityKit> = {}): WorkingIdentityKit {
  return {
    id: 'kit-1',
    name: 'Shawarma Al Sham',
    industry: 'restaurants',
    description: 'A Damascus-style shawarma counter in Dubai Marina',
    target_audience: 'Office workers aged 25-40',
    city: 'Dubai',
    primary_color: '#3B82F6',
    secondary_color: '#8B5CF6',
    accent_color: '#F59E0B',
    brand_voice: 'warm and direct',
    is_default: true,
    ...over,
  };
}

const USER = 'user-1';

// Wrapped in main() rather than using top-level await: this repo runs its gates
// through tsx with a cjs output format, where top-level await is a transform
// error. scripts/tests/edit-effect.test.ts:66 is the same shape.
async function main(): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. The three steps, in order.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const { client, queries } = fakeSupabase({ brand_kits: { 'kit-1': kit() } });
    const id = await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1' });
    check('explicit: source', id.source, 'explicit');
    check('explicit: the kit', id.kit?.id, 'kit-1');
    check('explicit: ONE query, nothing else consulted', queries.length, 1);
    check('explicit: scoped to the caller', queries[0].filters.user_id, USER);
  }

  {
    const { client } = fakeSupabase({
      projects: { 'proj-1': { brand_kit_id: 'kit-2' } },
      brand_kits: { 'kit-2': kit({ id: 'kit-2', name: 'Noor Clinic' }) },
    });
    const id = await resolveWorkingIdentity(client, USER, { projectId: 'proj-1' });
    check('project: source', id.source, 'project');
    check('project: the kit', id.kit?.id, 'kit-2');
  }

  {
    const { client } = fakeSupabase({ brand_kits_list: [kit({ id: 'kit-9' })] });
    const id = await resolveWorkingIdentity(client, USER, {});
    check('account: source', id.source, 'account');
    check('account: the kit', id.kit?.id, 'kit-9');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ADR-0001 — a foreign or stale explicit id is TERMINAL.
  //
  // The assertion that matters is `queries.length === 1`. A version that returned
  // `source: 'none'` while still having consulted the project and the account
  // default would pass every check above and reintroduce the exact leak: one
  // client's identity silently substituted for another's.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const { client, queries } = fakeSupabase({
      // The requested kit is absent (it is someone else's, or deleted), but the
      // customer HAS a project with a kit and an account default. Neither may be used.
      projects: { 'proj-1': { brand_kit_id: 'kit-2' } },
      brand_kits: { 'kit-2': kit({ id: 'kit-2' }) },
      brand_kits_list: [kit({ id: 'kit-9' })],
    });
    const id = await resolveWorkingIdentity(client, USER, {
      brandKitId: 'kit-not-mine',
      projectId: 'proj-1',
    });
    check('stale id: source is none', id.source, 'none');
    check('stale id: no kit', id.kit, null);
    check('stale id: no context', id.context, null);
    check('stale id: no block', id.block, '');
    check('stale id: contributed is false', id.contributed, false);
    check('stale id: DOES NOT fall through — one query only', queries.length, 1);
  }

  // A project pointing at a kit that no longer resolves is NOT that case: nothing
  // came from the browser and the customer never named that kit, so the account
  // default is the right answer. Stated as its own case because the two look alike.
  {
    const { client } = fakeSupabase({
      projects: { 'proj-1': { brand_kit_id: 'kit-gone' } },
      brand_kits_list: [kit({ id: 'kit-9' })],
    });
    const id = await resolveWorkingIdentity(client, USER, { projectId: 'proj-1' });
    check('project kit missing: falls through to the account', id.source, 'account');
    check('project kit missing: the account kit', id.kit?.id, 'kit-9');
  }

  {
    const { client } = fakeSupabase({
      projects: { 'proj-1': { brand_kit_id: null } },
      brand_kits_list: [kit({ id: 'kit-9' })],
    });
    const id = await resolveWorkingIdentity(client, USER, { projectId: 'proj-1' });
    check('project with no kit attached: falls through', id.source, 'account');
  }

  {
    const { client } = fakeSupabase({});
    const id = await resolveWorkingIdentity(client, USER, {});
    check('no kits at all: source', id.source, 'none');
    check('no kits at all: kit', id.kit, null);
    check('no kits at all: block', id.block, '');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. The query shape. Both of these were live defects, not hypotheticals.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const { client, queries } = fakeSupabase({ brand_kits: { 'kit-1': kit() } });
    await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1' });
    check('never select(*)', queries[0].select.includes('*'), false);
    check('the named column list', queries[0].select, WORKING_IDENTITY_COLUMNS);
    check('logo_url is not fetched', queries[0].select.includes('logo_url'), false);
    check('font columns are not fetched', queries[0].select.includes('font_'), false);
    check('website_url is not fetched', queries[0].select.includes('website_url'), false);
  }

  {
    // `is_default` is nullable until migration 046 lands. Postgres orders a boolean
    // DESC as NULLS FIRST and supabase-js emits no directive when `nullsFirst` is
    // undefined, so without this a NULL row outranks a genuinely `true` one — while
    // `useBrandKit.ts:98`'s `find()` skips the NULL. That divergence is what this
    // module exists to remove; its own query must not recreate it.
    const { client, queries } = fakeSupabase({ brand_kits_list: [kit()] });
    await resolveWorkingIdentity(client, USER, {});
    const listQuery = queries[queries.length - 1];
    check('step 3 orders is_default first', listQuery.order[0]?.column, 'is_default');
    check('step 3 states nullsFirst: false', listQuery.order[0]?.opts, {
      ascending: false,
      nullsFirst: false,
    });
    check('step 3 tiebreaks on created_at DESC', listQuery.order[1], {
      column: 'created_at',
      opts: { ascending: false },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. `omit` — the two-identities defect, which cost 5 and 3 credits a run.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const { client } = fakeSupabase({ brand_kits: { 'kit-1': kit() } });
    const id = await resolveWorkingIdentity(client, USER, {
      brandKitId: 'kit-1',
      omit: ['name', 'industry', 'targetAudience'],
      need: ['name'],
    });
    check('omit: name dropped from context', id.context?.name, null);
    check('omit: industry dropped', id.context?.industry, null);
    check('omit: targetAudience dropped', id.context?.targetAudience, null);
    check('omit: description kept', id.context?.description, kit().description);
    check('omit: city kept', id.context?.city, 'Dubai');
    checkTrue('omit: the block carries no Industry line', !id.block.includes('- Industry:'));
    checkTrue('omit: the block carries no Business line', !id.block.includes('- Business:'));
    checkTrue('omit: the block still carries City', id.block.includes('- City: Dubai'));
    // safeName is NOT gated on omit: suppressing the CLIENT CONTEXT line is not
    // the same as forbidding the brand name everywhere, and `creator` labels the
    // image itself with it.
    check('omit: safeName survives', id.safeName, 'Shawarma Al Sham');
  }

  {
    const { client } = fakeSupabase({ brand_kits: { 'kit-1': kit() } });
    const id = await resolveWorkingIdentity(client, USER, {
      brandKitId: 'kit-1',
      omit: ['name', 'industry', 'targetAudience', 'description'],
    });
    check('analysis-shaped omit: only city survives', id.context, {
      name: null, industry: null, description: null, targetAudience: null, city: 'Dubai',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. `contributed` — "a kit resolved" and "the kit said something" differ.
  //
  // Every Brand Kit created before migration 045 has all four business columns
  // null, which is the COMMON shape, not an edge case. Before this flag existed,
  // a route could not tell that apart from a kit that was never attached.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const { client } = fakeSupabase({
      brand_kits: {
        'kit-1': kit({ industry: null, description: null, target_audience: null, city: null }),
      },
    });
    const id = await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1', need: ['name'] });
    check('name-only kit: a kit DID resolve', id.source, 'explicit');
    check('name-only kit: but it contributed nothing', id.contributed, false);
    check('name-only kit: empty block', id.block, '');
    check('name-only kit: the name is still usable', id.safeName, 'Shawarma Al Sham');
  }

  {
    const { client } = fakeSupabase({ brand_kits: { 'kit-1': kit() } });
    const id = await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1' });
    check('full kit: contributed', id.contributed, true);
    checkTrue('full kit: the block names the business', id.block.includes('Shawarma Al Sham'));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. One cap per column. Before this module `name` was capped at 200 in one
  //    route, 100 in five other places, and NOT AT ALL on campaign's override
  //    branch; the colour columns were capped at 40 in `edit`, folded into a
  //    200-cap string in `creator`, and read RAW in `photoshoot`.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const { client } = fakeSupabase({
      brand_kits: {
        'kit-1': kit({
          name: 'N'.repeat(500),
          brand_voice: 'V'.repeat(900),
          primary_color: 'P'.repeat(90),
          secondary_color: 'S'.repeat(90),
          accent_color: 'A'.repeat(90),
        }),
      },
    });
    const id = await resolveWorkingIdentity(client, USER, {
      brandKitId: 'kit-1',
      need: ['name', 'colors', 'voice'],
    });
    check('name capped at 100', id.safeName?.length, 100);
    check('brand_voice capped at 500', id.safeVoice?.length, 500);
    check('primary_color capped at 40', id.safeColors?.primary.length, 40);
    check('secondary_color capped at 40', id.safeColors?.secondary.length, 40);
    check('accent_color capped at 40', id.safeColors?.accent.length, 40);
    // Composed from the capped parts, never by re-filtering a raw concatenation,
    // so the three components and the line can never disagree about a value.
    check(
      'safeColorLine is built from the capped parts',
      id.safeColorLine,
      `Primary ${'P'.repeat(40)}, Secondary ${'S'.repeat(40)}, Accent ${'A'.repeat(40)}`,
    );
  }

  {
    const { client } = fakeSupabase({ brand_kits: { 'kit-1': kit({ brand_voice: null }) } });
    const id = await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1', need: ['voice'] });
    check('absent brand_voice is null, not an empty string', id.safeVoice, null);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. The filter throws, and the throw must reach the caller.
  //
  // This is what makes calling the module above `reserveCredits()` mandatory. If
  // this ever stopped throwing, a blocked term would be discovered after the money
  // moved — the ordering defect this repo has already regressed twice.
  // ─────────────────────────────────────────────────────────────────────────────
  {
    const { client } = fakeSupabase({
      brand_kits: { 'kit-1': kit({ description: 'we sell a gun for every home' }) },
    });
    let thrown: unknown = null;
    try {
      await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1' });
    } catch (e) {
      thrown = e;
    }
    checkTrue('a blocked business column throws', thrown instanceof PromptBlockedError);
    check('the blocked term is named', (thrown as PromptBlockedError)?.blockedTerm, 'gun');
  }

  {
    // The widening, stated as a case so it is a decision and not an accident:
    // `brand_voice` met the filter only in creator and campaign before this module.
    const { client } = fakeSupabase({
      brand_kits: { 'kit-1': kit({ brand_voice: 'aggressive, like a weapon' }) },
    });
    let thrown: unknown = null;
    try {
      await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1', need: ['voice'] });
    } catch (e) {
      thrown = e;
    }
    checkTrue('a blocked brand_voice throws when the studio READS it', thrown instanceof PromptBlockedError);
  }

  // ...and does NOT throw when it does not. This pair is the whole of the `need`
  // option, and the first version of this module got it wrong: it filtered every
  // column for every studio. `sanitizePrompt` THROWS rather than stripping, and
  // its blocklist holds ordinary marketing words — `kill`, `gun`, `weapon`. So a
  // customer whose brand_voice reads "killer offers, no fluff" would have lost
  // plan, analysis, storyboard, photoshoot and edit — five studios that never
  // read that column — to a 400 naming a term absent from the form they just
  // filled in. Four independent reviewers flagged it; they were right.
  {
    const { client } = fakeSupabase({
      brand_kits: { 'kit-1': kit({ brand_voice: 'aggressive, like a weapon' }) },
    });
    let thrown: unknown = null;
    let id = null;
    try {
      id = await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1' });
    } catch (e) {
      thrown = e;
    }
    check('a blocked brand_voice does NOT throw when the studio never reads it', thrown, null);
    check('...and the studio still gets its business context', id?.contributed, true);
    check('...with no voice, because it did not ask for one', id?.safeVoice, null);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8. The opt-out. "No explicit id" and "no identity, deliberately" are
  //    different requests, and the ladder alone cannot tell them apart —
  //    creator's Apply-Brand-Kit toggle simply omits brandKitId when OFF, so
  //    without this the ladder answered the customer's "no" with the account
  //    default. Found by adversarial review of the route conversion, not by any
  //    gate: every gate was green and the module's own 54 checks passed.
  // ───────────────────────────────────────────────────────────────────────────
  {
    const { client, queries } = fakeSupabase({
      projects: { 'proj-1': { brand_kit_id: 'kit-2' } },
      brand_kits: { 'kit-1': kit(), 'kit-2': kit({ id: 'kit-2' }) },
      brand_kits_list: [kit({ id: 'kit-9' })],
    });
    const id = await resolveWorkingIdentity(client, USER, {
      optedOut: true,
      brandKitId: 'kit-1',
      projectId: 'proj-1',
    });
    check('opted out: source is none', id.source, 'none');
    check('opted out: no kit', id.kit, null);
    check('opted out: no block', id.block, '');
    check('opted out: contributed is false', id.contributed, false);
    // The assertion that matters. It outranks an explicit id, the project and the
    // account default, and it costs no round trip at all.
    check('opted out: ZERO queries — it outranks even an explicit id', queries.length, 0);
  }

  {
    const { client } = fakeSupabase({ brand_kits: { 'kit-1': kit() } });
    const id = await resolveWorkingIdentity(client, USER, { optedOut: false, brandKitId: 'kit-1' });
    check('optedOut: false is not opting out', id.source, 'explicit');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 9. The per-studio policy table.
  //
  //    It exists because there are now TWO kinds of caller — the studio routes,
  //    which build a prompt, and /api/brand-kits/working-identity, which tells
  //    the customer what that prompt WOULD say. The first version of the GET
  //    passed neither list, so `blocked` could not fire for the columns campaign
  //    and storyboard actually filter, and `contributed` was computed over four
  //    business facts while plan omits three and analysis four: the bar showed a
  //    clean, personalised identity for a request Generate then refused.
  //
  //    Membership is asserted EXACTLY, not as a minimum. Adding a studio that
  //    takes no brand kit would give it a policy it must not have; dropping one
  //    silently returns that studio's label to the un-omitted, un-needed answer.
  // ───────────────────────────────────────────────────────────────────────────
  {
    check(
      'the policy names exactly the seven kit-capable studios',
      Object.keys(STUDIO_IDENTITY_POLICY).sort(),
      ['analysis', 'campaign', 'creator', 'edit', 'photoshoot', 'plan', 'storyboard'],
    );
    check('voiceover has no policy — it takes no brand kit', STUDIO_IDENTITY_POLICY.voiceover, undefined);
    check('prompt-builder has none either', STUDIO_IDENTITY_POLICY['prompt-builder'], undefined);

    // plan collects businessName, industry and targetMarket; analysis collects a
    // description too. Each list is the fields THAT form already asks for.
    check('plan omits the three its form collects', STUDIO_IDENTITY_POLICY.plan.omit, [
      'name', 'industry', 'targetAudience',
    ]);
    check('analysis omits four', STUDIO_IDENTITY_POLICY.analysis.omit, [
      'name', 'industry', 'targetAudience', 'description',
    ]);
    check('campaign needs all three extras', STUDIO_IDENTITY_POLICY.campaign.need, ['name', 'colors', 'voice']);
    check('storyboard needs only the name', STUDIO_IDENTITY_POLICY.storyboard.need, ['name']);
    check('photoshoot needs no extra', STUDIO_IDENTITY_POLICY.photoshoot.need, undefined);
  }

  // Applied through the table, the answers differ per studio — which is the whole
  // reason the label has to name its studio.
  {
    const { client } = fakeSupabase({
      brand_kits: { 'kit-1': kit({ description: null, city: null }) },
    });
    const asPlan = await resolveWorkingIdentity(client, USER, {
      brandKitId: 'kit-1',
      ...STUDIO_IDENTITY_POLICY.plan,
    });
    // industry and targetAudience survive on the row but are omitted for plan,
    // and description/city are null — so the block is empty and the customer
    // must be told the result will be generic.
    check('plan: a kit with only industry contributes NOTHING', asPlan.contributed, false);

    const { client: c2 } = fakeSupabase({
      brand_kits: { 'kit-1': kit({ description: null, city: null }) },
    });
    const asStoryboard = await resolveWorkingIdentity(c2, USER, {
      brandKitId: 'kit-1',
      ...STUDIO_IDENTITY_POLICY.storyboard,
    });
    check('storyboard: the same kit DOES contribute', asStoryboard.contributed, true);
    check('storyboard: and gets the name it asked for', asStoryboard.safeName, 'Shawarma Al Sham');
  }

  // The same rule for colours, which is where it also CLOSES a hole:
  // lib/ai/prompts/photoshoot.ts interpolated primary_color/secondary_color with
  // no filter and no cap — the only unfiltered brand-kit read in any builder.
  {
    const { client } = fakeSupabase({ brand_kits: { 'kit-1': kit() } });
    const off = await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1' });
    check('colours are not computed unless asked for', off.safeColors, null);
    check('...and neither is the composed line', off.safeColorLine, null);
    const on = await resolveWorkingIdentity(client, USER, { brandKitId: 'kit-1', need: ['colors'] });
    check('asked for, they arrive capped', on.safeColors?.primary, '#3B82F6');
    check('...and the line is composed', on.safeColorLine, 'Primary #3B82F6, Secondary #8B5CF6, Accent #F59E0B');
  }

}

void main()
  .then(() => {
    // A gate that ran no checks certifies nothing. Without this, a future edit
    // that returns early from main() — or a case block moved outside it — exits
    // 0 with a cheerful "0 checks passed", which is the silent-empty-scan
    // failure `mock-from-schema.test.ts:246` is the only other gate here to guard.
    if (checks === 0) {
      console.log('[working-identity] no checks ran — the suite proved nothing');
      process.exit(1);
    }
    if (failures > 0) {
      console.log(`\n[working-identity] ${failures} of ${checks} checks FAILED`);
      process.exit(1);
    }
    console.log(`[working-identity] ${checks} checks passed`);
  })
  .catch((error: unknown) => {
    // An unexpected throw inside main() would otherwise skip the summary
    // entirely and leave the process exiting 0 — a suite that crashed reporting
    // as a suite that passed.
    console.log('[working-identity] the suite threw before finishing:');
    console.log(error);
    process.exit(1);
  });
