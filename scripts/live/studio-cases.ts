import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CREDIT_COSTS, getStudioCost } from '../../lib/credits/costs';
import { EXPECTED_POSTS, EXPECTED_SCENES } from '../../lib/ai/studio-output-schemas';
import { calculateVoiceoverCost, getVoiceoverConfig } from '../../lib/credits/voiceover-costs';
import { LOW_EFFECT_THRESHOLD, LOW_OVERALL_THRESHOLD, looksLikeNoOp } from '../../lib/image/edit-effect';
import type { CheckResult } from './checks';
import { cornerMarkPresent, editEffect, frameSize } from './checks';
import { measureAudio, SILENCE_RUN_SHARE } from './audio';
import {
  countCheck, declaredCostCheck, everyEntryHas, joinText, languageCheck,
  noMockMarker, realModelCheck, sectionCheck,
} from './studio-checks';

/**
 * The other seven studios, run for real and measured.
 *
 * ── WHY THIS IS OPT-IN AND GROUPED ─────────────────────────────────────────
 * A naive sweep of everything is already over budget: storyboard alone is 14
 * credits and campaign 12. So the groups below are opt-in per `--studios`, the
 * runner prints each group's price before it spends anything, and the default is
 * the cheap one. A verification tool that quietly bills the owner is its own
 * kind of defect — the same rule the edit sweep's `--yes` guard already states.
 *
 * ── WHY EVERY CASE DECLARES ITS COST, AND IS THEN CHECKED AGAINST IT ───────
 * `cost` is what the plan promises. `declaredCostCheck` then compares it against
 * the `creditsUsed` the route actually reports, so a price that drifts out of
 * `CREDIT_COSTS` fails the run instead of silently making the printed plan a
 * lie. Every figure below that CAN be imported from the product is imported;
 * the one that cannot (photoshoot's per-shot table is module-private to its
 * route, and a route file cannot export anything but its handlers) is restated
 * with that check as its backstop.
 *
 * ── WHY THE LANGUAGE OF EACH CASE IS A DELIBERATE CHOICE ───────────────────
 * Until 2026-08-24 every plan, analysis and storyboard was generated in Arabic
 * regardless of locale. An Arabic-locale case would have PASSED that whole
 * period, because ignoring the locale and honouring it produce the same output
 * when the locale is `ar`. So `plan` runs in English on purpose: it is the only
 * request whose result distinguishes the two. `analysis` and `storyboard` run in
 * Arabic, which is the default and the majority path, so both directions are
 * covered across the group rather than paid for twice in one studio.
 */

export type StudioGroup = 'text' | 'image' | 'audio';

/** What a case is handed at run time: the runner owns the network and the run
 *  directory, so a case never has to know where either lives. */
export interface CaseTools {
  /** The account's live plan, read from /api/credits/balance — never assumed.
   *  Decides watermark polarity, the voiceover price and cap, and the
   *  resolution promise. */
  plan: string;
  download(url: string): Promise<Buffer>;
  /** Bytes worth looking at afterwards. Goes into the run directory and onto the
   *  contact sheet, because the numbers below cannot see an invented object. */
  keepImage(file: string, bytes: Buffer, label: string): void;
  /** A product photograph this run generated with `creator`, for the cases that
   *  need one. Null when the case declared no fixture. */
  fixture: { url: string; bytes: Buffer } | null;
}

export interface StudioCase {
  /** Stable id, usable with `--only`. */
  id: string;
  /** Must name a directory under app/api/studios — `uncoveredStudios()` reads
   *  that directory, so a studio added later cannot ship unrun. */
  studio: string;
  group: StudioGroup;
  path: string;
  /** Credits this case will spend, printed BEFORE anything is billed. */
  cost: number;
  /** A creator fixture this case needs, named from cases.ts FIXTURES. Its own
   *  credit is added to the plan separately, and shared when two cases name the
   *  same fixture. */
  fixture?: string;
  /** One line saying what this case is actually asking the product to prove. */
  intent: string;
  body: (tools: CaseTools) => Record<string, unknown>;
  /** The deliverable inside `data`, so the report does not need to know each
   *  route's field name. */
  deliverable: (data: Record<string, unknown>) => unknown;
  verify: (data: Record<string, unknown>, tools: CaseTools) => Promise<CheckResult[]>;
}

// ---------------------------------------------------------------------------
// helpers shared by the case definitions
// ---------------------------------------------------------------------------

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0;
}

// ---------------------------------------------------------------------------
// the cases
// ---------------------------------------------------------------------------

/** 30 days is what `plan` turns into `Math.max(1, Math.round(30 / 7))` weeks —
 *  the exact count lib/ai/prompts/plan.ts demands of the calendar, restated here
 *  from the same arithmetic rather than hardcoded as 4. */
const PLAN_DAYS = 30;
const PLAN_WEEKS = Math.max(1, Math.round(PLAN_DAYS / 7));

/** photoshoot's SHOT_COSTS lives inside its route and cannot be exported (the
 *  generated route validator constrains a route module's non-handler exports to
 *  `never`). One shot is 2 credits there; `declaredCostCheck` fails the case if
 *  that ever stops being true, which is the only defence a restated number can
 *  have. */
const PHOTOSHOOT_ONE_SHOT_COST = 2;

/** Short enough to price at one credit and to fit the free plan's 30-second cap:
 *  calculateVoiceoverCost is ceil(ceil(len / 5) / 15) on this tier. */
const VOICEOVER_SCRIPT = 'شاورما الشام، ألذ شاورما في دبي. اطلب الآن ووصلك خلال ثلاثين دقيقة.';

/**
 * Built per-plan rather than exported as a constant, because 2026-08-28's Pro
 * sweep made three figures plan-dependent: the voiceover price and cap, the
 * watermark's POLARITY (free must carry it, paid must not), and the resolution
 * a paid photoshoot promises. A static list priced for 'free' would print an
 * honest-looking plan and then fail every paid case on arithmetic.
 */
