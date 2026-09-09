/**
 * THE SEGMENT PAGES AGREE WITH THE PRODUCT.
 *
 * Same contract `studio-pages.test.ts` holds for the nine studios, and written
 * from its scars rather than from scratch:
 *
 *   - every membership assertion is EXACT, never a minimum
 *   - every scan FAILS when it matches nothing, so a walk that silently stopped
 *     recursing cannot certify an empty result
 *   - the credit detector proves itself on a corpus BEFORE it is trusted, because
 *     that file shipped one that could never fire on Arabic and reported clean
 *     for weeks
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEGMENTS, SEGMENT_SLUGS, getSegment } from '../../lib/segments/catalogue.js';
import { STUDIO_SLUGS } from '../../lib/studios/catalogue.js';
import { campaignCostBands } from '../../lib/credits/campaign-cost.js';
import { PLANS } from '../../lib/stripe/plans.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ar = JSON.parse(readFileSync(join(ROOT, 'messages/ar.json'), 'utf8')) as Record<string, any>;
const en = JSON.parse(readFileSync(join(ROOT, 'messages/en.json'), 'utf8')) as Record<string, any>;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`FAIL  ${name}${detail ? `  → ${detail}` : ''}`);
}

// ── 1. The catalogue names only things that exist ──────────────────────────
check('there is at least one segment', SEGMENTS.length > 0, `${SEGMENTS.length}`);
for (const s of SEGMENTS) {
  check(`${s.slug}: slug is url-safe`, /^[a-z][a-z0-9-]*$/.test(s.slug), s.slug);
  check(`${s.slug}: journey is not empty`, s.journey.length > 0);
  for (const slug of s.journey) {
    // A journey naming `video` would publish a step the product cannot perform —
    // the exact rule that keeps `video` off the /studios index.
    check(`${s.slug}: journey step "${slug}" is a SHIPPED studio`, (STUDIO_SLUGS as readonly string[]).includes(slug), slug);
  }
  check(`${s.slug}: frontDoor is one of its own journey steps`, s.journey.includes(s.frontDoor), s.frontDoor);
  check(`${s.slug}: getSegment round-trips`, getSegment(s.slug)?.slug === s.slug);
}

// ── 2. Every example id names a file that was actually built ───────────────
const manifestPath = join(ROOT, 'public/examples/studios/manifest.json');
check('the example manifest exists', existsSync(manifestPath));
const manifestRaw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
const manifest = (Array.isArray(manifestRaw) ? manifestRaw : Object.values(manifestRaw as object)) as { id: string; file: string; alt?: { ar?: string; en?: string } }[];
let exampleCount = 0;
for (const s of SEGMENTS) {
  check(`${s.slug}: shows at least one example`, s.examples.length > 0);
  for (const id of s.examples) {
    exampleCount++;
    const ex = manifest.find((m) => m.id === id);
    check(`${s.slug}: example "${id}" is in the manifest`, Boolean(ex));
    if (!ex) continue;
    check(`${s.slug}: example "${id}" exists on disk`, existsSync(join(ROOT, 'public', ex.file.replace(/^\//, ''))), ex.file);
    check(`${s.slug}: example "${id}" has alt text in both locales`, Boolean(ex.alt?.ar?.trim()) && Boolean(ex.alt?.en?.trim()));
  }
}
check('the example scan checked something', exampleCount > 0, `${exampleCount}`);

// ── 3. Both locales carry every key the page renders ───────────────────────
const REQUIRED = [
  'name', 'metaTitle', 'metaDescription', 'eyebrow', 'h1', 'definition', 'audience',
  'journeyTitle', 'journeySubtitle', 'step1', 'step2', 'step3',
  'proofTitle', 'priceTitle', 'faqTitle',
  'q1', 'a1', 'q2', 'a2', 'q3', 'a3', 'q4', 'a4',
] as const;
const SHARED = ['ctaPrimary', 'ctaSecondary', 'freeLine', 'proofNote', 'priceBody', 'contactLead', 'contactCta'] as const;

for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const segs = msgs.segments as Record<string, Record<string, string>> | undefined;
  check(`${locale}: a "segments" namespace exists`, Boolean(segs));
  if (!segs) continue;
  for (const k of SHARED) {
    check(`${locale}: segments.shared.${k} is a non-empty string`, typeof segs.shared?.[k] === 'string' && segs.shared[k].trim().length > 0);
  }
  // EXACT membership, not "at least": a namespace for a segment the catalogue
  // does not ship is copy nothing renders, and it is how a deleted page keeps
  // its strings alive for the next reader to trust.
  const nsKeys = Object.keys(segs).filter((k) => k !== 'shared').sort();
  check(`${locale}: the segments namespaces are exactly the catalogue's`, JSON.stringify(nsKeys) === JSON.stringify([...SEGMENT_SLUGS].sort()), `${nsKeys.join(',')} vs ${SEGMENT_SLUGS.join(',')}`);
  for (const s of SEGMENTS) {
    for (const k of REQUIRED) {
      const v = segs[s.key]?.[k];
      check(`${locale}: segments.${s.key}.${k} is a non-empty string`, typeof v === 'string' && v.trim().length > 0);
    }
    // ── THE BRAND SUFFIX IS THE LAYOUT'S JOB ─────────────────────────────
    // `app/[locale]/layout.tsx` sets `title.template = '%s | PyraSuite'`, so a
    // metaTitle that also carries the suffix ships DOUBLED. Measured on
    // production 2026-09-09, seen in a real browser tab and in the served bytes:
    //   <title>… بوستات أسبوع | PyraSuite | PyraSuite</title>
    // Every studio page is correct because none of them writes it. This is not a
    // typo class a human reliably catches — the string reads fine in the message
    // file, and the defect only exists once the template has been applied.
    check(
      `${locale}: segments.${s.key}.metaTitle does not repeat the brand suffix`,
      !/\|\s*PyraSuite\s*$/.test(segs[s.key]?.metaTitle ?? ''),
      segs[s.key]?.metaTitle,
    );
    // Same trap, other direction: the DESCRIPTION has no template, so it must
    // stand alone and must not be a truncated title.
    check(
      `${locale}: segments.${s.key}.metaDescription is a real description`,
      (segs[s.key]?.metaDescription ?? '').length >= 80,
      String(segs[s.key]?.metaDescription).slice(0, 40),
    );
    // The sentence an answer engine lifts. A tagline is not a definition.
    check(`${locale}: segments.${s.key}.definition is a real sentence`, (segs[s.key]?.definition ?? '').length >= 80, String(segs[s.key]?.definition).slice(0, 40));
  }
}

// ── 4. No credit figure is typed into segment copy ─────────────────────────
// Same rule and the same detector shape as studio-pages: unit-anchored rather
// than `\b`-anchored (JS `\b` is ASCII-only and dies after `ت`), and carrying
// Arabic-Indic digits. Proved on a corpus before it is trusted.
const CREDIT_NUMBER = /[\d٠-٩۰-۹]+\s*(?:الكريدت|كريديت|كريدت|credits?)(?![\p{L}\p{N}])/iu;
for (const s of ['حملة بـ12 كريدت', '3 كريدت', '٢٥ كريدت', '25 credits', '1 credit']) {
  check(`the credit detector CATCHES ${JSON.stringify(s)}`, CREDIT_NUMBER.test(s));
}
for (const s of ['رصيد الكريدت', 'بكريدت واحد', 'تسع بوستات جاهزة', 'nine posts ready']) {
  check(`the credit detector PASSES ${JSON.stringify(s)}`, !CREDIT_NUMBER.test(s));
}

let scanned = 0;
for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const walk = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      scanned++;
      check(`${locale}: ${path} states no credit number`, !CREDIT_NUMBER.test(node), (node.match(CREDIT_NUMBER) ?? [''])[0]);
      return;
    }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(msgs.segments, 'segments');
}
// A scan matching nothing certifies nothing.
check('the credit scan read the segment copy', scanned >= 40, `${scanned} strings`);

// ── 5. The free-tier arithmetic in the copy is the arithmetic in the code ──
// The page's strongest claim is "N free campaigns". Both halves come from code
// at render time, so this asserts the CLAIM IS WORTH MAKING — if a price change
// ever drops it below two, the sentence stops being a reason to sign up and the
// build says so instead of shipping a weak one.
const bands = campaignCostBands();
const freeCampaigns = Math.floor(PLANS.free.credits / bands.text);
check('a free account can run at least two full text campaigns', freeCampaigns >= 2, `${PLANS.free.credits} / ${bands.text} = ${freeCampaigns}`);
check('the text band is genuinely cheaper than the full band', bands.text < bands.full, `${bands.text} vs ${bands.full}`);

// ── 6. Every segment URL is in the sitemap ────────────────────────────────
const sitemapSrc = readFileSync(join(ROOT, 'app/sitemap.ts'), 'utf8');
check('the sitemap imports the segment catalogue', sitemapSrc.includes("from '@/lib/segments/catalogue'"), 'app/sitemap.ts');
check('the sitemap generates segment paths from the catalogue, not a literal list',
  /SEGMENT_SLUGS\.map/.test(sitemapSrc),
  'a hand-typed list is the second copy this catalogue exists to prevent');

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n[segment-pages] ${failures.length} of ${passed + failures.length} checks FAILED`);
  process.exit(1);
}
console.log(`[segment-pages] ${passed} checks passed (${SEGMENTS.length} segment, ${scanned} strings scanned)`);
