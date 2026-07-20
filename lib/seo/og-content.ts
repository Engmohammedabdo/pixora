/**
 * Single source of truth for the Open Graph title/description copy so the
 * <meta property="og:*"> tags (app/[locale]/layout.tsx) and the generated
 * og:image (app/[locale]/opengraph-image.tsx) never drift apart.
 *
 * These strings intentionally mirror the `openGraph.title` /
 * `openGraph.description` values used in generateMetadata — not the
 * (slightly different, more keyword-dense) top-level `description` used for
 * <meta name="description">.
 */

export type OgLocale = 'ar' | 'en';

interface OgContent {
  title: string;
  description: string;
}

export const OG_CONTENT: Record<OgLocale, OgContent> = {
  ar: {
    title: 'PyraSuite — منصة التسويق بالذكاء الاصطناعي',
    description:
      'حوّل أي فكرة لحملة تسويقية احترافية في دقائق — 9 استوديوهات AI، واجهة عربية، نظام كريدت شفاف.',
  },
  en: {
    title: 'PyraSuite — AI Marketing Platform',
    description:
      'Turn any idea into a professional marketing campaign in minutes — 9 AI studios and a transparent credit system.',
  },
};
