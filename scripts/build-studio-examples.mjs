/**
 * Copies the REAL, paid-plan, unwatermarked live-run outputs into
 * public/examples/studios/ as web-optimised webp.
 *
 *   node scripts/build-studio-examples.mjs
 *
 * ── WHY THESE FILES AND NOT GENERATED ONES ─────────────────────────────────
 * Every image here is output this product actually produced, on a paid account,
 * against production, in a run whose report is committed under
 * .superpowers/live-runs/. A studio page's whole argument is "this is what you
 * get"; an image from any other generator would make that sentence false, and
 * this repo's rule is that a claim must be able to name its evidence.
 *
 * ── WHY THE SOURCE RUN IS NAMED PER FILE ───────────────────────────────────
 * `sourceRun` is the run directory the bytes came from. Two things depend on
 * it: the watermark (free-plan runs burn a corner mark in, so ONLY runs whose
 * report.md asserts "watermark absence — paid plan" may be used) and the claim
 * on the page itself. Do not add an entry without checking its run.
 *
 * Note on `cornerMarkPresent` (scripts/live/checks.ts): it measures CONTRAST in
 * the bottom-right corner and reports a mark on any photographic image with a
 * busy corner. It is right for the white-background marketplace checks it was
 * written for and useless as a general watermark detector — do not use it to
 * vet these. The run's plan is the signal.
 */
import sharp from 'sharp';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUNS = '.superpowers/live-runs';
const OUT = 'public/examples/studios';

/** Long-edge cap. Next/Image resamples down from here; nothing on a studio page
 *  is displayed above ~1400 CSS px, and 1600 leaves room for a 2x crop. */
const MAX_EDGE = 1600;
const QUALITY = 82;