/**
 * The one subject all four creator cases request, so the only thing that varies
 * between them is the thing each is testing.
 *
 * `AR_RAW` is written the way a shawarma shop owner actually types: colloquial,
 * vague about everything a photographer would need, and with the business goal
 * ("makes you hungry") stated instead of the picture. That is the input the
 * product receives today and sends to the image model verbatim.
 *
 * `EN_BRIEF` asks for the SAME PICTURE with the specificity
 * lib/ai/prompts/prompt-builder.ts already tells the model to produce — subject,
 * lens, lighting, composition, palette. It is the control, and it is
 * deliberately written by hand rather than generated, so this run measures the
 * CEILING the expansion layer would be aiming at rather than one sample of it.
 */
const CREATOR_AR_RAW = 'عايز صورة لساندوتش شاورما تجيب جوع لمطعمي في دبي';
const CREATOR_EN_BRIEF =
  'Appetising close-up of a Levantine chicken shawarma wrap on a warm wooden board, ' +
  'shot on a 50mm at f/2.0, three-quarter angle, shallow depth of field. Golden side light ' +
  'raking across the bread to show its char and texture, garlic sauce glistening at the open ' +
  'end, shredded parsley and pickles visible in the filling. Warm amber and cream palette, ' +
  'blurred Dubai restaurant interior behind. Sharp, commercial food photography.';

/**
 * creator is priced by RESOLUTION, not by studio: there is no
 * `CREDIT_COSTS.creator`, and `getStudioCost('creator', res)` reads
 * `CREDIT_COSTS.image[res]` (costs.ts:17-20). At 2K that is 2 credits, not 1.
 *
 * 2K rather than the cheaper 1080p because this run exists to show what a
 * PAYING customer receives, and 2K is what the Pro plan sells. Reading the
 * figure from the product rather than restating it is also what keeps the
 * printed plan honest if the table ever moves.
 */
const CREATOR_RESOLUTION = '2K';
const CREATOR_COST = getStudioCost('creator', CREATOR_RESOLUTION);

/** The four cases, sharing one verify() because they differ in their INPUT, not
 *  in what makes them correct. */
function creatorCases(): StudioCase[] {
  const verify = async (data: Record<string, unknown>, tools: CaseTools): Promise<CheckResult[]> => {
    const urls = Array.isArray(data.imageUrls) ? (data.imageUrls as unknown[]) : [];
    const checks: CheckResult[] = [
      realModelCheck(data.mock),
      countCheck('the requested image was delivered', urls.length, 1),
      declaredCostCheck(CREATOR_COST, data.creditsUsed),
    ];
    for (const [i, url] of urls.entries()) {
      if (typeof url !== 'string' || !url) continue;
      const bytes = await tools.download(url);
      tools.keepImage(`creator-${String(data.__caseId ?? i)}.png`, bytes, String(data.__caseLabel ?? 'creator'));
      const size = await frameSize(bytes);
      // Recorded, never asserted. The resolution a plan SELLS is checked by the
      // plan-promise case; here the figure is context for the eye pass, and an
      // assertion invented for it is how a healthy run gets failed.
      checks.push({
        name: 'frame size',
        ok: true,
        detail: size ? `${size.width}x${size.height} — INFORMATIONAL` : 'could not measure',
      });
      // Same polarity rule, and same honesty about it, as photoshoot above: a
      // paid plan sells the mark's ABSENCE, and absence cannot be asserted with
      // cornerMarkPresent on a textured photograph without manufacturing
      // failures. Free must carry it, and that IS assertable.
      if (tools.plan === 'free') {
        checks.push({
          name: 'carries the free-plan corner mark',
          ok: await cornerMarkPresent(bytes),
          detail: 'bottom-right corner carries a non-uniform mark',
        });
      } else {
        checks.push({
          name: 'watermark absence',
          ok: true,
          detail: 'paid plan — judged on the contact sheet, not measurable on a textured corner. INFORMATIONAL.',
        });
      }
    }
    return checks;
  };

  // Every field below is copied from creator's own InputSchema
  // (app/api/studios/creator/route.ts:23-37). Recalling a route's fields from
  // memory instead of copying them is a mistake this harness has already made
  // once, and it fails the run rather than the product.
  const base = { model: 'gemini', resolution: CREATOR_RESOLUTION, variations: 1 } as const;

  const defs: ReadonlyArray<{ id: string; intent: string; prompt: string; style: string }> = [
    {
      id: 'creator_ar_raw',
      intent: 'THE EXPERIMENT: what a customer actually types in Arabic, sent to the model exactly as the product sends it today',
      prompt: CREATOR_AR_RAW,
      style: 'photographic',
    },
    {
      id: 'creator_en_brief',
      intent: 'THE CONTROL: the same picture asked for as a proper English brief — the ceiling the expansion layer would aim at',
      prompt: CREATOR_EN_BRIEF,
      style: 'photographic',
    },
    {
      id: 'creator_ar_bold',
      intent: 'whether `style` does anything at all: the raw Arabic again, with the one word that is supposed to change the look',
      prompt: CREATOR_AR_RAW,
      style: 'bold',
    },
    {
      id: 'creator_ar_signage',
      // creator's whole text rule today is one line: "NO extra text, logos, or
      // watermarks unless specified" (creator.ts:95). edit.ts earned a real
      // containment rule over three production runs on exactly this failure.
      intent: 'text containment: a request that invites in-image Arabic, against creator ONE line of defence',
      prompt: 'صورة لواجهة مطعم شاورما في دبي، عليها لافتة مضيئة مكتوب عليها شاورما الشام',
      style: 'photographic',
    },
  ];

  return defs.map((d) => ({
    id: d.id,
    studio: 'creator',
    group: 'image' as const,
    path: '/api/studios/creator',
    cost: CREATOR_COST,
    intent: d.intent,
    body: () => ({ ...base, prompt: d.prompt, style: d.style }),
    deliverable: (data: Record<string, unknown>) => data.imageUrls,
    // The id travels with the data so the kept file and its contact-sheet label
    // name the case rather than an index — four creator frames on one sheet are
    // unreadable otherwise, and reading them is the entire point of this group.
    verify: (data: Record<string, unknown>, tools: CaseTools) =>
      verify({ ...data, __caseId: d.id, __caseLabel: `${d.id} · ${d.style}` }, tools),
  }));
}

