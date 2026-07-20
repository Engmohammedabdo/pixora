import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { OG_CONTENT } from '@/lib/seo/og-content';

// Force Node.js (not edge) — we read local font files from disk below.
export const runtime = 'nodejs';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// `alt` is a static export in the file-based convention (it cannot branch on
// `params` the way the default-exported image function can), so it stays a
// single, English, locale-agnostic string.
export const alt = 'PyraSuite — AI Marketing Platform';

const BRAND_GRADIENT = 'linear-gradient(135deg, #4F46E5 0%, #6366F1 55%, #06B6D4 100%)';
const FONT_DIR = join(process.cwd(), 'public', 'fonts', 'og');

interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
}

/**
 * Arabic glyphs are not covered by Satori's built-in default font, and Satori
 * does not inherit next/font — it needs raw font bytes passed via the
 * `fonts` option. Tajawal (already used site-wide for Arabic body text, see
 * app/[locale]/layout.tsx) is vendored locally as static TTFs under
 * public/fonts/og/ specifically so this has NO runtime network dependency.
 * Tajawal's Latin subset is complete, so it is used as the font for BOTH
 * locales — the English card never needs Satori's separate built-in default
 * font path.
 *
 * If this read ever fails, we fall back to the Latin-only English card
 * (with no explicit font, i.e. Satori's own default) rather than risk
 * rendering broken/tofu Arabic glyphs — see the isAr fallback below.
 */
async function loadFonts(): Promise<OgFont[] | null> {
  try {
    const [regular, bold] = await Promise.all([
      readFile(join(FONT_DIR, 'Tajawal-Regular.ttf')),
      readFile(join(FONT_DIR, 'Tajawal-Bold.ttf')),
    ]);
    return [
      { name: 'Tajawal', data: regular, weight: 400, style: 'normal' },
      { name: 'Tajawal', data: bold, weight: 700, style: 'normal' },
    ];
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ImageResponse> {
  const { locale } = await params;
  const fonts = await loadFonts();
  // Only render the Arabic card if we actually have Arabic glyphs to render
  // it with — otherwise fall back to the English/Latin card for BOTH
  // locales rather than show tofu boxes.
  const isAr = locale === 'ar' && fonts !== null;
  const content = isAr ? OG_CONTENT.ar : OG_CONTENT.en;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage: BRAND_GRADIENT,
          fontFamily: fonts ? 'Tajawal' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <div style={{ display: 'flex', fontSize: 118, lineHeight: 1 }}>🦊</div>
          <div
            style={{
              display: 'flex',
              fontSize: 96,
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: -2,
            }}
          >
            PyraSuite
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 38,
            fontWeight: isAr ? 700 : 500,
            color: 'rgba(255,255,255,0.94)',
            textAlign: 'center',
            maxWidth: 940,
            direction: isAr ? 'rtl' : 'ltr',
          }}
        >
          {content.description}
        </div>

        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 44,
            fontSize: 24,
            color: 'rgba(255,255,255,0.65)',
          }}
        >
          pyrasuite.pyramedia.cloud
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts ?? undefined,
    }
  );
}