const ASSETS = [
  // ── creator ──────────────────────────────────────────────────────────────
  { out: 'creator-shawarma-square', sourceRun: '2026-09-01T03-43-10-125Z', file: 'creator-creator_ar_raw.png',
    alt: { ar: 'ساندويتش شاورما على طاولة خشب داخل مطعم، واسم المطعم بالعربي مطبوع على الغلاف',
           en: 'A shawarma wrap on a wooden table inside a restaurant, the shop name printed in Arabic on the wrapper' } },
  // The 4:5 Instagram canvas, not a crop of a square: proof that the frame is
  // chosen by the platform the customer picked (lib/ai/prompts/platform-framing.ts).
  { out: 'creator-instagram-portrait', sourceRun: '2026-08-31T15-21-03-866Z', file: 'creator-creator_ig_portrait.png',
    alt: { ar: 'نفس الطلب بقماش إنستجرام الطولي 4:5، مؤطّر للمنصة مش مقصوص',
           en: 'The same request on Instagram’s 4:5 portrait canvas — framed for the platform, not cropped to it' } },
  // The SAME request as the run that produced the containment defect, re-run
  // AFTER the fix. 2026-08-31T09-35-51-970Z is the BASELINE artifact set: its
  // `creator-creator_ar_signage.png` renders شاورما الشام perfectly on the sign
  // and then invents legible garbage on the menu board and on an entire street
  // of background shopfronts (`BAWJIN`, `SHAAM`, fake phone numbers) — that run
  // is the EVIDENCE OF THE DEFECT, quoted as such at
  // lib/ai/prompts/image-text-rule.ts:26. The creator page's own FAQ answer
  // states that a rule stops Pyra inventing text elsewhere in the frame, so
  // shipping the baseline frame under it disproved the page in pixels.
  // 15-21-03-866Z is the post-fix run of the same prompt (report.md:49 —
  // passed 5/5, paid plan): the sign is still perfect and the flanking
  // shopfronts are blurred with no legible invented text. It is 2048x2048, so
  // the id no longer says "wide".
  { out: 'creator-signage-square', sourceRun: '2026-08-31T15-21-03-866Z', file: 'creator-creator_ar_signage.png',
    alt: { ar: 'واجهة محل بلافتة مضيئة مكتوب عليها اسم المطعم بالعربي',
           en: 'A shopfront with a lit sign carrying the restaurant name in Arabic' } },
  { out: 'creator-skyline-wide', sourceRun: '2026-08-31T15-24-43-567Z', file: 'creator-creator_ar_wide.png',
    alt: { ar: 'مشهد عريض بخلفية أفق دبي',
           en: 'A wide frame against the Dubai skyline' } },

  // ── photoshoot: three shots of ONE product, which is the product's claim ──
  { out: 'photoshoot-shot-1', sourceRun: '2026-08-27T21-28-51-817Z', file: 'photoshoot-multi-0.png',
    alt: { ar: 'اللقطة الأولى من جلسة تصوير منتج واحد', en: 'The first frame of a single-product shoot' } },
  { out: 'photoshoot-shot-2', sourceRun: '2026-08-27T21-28-51-817Z', file: 'photoshoot-multi-1.png',
    alt: { ar: 'اللقطة الثانية من نفس الجلسة، بزاوية مختلفة', en: 'The second frame of the same shoot, a different angle' } },
  { out: 'photoshoot-shot-3', sourceRun: '2026-08-27T21-28-51-817Z', file: 'photoshoot-multi-2.png',
    alt: { ar: 'اللقطة الثالثة من نفس الجلسة', en: 'The third frame of the same shoot' } },
  { out: 'photoshoot-luxury', sourceRun: '2026-09-01T03-43-10-125Z', file: 'photoshoot-shot-0.png',
    alt: { ar: 'منتج العميل داخل طقم تصوير فخم على سطح رخام', en: "The customer's product in a luxury set on marble" } },

  // ── edit: the before/after pair, SAME product, same run ──────────────────
  //
  // The 'before' frame is `fixture-retail_scene.png`, and a fixture is
  // GENERATED, not photographed: scripts/live/cases.ts defines `retail_scene`
  // as a prompt string and scripts/live/run.ts posts it to
  // /api/studios/creator, so the harness has an input to run the edit against.
  // Its alt sentence said the jar was "photographed inside a café" and the page
  // label said "the photo you have"; both were false statements about a
  // text-to-image output, on the one page whose central claim is what survives
  // an edit of a photo the customer already owns.
  //
  // The alt now DESCRIBES the frame and `studios.shared.pairProvenance` states
  // on the page that both frames are product output from one run. Do not put
  // "مصوّر"/"photographed" back, and do not describe any fixture-sourced frame
  // as a customer's own upload. The pair a real phone photo would give is
  // better evidence and is still unshot.
  { out: 'edit-before-cafe', sourceRun: '2026-08-27T21-07-40-884Z', file: 'fixture-retail_scene.png',
    alt: { ar: 'قبل: برطمان دبس تمر على ترابيزة كافيه، بخلفية مزحومة',
           en: 'Before: a date-syrup jar on a café table, against a busy background' } },
  { out: 'edit-after-marketplace', sourceRun: '2026-08-27T21-07-40-884Z', file: 'edit-marketplace_white.png',
    alt: { ar: 'بعد: نفس البرطمان على خلفية بيضا نقية جاهزة للماركت بليس، والملصق كما هو',
           en: 'After: the same jar on a pure white marketplace-ready background, its label untouched' } },

  // ── campaign ─────────────────────────────────────────────────────────────
  { out: 'campaign-post-1', sourceRun: '2026-08-31T09-35-51-970Z', file: 'campaign-image-0.png',
    alt: { ar: 'صورة من حملة كاملة مولّدة بتسع منشورات', en: 'One image from a generated nine-post campaign' } },
  { out: 'campaign-post-2', sourceRun: '2026-08-31T09-35-51-970Z', file: 'campaign-image-1.png',
    alt: { ar: 'صورة أخرى من نفس الحملة', en: 'Another image from the same campaign' } },
];

/**
 * ── THE FOUR TEXT DELIVERABLES ─────────────────────────────────────────────
 * plan, analysis, storyboard and prompt-builder produce TEXT, so their public
 * pages render the actual deliverable as HTML rather than a screenshot of one:
 * it is indexable, and it is literally what the customer receives.
 *
 * Same evidence rule as the images above — every one of these is the JSON a
 * real run got back from the live product, and each source run's report.md
 * records `mock=false` and a passing verdict for that case:
 *   2026-09-01T03-43-10-125Z  plan_en 9/9, analysis_ar 10/10
 *   2026-08-27T13-07-38-852Z  storyboard_ar 11/11, prompt_builder 10/10
 *
 * `lang` is the language the run ASKED for, and it exists because there is no
 * Arabic plan artifact in any run — every `plan_*.json` on disk is `plan_en`.
 * The page compares it against the locale being read and says so rather than
 * letting an Arabic-first product appear to answer in English. `mixed` is
 * prompt-builder, whose deliverable is bilingual BY DESIGN: English prompts
 * with Arabic tips (lib/ai/prompts/prompt-builder.ts:44).
 *
 * `input` is the customer's rough sentence — the whole argument of the
 * prompt-builder page is the distance between it and what came back, and it is
 * NOT in the response JSON. It is the request body of that case, and its source
 * of truth is scripts/live/studio-cases.ts:573. Only prompt-builder needs it:
 * the other three take a form, not a sentence.
 */