export function buildStudioCases(plan: string): StudioCase[] {
  const paid = plan !== 'free';
  return [
  // ── text ────────────────────────────────────────────────────────────────
  {
    id: 'plan_en',
    studio: 'plan',
    group: 'text',
    path: '/api/studios/plan',
    cost: getStudioCost('plan'),
    intent: 'a 30-day plan in ENGLISH, with all four tabs the page renders filled',
    body: () => ({
      locale: 'en',
      businessName: 'Shawarma Al Sham',
      industry: 'restaurant',
      goals: ['Grow delivery orders by 30 percent', 'Build an Instagram following in Dubai'],
      targetMarket: 'Families and young professionals in Dubai who order dinner delivery',
      budget: 'AED 8,000 per month',
      duration: String(PLAN_DAYS),
    }),
    deliverable: (data) => data.plan,
    verify: async (data) => {
      const plan = (data.plan ?? {}) as Record<string, unknown>;
      const objectives = rows(plan.objectives);
      const channels = rows(plan.channels);
      const calendar = rows(plan.calendar);
      const budget = (plan.budget ?? {}) as Record<string, unknown>;
      const breakdown = rows(budget.breakdown);

      return [
        realModelCheck(data.mock),
        noMockMarker('no [mock] leaf reached a 5-credit plan', plan),
        declaredCostCheck(getStudioCost('plan'), data.creditsUsed),

        // The page renders exactly four tabs (plan/page.tsx:280-283) and the
        // route's own gate passes when ANY ONE of them carries text — so a plan
        // with three empty tabs is `completed`, charged, and three blank panels
        // on screen. All four are what 5 credits buys.
        sectionCheck('objectives tab is filled', objectives, (o) => [o.goal, o.kpi, o.target]),
        sectionCheck('channels tab is filled', channels, (c) => [c.name, c.strategy]),
        sectionCheck('calendar tab is filled', calendar, (w) => [w.content, w.channel]),
        sectionCheck('budget tab is filled', breakdown, (b) => [b.item, b.amount]),

        // "The calendar must have exactly N entries, one per week, numbered
        // 1..N" (lib/ai/prompts/plan.ts). The customer picks 30/60/90 and this
        // is the only place that choice becomes something countable.
        {
          name: 'calendar covers the requested period',
          ok: calendar.length === PLAN_WEEKS,
          detail: `${calendar.length} weekly entries for ${PLAN_DAYS} days (prompt asks for exactly ${PLAN_WEEKS})`,
        },

        // Prose fields only. `channels[].name` is deliberately excluded: an
        // English plan and an Arabic one both name "Instagram" and "TikTok", so
        // reading it would measure the platform list rather than the language.
        languageCheck(
          'the plan is in the requested language (English)',
          joinText([objectives.map((o) => o.goal), channels.map((c) => c.strategy), calendar.map((w) => w.content)]),
          'en',
        ),
      ];
    },
  },
  {
    id: 'analysis_ar',
    studio: 'analysis',
    group: 'text',
    path: '/api/studios/analysis',
    cost: getStudioCost('analysis'),
    intent: 'a competitor analysis in ARABIC, with all five tabs filled and every KPI carrying its headline number',
    body: () => ({
      locale: 'ar',
      businessName: 'شاورما الشام',
      industry: 'restaurant',
      description: 'مطعم شاورما ومشاوي في دبي يقدم التوصيل السريع ووجبات عائلية بأسعار متوسطة.',
      competitors: ['شاورماتي', 'مطعم الريف'],
      targetMarket: 'العائلات والموظفون الشباب في دبي الذين يطلبون العشاء توصيلاً',
      painPoints: 'المنافسة السعرية وارتفاع عمولات تطبيقات التوصيل',
    }),
    deliverable: (data) => data.analysis,
    verify: async (data) => {
      const analysis = (data.analysis ?? {}) as Record<string, unknown>;
      const swot = (analysis.swot ?? {}) as Record<string, unknown>;
      const roadmap = (analysis.roadmap ?? {}) as Record<string, unknown>;
      const personas = rows(analysis.personas);
      const competitors = rows(analysis.competitors);
      const kpis = rows(analysis.kpis);
      const quadrant = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
      const q = {
        strengths: quadrant(swot.strengths), weaknesses: quadrant(swot.weaknesses),
        opportunities: quadrant(swot.opportunities), threats: quadrant(swot.threats),
      };
      const emptyQuadrants = Object.entries(q).filter(([, v]) => v.length === 0).map(([k]) => k);
      const roadmapBuckets = {
        day_30: quadrant(roadmap.day_30), day_60: quadrant(roadmap.day_60), day_90: quadrant(roadmap.day_90),
      };
      const emptyBuckets = Object.entries(roadmapBuckets).filter(([, v]) => v.length === 0).map(([k]) => k);

      return [
        realModelCheck(data.mock),
        noMockMarker('no [mock] leaf reached a 3-credit analysis', analysis),
        declaredCostCheck(getStudioCost('analysis'), data.creditsUsed),

        // Five tabs (analysis/page.tsx:214-218). SWOT is the DEFAULT tab, so an
        // empty quadrant is the first thing the customer sees. The item counts
        // are reported rather than asserted: the prompt asks for "4-5 items",
        // which is a request, not the quantity the 3 credits are sold as.
        {
          name: 'all four SWOT quadrants are filled',
          ok: emptyQuadrants.length === 0,
          detail: `strengths ${q.strengths.length}, weaknesses ${q.weaknesses.length}, opportunities ${q.opportunities.length}, threats ${q.threats.length}` +
            (emptyQuadrants.length ? ` — empty: ${emptyQuadrants.join(', ')}` : ''),
        },
        {
          name: 'all three roadmap buckets are filled',
          ok: emptyBuckets.length === 0,
          detail: `30d ${roadmapBuckets.day_30.length}, 60d ${roadmapBuckets.day_60.length}, 90d ${roadmapBuckets.day_90.length}` +
            (emptyBuckets.length ? ` — empty: ${emptyBuckets.join(', ')}` : ''),
        },
        sectionCheck('personas tab is filled', personas, (p) => [p.name, p.role, p.goals, p.pain_points, p.channels]),
        sectionCheck('competitors tab is filled', competitors, (c) => [c.name, c.strengths, c.weaknesses]),
        sectionCheck('kpis tab is filled', kpis, (k) => [k.metric, k.target, k.timeframe]),

        // The prompt asked for target_30d/target_90d while the schema, the page
        // and the PDF all read `target` — so every KPI card rendered a blank
        // headline number until 2026-08-24. This is the live proof that the
        // three still agree, and it is the check that would notice first if the
        // model drifted back.
        everyEntryHas('every KPI carries its headline number', kpis, 'target'),

        languageCheck(
          'the analysis is in the requested language (Arabic)',
          joinText([q.strengths, q.opportunities, roadmapBuckets.day_30, personas.map((p) => p.goals), competitors.map((c) => c.strengths)]),
          'ar',
        ),
      ];
    },
  },
  {
    id: 'storyboard_ar',
    studio: 'storyboard',
    group: 'text',
    path: '/api/studios/storyboard',
    cost: getStudioCost('storyboard'),
    intent: 'the nine scenes a 14-credit storyboard is sold as, summing to the requested runtime',
    body: () => ({
      locale: 'ar',
      concept: 'إعلان قصير لمطعم شاورما في دبي يبرز سرعة التوصيل وطعم الشاورما الطازجة',
      duration: '30',
      style: 'cinematic',
      platform: 'instagram_reel',
    }),
    deliverable: (data) => data.scenes,
    verify: async (data) => {
      const scenes = rows(data.scenes);
      const totalSeconds = scenes.reduce((sum, s) => sum + num(s.duration_seconds), 0);
      const numbered = scenes.every((s, i) => num(s.scene_number) === i + 1);

      return [
        realModelCheck(data.mock),
        noMockMarker('no [mock] leaf reached a 14-credit storyboard', scenes),
        declaredCostCheck(getStudioCost('storyboard'), data.creditsUsed),

        countCheck('nine scenes were delivered', scenes.length, EXPECTED_SCENES),

        // `visual_description` is the only field the parser requires; every
        // other one catch-defaults to '', so a scene with no dialogue and no
        // camera direction parses, is finalized `completed`, and keeps all 14
        // credits while showing the customer an empty card.
        everyEntryHas('every scene has a visual description', scenes, 'visual_description'),
        everyEntryHas('every scene has dialogue', scenes, 'dialogue'),
        everyEntryHas('every scene names a camera angle', scenes, 'camera_angle'),

        // "The total duration of all scenes must equal exactly N seconds"
        // (lib/ai/prompts/storyboard.ts). A storyboard is not a bag of
        // independent items — its durations ARE the video, so this is the one
        // number that decides whether the deliverable is usable.
        {
          name: 'the scene durations sum to the requested runtime',
          ok: totalSeconds === 30,
          detail: `${totalSeconds}s across ${scenes.length} scenes (asked for exactly 30s)`,
        },
        { name: 'scenes are numbered 1..n in order', ok: numbered, detail: scenes.map((s) => num(s.scene_number)).join(',') },

        // Two opposite expectations on ONE deliverable, and getting them the
        // wrong way round would fail every correct storyboard: the prompt asks
        // for `dialogue` in the customer's language and `visual_description`
        // "in English for image generation" (storyboard.ts:68).
        languageCheck('scene dialogue is in the requested language (Arabic)', joinText([scenes.map((s) => s.dialogue)]), 'ar'),
        languageCheck('visual descriptions stay in English, as the image model needs', joinText([scenes.map((s) => s.visual_description)]), 'en'),
      ];
    },
  },
  {
    id: 'campaign_text',
    studio: 'campaign',
    group: 'text',
    path: '/api/studios/campaign',
    cost: Math.max(1, CREDIT_COSTS.campaign - EXPECTED_POSTS * CREDIT_COSTS.image['1080p']),
    intent: 'the nine captions a text-only campaign is sold as, at the decomposed 3-credit price',
    body: () => ({
      productDescription: 'شاورما دجاج ولحم طازجة مع صوص الثوم، توصيل سريع في دبي',
      targetAudience: 'الشباب والعائلات في دبي من 20 إلى 45 سنة',
      dialect: 'emirati',
      platform: 'instagram',
      generateImages: false,
    }),
    deliverable: (data) => data.posts,
    verify: async (data) => {
      const posts = rows(data.posts);
      const textCost = Math.max(1, CREDIT_COSTS.campaign - EXPECTED_POSTS * CREDIT_COSTS.image['1080p']);
      const hashCounts = posts.map((p) => (str(p.hashtags).match(/#/g) ?? []).length);

      return [
        realModelCheck(data.mock),
        noMockMarker('no [mock] leaf reached a paid campaign', posts),
        declaredCostCheck(textCost, data.creditsUsed),

        countCheck('nine posts were delivered', posts.length, EXPECTED_POSTS),

        // With images unchecked, ZERO asset rows are written — these captions
        // live only in generations.output, so a blank one is unrecoverable work
        // the customer paid for.
        everyEntryHas('every post has a caption', posts, 'caption'),
        everyEntryHas('every post has a hook', posts, 'tov'),
        everyEntryHas('every post has hashtags', posts, 'hashtags'),
        everyEntryHas('every post has a schedule', posts, 'schedule'),
        everyEntryHas('every post has an image scenario', posts, 'scenario'),

        // The customer's balance view of the count check above: a short campaign
        // is refunded per missing post, so a non-zero figure here means they did
        // not receive the nine they asked for even if the count check squeaked
        // through.
        {
          name: 'nothing was refunded — the campaign was delivered whole',
          ok: data.refunded === 0,
          detail: `refunded ${String(data.refunded)}, failedImageCount ${String(data.failedImageCount)}, imagesRequested ${String(data.imagesRequested)}`,
        },

        // Same opposite-expectations shape as storyboard: `caption` is in the
        // dialect the customer bought, `scenario` is an English image prompt
        // (campaign.ts:67-68). Reading the caption as English would fail every
        // correct Arabic campaign.
        languageCheck('captions are in the Arabic dialect that was bought', joinText([posts.map((p) => p.caption), posts.map((p) => p.tov)]), 'ar'),
        languageCheck('image scenarios stay in English, as the image model needs', joinText([posts.map((p) => p.scenario)]), 'en'),

        // Reported, not asserted: "10 hashtags total" is a prompt request, not
        // the quantity 3 credits are sold as, and failing on it would be the
        // sweep judging by its own standard.
        { name: 'hashtag counts recorded', ok: true, detail: `per post: ${hashCounts.join(', ')} (prompt asks for 10)` },
      ];
    },
  },
  {
    id: 'prompt_builder',
    studio: 'prompt-builder',
    group: 'text',
    path: '/api/studios/prompt-builder',
    cost: CREDIT_COSTS.prompt,
    intent: 'three genuinely different English prompts with Arabic tips, for zero credits',
    body: () => ({
      description: 'صور احترافية لعبوة عسل زجاجية لمتجر إلكتروني',
      outputType: 'image',
      style: 'minimal studio',
    }),
    deliverable: (data) => data.prompts,
    verify: async (data) => {
      const prompts = rows(data.prompts);
      const texts = prompts.map((p) => str(p.prompt).trim()).filter(Boolean);
      const distinct = new Set(texts).size;

      return [
        realModelCheck(data.mock),
        noMockMarker('no [mock] leaf reached the prompt builder', prompts),
        declaredCostCheck(CREDIT_COSTS.prompt, data.creditsUsed),

        countCheck('three prompts were delivered', prompts.length, 3),
        everyEntryHas('every result has a prompt', prompts, 'prompt'),
        everyEntryHas('every result has a style label', prompts, 'style'),
        everyEntryHas('every result has an Arabic tip', prompts, 'tip'),

        // "They must differ in approach, not merely in wording — three
        // rephrasings of the same idea give the customer one option, not three"
        // (lib/ai/prompts/prompt-builder.ts). Distinctness is the measurable
        // floor of that; whether they differ in APPROACH needs a reader, and the
        // report says so.
        { name: 'the three prompts are not duplicates', ok: distinct === texts.length && texts.length > 0, detail: `${distinct} distinct of ${texts.length}` },

        // The one studio where both languages are asked for in the same object.
        languageCheck('the prompts themselves are English', joinText([prompts.map((p) => p.prompt)]), 'en'),
        languageCheck('the tips are Arabic', joinText([prompts.map((p) => p.tip)]), 'ar'),
      ];
    },
  },

  // ── image ───────────────────────────────────────────────────────────────
  //
  // creator, measured as a SUBJECT rather than used as a tool.
  //
  // It ran on every sweep before this — as the fixture generator — and
  // COVERED_ELSEWHERE said so, which is true and was the problem: "it executes"
  // was accepted as "it is verified". Nothing had ever looked at what it
  // returns, in the studio that is first in the product and where every
  // customer starts. That exemption is now narrowed to the fixture role it
  // actually describes.
  //
  // The four cases below are a DIAGNOSTIC SET, not a regression suite. They are
  // arranged as one experiment with one control, because the prompt redesign
  // they exist to inform rests on a claim nobody in this repo has ever tested:
  // that a colloquial Arabic sentence is a weaker instruction to an image model
  // than the English photographic brief the FREE prompt-builder studio already
  // knows how to write. `creator_ar_raw` and `creator_en_brief` request the
  // SAME PICTURE two ways and differ in nothing else. If they come back
  // equivalent, the expansion layer is not worth building and this run said so
  // for 2 credits.
  //
  // What these checks CANNOT do is say whether an image is any good. That needs
  // eyes, the sweep says so about itself, and the contact sheet is written for
  // exactly that pass.
  ...creatorCases(),
  {
    id: 'photoshoot_luxury',
    studio: 'photoshoot',
    group: 'image',
    path: '/api/studios/photoshoot',
    cost: PHOTOSHOOT_ONE_SHOT_COST,
    fixture: 'clean_white',
    intent: 'the customer product moved into a luxury set — and NOT handed back unchanged',
    body: (tools) => ({
      productImageUrl: tools.fixture?.url,
      environment: 'luxury',
      shots: 1,
      notes: 'Keep the jar and its label exactly as they are',
    }),
    deliverable: (data) => data.shots,
    verify: async (data, tools) => {
      const shots = rows(data.shots);
      const withUrl = shots.filter((s) => typeof s.url === 'string' && s.url);
      const checks: CheckResult[] = [
        noMockMarker('no [mock] leaf reached a paid photoshoot', shots),
        declaredCostCheck(PHOTOSHOOT_ONE_SHOT_COST, data.creditsUsed),
        {
          name: 'a real model served every shot',
          ok: shots.length > 0 && shots.every((s) => s.mock !== true),
          detail: `mock flags: ${shots.map((s) => String(s.mock)).join(', ') || 'none'}`,
        },
        countCheck('the requested shots were delivered', withUrl.length, 1),
      ];

      // The check this whole harness exists for, applied to the other studio that
      // takes the customer's own photograph as input. On 2026-08-27 three paid
      // generations returned that photograph unchanged at HTTP 200 with a credit
      // charged; the same failure here is indistinguishable from success without
      // measuring it.
      const before = tools.fixture?.bytes;
      for (const [i, shot] of withUrl.entries()) {
        const bytes = await tools.download(str(shot.url));
        tools.keepImage(`photoshoot-shot-${i}.png`, bytes, `photoshoot luxury #${i}`);
        const m = before ? await editEffect(before, bytes) : { maxLocal: null, overall: null };
        checks.push({
          name: `shot ${i} is not the source photograph handed back`,
          ok: !looksLikeNoOp(m.maxLocal, m.overall),
          detail: m.maxLocal === null
            ? 'could not measure — UNMEASURED, not a verdict'
            : `local ${m.maxLocal.toFixed(1)} (flag <${LOW_EFFECT_THRESHOLD}) · overall ${m.overall?.toFixed(2)} (flag <${LOW_OVERALL_THRESHOLD})`,
        });
        // Watermark POLARITY follows the plan. Free must carry the mark
        // (fail-closed, and it once shipped as empty boxes for a week). Paid
        // plans SELL its absence — but absence cannot be asserted with
        // cornerMarkPresent on an arbitrary photograph, whose own texture in
        // that corner reads as "a mark". So on paid the mark check is stated
        // UNMEASURED here and the contact sheet is the verdict; asserting
        // absence would manufacture false failures on every textured scene.
        if (tools.plan === 'free') {
          checks.push({
            name: `shot ${i} carries the free-plan corner mark`,
            ok: await cornerMarkPresent(bytes),
            detail: 'bottom-right corner carries a non-uniform mark',
          });
        } else {
          checks.push({
            name: `shot ${i} watermark absence`,
            ok: true,
            detail: 'paid plan — absence is judged on the contact sheet, not measurable on a textured corner. INFORMATIONAL.',
          });
        }
        // The resolution the plan sells (lib/stripe/plans.ts): pro 2K, business
        // and agency 4K. Until 2026-08-24 photoshoot hardcoded '1080p' and every
        // paid plan received a 1K image — this is that defect's regression
        // check, finally measurable now that the sweep can run as a paid
        // account.
        const size = await frameSize(bytes);
        if (tools.plan === 'free' || tools.plan === 'starter') {
          checks.push({
            name: `shot ${i} resolution`,
            ok: true,
            detail: size ? `${size.width}x${size.height} on the ${tools.plan} plan (1080p tier). INFORMATIONAL.` : 'unreadable',
          });
        } else {
          const minSide = tools.plan === 'pro' ? 1500 : 3000;
          checks.push({
            name: `shot ${i} is the resolution the ${tools.plan} plan sells`,
            ok: size !== null && Math.max(size.width, size.height) >= minSide,
            detail: size
              ? `${size.width}x${size.height}; the plan sells ${tools.plan === 'pro' ? '2K' : '4K'} (longest side >= ${minSide})`
              : 'could not read dimensions',
          });
        }
      }
      return checks;
    },
  },

  {
    id: 'photoshoot_multi',
    studio: 'photoshoot',
    group: 'image',
    path: '/api/studios/photoshoot',
    // SHOT_COSTS in the route: {1: 2, 3: 4, 6: 8}. Restated for the same reason
    // as PHOTOSHOOT_ONE_SHOT_COST, with declaredCostCheck as the backstop.
    cost: 4,
    fixture: 'clean_white',
    intent: 'three shots for one price: all delivered, all distinct, and a partial failure refunds its own share',
    body: (tools) => ({
      productImageUrl: tools.fixture?.url,
      environment: 'luxury',
      shots: 3,
    }),
    deliverable: (data) => data.shots,
    verify: async (data, tools) => {
      const shots = rows(data.shots);
      const withUrl = shots.filter((sh) => typeof sh.url === 'string' && sh.url);
      const checks: CheckResult[] = [
        noMockMarker('no [mock] leaf reached a paid photoshoot', shots),
        // NOT realModelCheck(boolean): that helper takes the MOCK FLAG, and
        // handing it "all shots are real === true" reads as mock=true — the
        // inverted check failed a healthy run on 2026-08-28. Same shape as the
        // single-shot case, stated directly.
        {
          name: 'a real model served every shot',
          ok: shots.length > 0 && shots.every((sh) => sh.mock !== true),
          detail: `mock flags: ${shots.map((sh) => String(sh.mock)).join(', ') || 'none'}`,
        },
        countCheck('the requested shots were delivered', withUrl.length, 3),
        // The money identity: a missing shot must be refunded, not absorbed.
        // With all three delivered, creditsUsed must equal the price; short
        // delivery must charge less. Either way the two must agree.
        {
          name: 'the charge matches the delivery',
          ok: num(data.creditsUsed) <= 4 && (withUrl.length === 3 ? num(data.creditsUsed) === 4 : num(data.creditsUsed) < 4),
          detail: `${withUrl.length}/3 shots delivered, ${num(data.creditsUsed)} of 4 credits charged`,
        },
      ];
      const kept: Buffer[] = [];
      for (const [i, shot] of withUrl.entries()) {
        const bytes = await tools.download(str(shot.url));
        tools.keepImage(`photoshoot-multi-${i}.png`, bytes, `photoshoot multi #${i}`);
        const before = tools.fixture?.bytes;
        const m = before ? await editEffect(before, bytes) : { maxLocal: null, overall: null };
        checks.push({
          name: `shot ${i} is not the source photograph handed back`,
          ok: !looksLikeNoOp(m.maxLocal, m.overall),
          detail: m.maxLocal === null ? 'could not measure' : `local ${m.maxLocal.toFixed(1)} · overall ${m.overall?.toFixed(2)}`,
        });
        kept.push(bytes);
      }
      // "One coherent set" must not mean one image three times: the route seeds
      // per-run variety, and identical shots would be three charges for one
      // deliverable. Pairwise distance, measured with the same metric as
      // everything else in this sweep.
      for (let i = 0; i < kept.length; i++) {
        for (let j = i + 1; j < kept.length; j++) {
          const d = await editEffect(kept[i], kept[j]);
          checks.push({
            name: `shots ${i} and ${j} are distinct frames`,
            ok: !looksLikeNoOp(d.maxLocal, d.overall),
            detail: d.maxLocal === null ? 'could not measure' : `local ${d.maxLocal.toFixed(1)} · overall ${d.overall?.toFixed(2)} — near zero means the same image was sold twice`,
          });
        }
      }
      return checks;
    },
  },
  {
    id: 'campaign_full',
    studio: 'campaign',
    group: 'image',
    path: '/api/studios/campaign',
    cost: CREDIT_COSTS.campaign,
    intent: 'the full 12-credit campaign: nine captions AND nine images, any failed image refunded and disclosed',
    body: () => ({
      productDescription: 'مطعم شاورما الشام في الكرامة بدبي — وصفات شامية أصيلة وتوصيل سريع',
      targetAudience: 'سكان دبي المهتمون بالمأكولات الشامية، من 20 إلى 45 سنة',
      dialect: 'emirati',
      platform: 'instagram',
      generateImages: true,
    }),
    deliverable: (data) => data.posts,
    verify: async (data, tools) => {
      const posts = rows(data.posts);
      const withImage = posts.filter((po) => typeof po.imageUrl === 'string' && po.imageUrl);
      const failed = num(data.failedImageCount);
      const refunded = num(data.refunded);
      const checks: CheckResult[] = [
        realModelCheck(data.mock),
        noMockMarker('no [mock] leaf reached a paid campaign', posts),
        countCheck('nine posts were delivered', posts.length, EXPECTED_POSTS),
        // The money identity this case exists for: every image NOT delivered is
        // refunded at the image price, and the figures the response discloses
        // must agree with each other and with the delivery.
        {
          name: 'failed images and refund agree with the delivery',
          ok: withImage.length + failed === EXPECTED_POSTS && refunded === failed * CREDIT_COSTS.image['1080p'],
          detail: `${withImage.length} images delivered + ${failed} failed = ${withImage.length + failed}/${EXPECTED_POSTS}; refunded ${refunded} (expected ${failed} x ${CREDIT_COSTS.image['1080p']})`,
        },
        {
          name: 'the charge is the price minus the refund',
          ok: num(data.creditsUsed) === CREDIT_COSTS.campaign - refunded,
          detail: `charged ${num(data.creditsUsed)}, price ${CREDIT_COSTS.campaign}, refunded ${refunded}`,
        },
        languageCheck('the captions are in Arabic', joinText([posts.map((po) => po.caption)]), 'ar'),
      ];
      // Look at a sample of the paid images — the numbers cannot see an
      // invented object, wrong product, or missing brand. Two is enough for
      // the sheet without doubling the run's download time.
      for (const [i, post] of withImage.slice(0, 2).entries()) {
        const bytes = await tools.download(str(post.imageUrl));
        tools.keepImage(`campaign-image-${i}.png`, bytes, `campaign post image #${i}`);
      }
      return checks;
    },
  },

  // ── audio ───────────────────────────────────────────────────────────────
  {
    id: 'voiceover_ar',
    studio: 'voiceover',
    group: 'audio',
    path: '/api/studios/voiceover',
    cost: calculateVoiceoverCost(VOICEOVER_SCRIPT.length, 1, plan),
    intent: 'audio that exists, plays for a plausible time, and is not silence',
    body: () => ({
      script: VOICEOVER_SCRIPT,
      voice: 'male_pro',
      dialect: 'formal',
      speed: '1',
      tone: 'professional',
    }),
    deliverable: (data) => ({ audioUrl: data.audioUrl, duration: data.duration, provider: data.provider }),
    verify: async (data, tools) => {
      const declared = calculateVoiceoverCost(VOICEOVER_SCRIPT.length, 1, tools.plan);
      const planConfig = getVoiceoverConfig(tools.plan);
      const url = str(data.audioUrl);
      const checks: CheckResult[] = [
        realModelCheck(data.mock),
        declaredCostCheck(declared, data.creditsUsed),
        { name: 'an audio file was returned', ok: url.length > 0, detail: url ? url.slice(0, 80) : 'audioUrl empty' },
      ];
      if (!url) return checks;

      const bytes = await tools.download(url);
      const a = measureAudio(bytes);
      checks.push({
        name: 'the bytes decode as an audio stream',
        ok: a.frames > 0,
        detail: `${a.frames} MPEG frames, ${a.bytes} bytes, ${a.sampleRate ?? '?'} Hz`,
      });
      if (a.seconds === null) {
        checks.push({ name: 'playable length', ok: true, detail: 'no decodable frames — UNMEASURED, not a verdict' });
        return checks;
      }
      checks.push({
        name: 'it plays for a non-trivial time',
        ok: a.seconds >= 1,
        detail: `${a.seconds.toFixed(2)}s measured from the frame headers; the route reported ${String(data.duration)}s`,
      });
      // WHAT THIS CHECK FOUND, AND WHAT IT COST TO FIND.
      //
      // It failed on production when it was written: one 67-character Arabic
      // script, billed and displayed as 13s, delivered 6.96s of audio. Three
      // scripts were then measured (33 / 67 / 130 chars), each MP3 parsed frame
      // by frame and cross-checked against file size over bitrate:
      //
      //     33ch -> 4.01s (8.2/sec)   67ch -> 6.96s (9.6)   130ch -> 14.35s (9.1)
      //
      // The constant behind the price, the plan's duration cap and this badge
      // assumed 5 chars/sec. It is now 8 — the SLOWEST rate observed, not the
      // mean, because the number is bounded on both sides and the remaining
      // error should sit in the customer's favour.
      //
      // No gate could have caught it. test:voiceover-budget's 500+ checks prove
      // the char budget is the exact inverse of the price, which stays true
      // whatever the constant is, because both sides read the same constant.
      // Only comparing the constant against real audio can.
      //
      // Do NOT widen this tolerance to make a run green. Either the constant
      // moves in lib/credits/voiceover-costs.ts, or this comment records the
      // decision not to move it and says why.
      const reported = typeof data.duration === 'number' ? data.duration : null;
      if (reported !== null && reported > 0) {
        const ratio = reported / a.seconds;
        checks.push({
          name: 'the billed duration matches the audio that was delivered',
          ok: ratio <= 1.35 && ratio >= 1 / 1.35,
          detail: `billed and displayed ${reported}s, the file plays ${a.seconds.toFixed(2)}s — ratio ${ratio.toFixed(2)} (tolerance 0.74-1.35). ` +
            'Over 1 means the customer is charged for, and capped at, more audio than they receive.',
        });
      }
      // The plan's own cap (lib/credits/voiceover-costs.ts). Exceeding it
      // means the LLM rewrite outgrew the budget the customer was priced on —
      // the exact failure `maxCharsForBudget` was written to prevent, seen from
      // the delivered side rather than the computed one.
      checks.push({
        name: 'it stays inside the plan duration cap',
        ok: a.seconds <= planConfig.maxDurationSeconds,
        detail: `${a.seconds.toFixed(2)}s against the ${tools.plan} plan's ${planConfig.maxDurationSeconds}s cap`,
      });
      // On paid plans the studio must serve the provider the plan sells — Pro+
      // is priced at 3 credits per 20s BECAUSE it is ElevenLabs. OpenAI audio
      // billed at the ElevenLabs rate is the premium-rate substitution the
      // 2026-08-23 round fixed; measured here from the response's own field.
      checks.push({
        name: 'the provider is the one the plan sells',
        ok: str(data.provider) === planConfig.provider,
        detail: `served by ${str(data.provider) || '(none reported)'}, the ${tools.plan} plan sells ${planConfig.provider}`,
      });
      // Informational, never a verdict: the measured read rate against the
      // constant. CHARS_PER_SECOND=8 was measured on OpenAI TTS ONLY, and its
      // own comment says ElevenLabs may differ — this line is where that
      // difference will first show up.
      // synthesizedChars is what was actually read aloud. On rewriting plans
      // (pro+, toneEnabled) the original script length is the WRONG numerator —
      // the first paid run printed 7.6 chars/sec from the original 67 chars
      // while the billed estimate implied ~10.9 on the ~96-char rewrite.
      const spoken = typeof data.synthesizedChars === 'number' ? data.synthesizedChars : null;
      checks.push({
        name: `measured read rate (${planConfig.provider})`,
        ok: true,
        detail: spoken === null
          ? `route did not report synthesizedChars — rate UNMEASURABLE on a rewriting plan (original ${VOICEOVER_SCRIPT.length} chars / ${a.seconds.toFixed(2)}s = ${(VOICEOVER_SCRIPT.length / a.seconds).toFixed(1)}, a floor only). INFORMATIONAL.`
          : `${(spoken / a.seconds).toFixed(1)} chars/sec over the ${spoken} chars actually spoken; the pricing constant assumes 8 (measured on openai). INFORMATIONAL.`,
      });
      checks.push({
        name: 'it is not digital silence',
        ok: a.longRunShare < SILENCE_RUN_SHARE,
        detail: `${(a.longRunShare * 100).toFixed(2)}% of the stream sits in runs of >=16 identical bytes (flag >=${SILENCE_RUN_SHARE * 100}%)`,
      });
      return checks;
    },
  },
  ];
}

/** What each group costs before fixtures, so `--studios` can be chosen with the
 *  price in view rather than discovered afterwards. */
export function groupCost(group: StudioGroup, cases: StudioCase[]): number {
  return cases.filter((c) => c.group === group).reduce((sum, c) => sum + c.cost, 0);
}

/**
 * Coverage, asserted rather than assumed — the studio counterpart of
 * `uncoveredPresets()`.
 *
 * The routed list is READ FROM DISK, not restated: every studio ships a
 * directory under app/api/studios, so a tenth studio added later appears here
 * the moment it exists and the runner refuses to start until it has a case. A
 * hardcoded list of names would be exactly the "list of filenames pretending to
 * be a rule" this repo has already been burned by once (see CLAUDE.md on
 * app/layout.tsx).
 */
const STUDIO_ROUTE_DIR = join(__dirname, '..', '..', 'app', 'api', 'studios');

/** Studios this sweep covers somewhere other than STUDIO_CASES. Named, with the
 *  reason, so "covered" can be checked rather than believed. */
const COVERED_ELSEWHERE: Record<string, string> = {
  // `creator` was listed here until 2026-08-31, with the reason "runs on every
  // sweep as the fixture generator". That was TRUE and it was the defect: it
  // recorded that creator EXECUTES, and was read as meaning creator is
  // VERIFIED. Nothing had ever looked at what it returns — in the studio that
  // is first in the product, that every customer starts in, and whose prompt is
  // the shortest of the four image builders. An exemption that names a reason
  // which does not actually certify coverage is worse than no exemption, since
  // it satisfies the check that exists to find the gap.
  //
  // It now has cases of its own (creatorCases, above) and needs no entry.
  edit: 'covered preset-by-preset by EDIT_CASES, whose own coverage uncoveredPresets() asserts',
};

export function uncoveredStudios(cases: StudioCase[]): string[] {
  const routed = readdirSync(STUDIO_ROUTE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const covered = new Set([...cases.map((c) => c.studio), ...Object.keys(COVERED_ELSEWHERE)]);
  return routed.filter((s) => !covered.has(s));
}
