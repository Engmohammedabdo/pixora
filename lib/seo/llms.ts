import { STUDIO_SLUGS, type StudioSlug } from '@/lib/studios/catalogue';
import arMessages from '@/messages/ar.json';
import enMessages from '@/messages/en.json';

/**
 * The body of /llms.txt — the one file this site publishes for answer engines.
 *
 * ── WHY THIS IS CODE AND NOT A STATIC FILE ─────────────────────────────────
 * It used to be `public/llms.txt`, hand-typed. The 2026-09-03 live audit
 * measured what that cost: the `## Links` block listed seven URLs — /ar, /en,
 * /ar/pricing, /ar/signup, /ar/contact, /ar/privacy, /ar/terms — and not one
 * studio page, while `sitemap.xml` carried twenty. The file described "the nine
 * studios" in prose and gave a URL for none of them. Twenty pages built for
 * answer engines were invisible to the single file that exists to point answer
 * engines at content, because the file and the routes had no connection.
 *
 * They have one now: the studio block is GENERATED from `STUDIO_SLUGS`, the
 * same import `app/sitemap.ts:2` reads, and each studio's name, tagline and
 * definition are the very strings its page publishes (`messages/{ar,en}.json`).
 * A tenth studio added to the catalogue reaches this file by existing; a studio
 * that is not in the catalogue — `video`, which does not ship — cannot reach it
 * at all. There is no second copy of the list to go stale.
 *
 * ── WHY public/llms.txt HAD TO BE DELETED IN THE SAME COMMIT ───────────────
 * Next serves a `public/` file over a route of the same name. Leaving the
 * static file in place beside `app/llms.txt/route.ts` would ship a dead
 * generator — byte-for-byte the `public/robots.txt` shadowing defect the SEO
 * round of 2026-09-02 found in production, where 19 disallow rules had never
 * once been served. `scripts/tests/robots.test.ts` now asserts the absence of
 * `public/llms.txt` exactly the way it already asserts the absence of
 * `public/robots.txt`.
 *
 * The Arabic and English summary paragraphs, the pricing block, the links and
 * the facts are unchanged from the file this replaces.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

interface StudioCopy {
  name: string;
  tagline: string;
  definition: string;
}

// One cast at the boundary rather than nine. `scripts/tests/studio-pages.test.ts`
// already asserts that every slug carries a non-empty `name`, `tagline` and
// `definition` in BOTH locales, so this shape is gate-enforced, not assumed.
const AR = arMessages.studios as unknown as Record<string, StudioCopy>;
const EN = enMessages.studios as unknown as Record<string, StudioCopy>;

/** The two public URLs a studio has. Never hand-typed — see the header. */
export function studioUrls(slug: StudioSlug): { ar: string; en: string } {
  return { ar: `${APP_URL}/ar/studios/${slug}`, en: `${APP_URL}/en/studios/${slug}` };
}

function studioBlock(slug: StudioSlug): string {
  const en = EN[slug];
  const ar = AR[slug];
  const urls = studioUrls(slug);
  return [
    `### ${en.name} — ${ar.name}`,
    '',
    `${en.tagline}.`,
    '',
    en.definition,
    '',
    `- English: ${urls.en}`,
    `- Arabic: ${urls.ar}`,
  ].join('\n');
}

export function buildLlmsTxt(): string {
  return `# PyraSuite

> PyraSuite (بايرا سويت) is an AI marketing studio for restaurants, shops and clinics in the UAE and the Gulf. Type your idea in Arabic; Pyra — the platform's engine — turns it into product photos, posts with captions, a marketing plan, a competitor analysis and a voiceover in your dialect. Nine studios, one subscription, a transparent credit system.

> PyraSuite (بايرا سويت) منصة تسويق بالذكاء الاصطناعي للمطاعم والمتاجر والعيادات في الإمارات والخليج. تكتب فكرتك بالعربي، وبايرا — محرك المنصة — تطلّعها صور منتجات، وبوستات بكابشناتها، وخطة تسويق، وتحليل منافسين، وتعليق صوتي بلهجتك. 9 استوديوهات باشتراك واحد ونظام كريدت شفاف.

## The nine studios — each has its own page, in both languages

All nine, English: ${APP_URL}/en/studios
All nine, Arabic: ${APP_URL}/ar/studios

${STUDIO_SLUGS.map(studioBlock).join('\n\n')}

## Pricing

- Free: 25 credits, no credit card. Starter $12/mo. Pro $29/mo. Business $59/mo. Agency $149/mo.
- Every action has a published credit cost: ${APP_URL}/ar/pricing

## Links

- Home (Arabic): ${APP_URL}/ar
- Home (English): ${APP_URL}/en
- All nine studios: ${APP_URL}/ar/studios
- Pricing: ${APP_URL}/ar/pricing
- Sign up: ${APP_URL}/ar/signup
- Contact: ${APP_URL}/ar/contact
- Privacy: ${APP_URL}/ar/privacy
- Terms: ${APP_URL}/ar/terms

## Facts

- Arabic-first: the interface, the output and the dialects are Arabic; English is fully supported.
- Market: United Arab Emirates, Saudi Arabia, Kuwait, Qatar, Bahrain, Oman.
- Built by Pyramedia, Dubai.
`;
}
