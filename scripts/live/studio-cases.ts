import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CREDIT_COSTS, getStudioCost } from '../../lib/credits/costs';
import { EXPECTED_POSTS, EXPECTED_SCENES } from '../../lib/ai/studio-output-schemas';
import { calculateVoiceoverCost } from '../../lib/credits/voiceover-costs';
import { LOW_EFFECT_THRESHOLD, LOW_OVERALL_THRESHOLD, looksLikeNoOp } from '../../lib/image/edit-effect';
import type { CheckResult } from './checks';
import { cornerMarkPresent, editEffect } from './checks';
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

export const STUDIO_CASES: StudioCase[] = [
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
        checks.push({
          name: `shot ${i} carries the free-plan corner mark`,
          ok: await cornerMarkPresent(bytes),
          detail: 'bottom-right corner carries a non-uniform mark',
        });
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
    cost: calculateVoiceoverCost(VOICEOVER_SCRIPT.length, 1, 'free'),
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
      const declared = calculateVoiceoverCost(VOICEOVER_SCRIPT.length, 1, 'free');
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
      // The free plan's own cap (lib/credits/voiceover-costs.ts). Exceeding it
      // means the LLM rewrite outgrew the budget the customer was priced on —
      // the exact failure `maxCharsForBudget` was written to prevent, seen from
      // the delivered side rather than the computed one.
      checks.push({
        name: 'it stays inside the plan duration cap',
        ok: a.seconds <= 30,
        detail: `${a.seconds.toFixed(2)}s against the free plan's 30s cap`,
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

/** What each group costs before fixtures, so `--studios` can be chosen with the
 *  price in view rather than discovered afterwards. */
export function groupCost(group: StudioGroup, cases: StudioCase[] = STUDIO_CASES): number {
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
  creator: 'runs on every sweep as the fixture generator (FIXTURES in cases.ts)',
  edit: 'covered preset-by-preset by EDIT_CASES, whose own coverage uncoveredPresets() asserts',
};

export function uncoveredStudios(): string[] {
  const routed = readdirSync(STUDIO_ROUTE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const covered = new Set([...STUDIO_CASES.map((c) => c.studio), ...Object.keys(COVERED_ELSEWHERE)]);
  return routed.filter((s) => !covered.has(s));
}