const DELIVERABLES = [
  { out: 'plan', sourceRun: '2026-09-01T03-43-10-125Z', file: 'plan_en.json', lang: 'en' },
  { out: 'analysis', sourceRun: '2026-09-01T03-43-10-125Z', file: 'analysis_ar.json', lang: 'ar' },
  { out: 'storyboard', sourceRun: '2026-08-27T13-07-38-852Z', file: 'storyboard_ar.json', lang: 'ar' },
  {
    out: 'prompt-builder',
    sourceRun: '2026-08-27T13-07-38-852Z',
    file: 'prompt_builder.json',
    lang: 'mixed',
    input: 'صور احترافية لعبوة عسل زجاجية لمتجر إلكتروني',
  },
];

/**
 * Writes public/examples/studios/deliverable-<out>.json and returns how many
 * sources were missing. `generatedOn` is READ from the run's own report.json
 * rather than typed here — the target a run was pointed at is a fact of that
 * run, and a second copy of it is a second thing to keep true.
 */
function buildDeliverables() {
  let missing = 0;
  for (const d of DELIVERABLES) {
    const src = join(RUNS, d.sourceRun, d.file);
    const reportPath = join(RUNS, d.sourceRun, 'report.json');
    if (!existsSync(src) || !existsSync(reportPath)) {
      console.log(`MISSING  deliverable-${d.out}  <- ${existsSync(src) ? reportPath : src}`);
      missing++;
      continue;
    }
    const data = JSON.parse(readFileSync(src, 'utf8'));
    const generatedOn = JSON.parse(readFileSync(reportPath, 'utf8')).base;
    if (!generatedOn) {
      console.log(`MISSING  deliverable-${d.out}  <- report.json has no "base"`);
      missing++;
      continue;
    }
    const out = { sourceRun: d.sourceRun, generatedOn, lang: d.lang, ...(d.input ? { input: d.input } : {}), data };
    const dest = join(OUT, `deliverable-${d.out}.json`);
    writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    const n = Array.isArray(data) ? data.length : Object.keys(data).length;
    console.log(`${String(n).padStart(4)} keys  ${String(Math.round(JSON.stringify(out).length / 1024)).padStart(4)} KB  deliverable-${d.out}  <- ${d.sourceRun}/${d.file}`);
  }
  return missing;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = [];
  let missing = 0;

  for (const a of ASSETS) {
    const src = join(RUNS, a.sourceRun, a.file);
    if (!existsSync(src)) {
      console.log(`MISSING  ${a.out}  <- ${src}`);
      missing++;
      continue;
    }
    const meta = await sharp(src).metadata();
    const long = Math.max(meta.width ?? 0, meta.height ?? 0);
    const pipeline = sharp(src).rotate();
    if (long > MAX_EDGE) {
      pipeline.resize({
        width: (meta.width ?? 0) >= (meta.height ?? 0) ? MAX_EDGE : undefined,
        height: (meta.height ?? 0) > (meta.width ?? 0) ? MAX_EDGE : undefined,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    const dest = join(OUT, `${a.out}.webp`);
    const info = await pipeline.webp({ quality: QUALITY }).toFile(dest);
    manifest.push({
      id: a.out,
      file: `/examples/studios/${a.out}.webp`,
      width: info.width,
      height: info.height,
      bytes: info.size,
      sourceRun: a.sourceRun,
      sourceFile: a.file,
      alt: a.alt,
    });
    console.log(
      `${String(info.width).padStart(4)}x${String(info.height).padEnd(4)} ` +
      `${String(Math.round(info.size / 1024)).padStart(4)} KB  ${a.out}  <- ${a.sourceRun}`,
    );
  }

  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const total = manifest.reduce((s, m) => s + m.bytes, 0);
  console.log(`\n${manifest.length} assets, ${(total / 1024 / 1024).toFixed(2)} MB total, manifest written`);

  console.log('');
  missing += buildDeliverables();

  if (missing) {
    console.log(`${missing} source file(s) missing — fix the paths above before relying on this`);
    process.exit(1);
  }
}

main();
