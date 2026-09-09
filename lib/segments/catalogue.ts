import type { StudioSlug } from '@/lib/studios/catalogue';

/**
 * ONE PUBLIC PAGE PER CUSTOMER SEGMENT — the surface `docs/POSITIONING.md` exists
 * to make possible.
 *
 * The nine studio pages answer "what does this tool do?". Nobody walks into a
 * shawarma shop in Karama and asks that. They ask "who is this for, and does it
 * know my business?" — and until this catalogue existed, the only page that
 * answered was the landing page, which answers it for everyone and therefore for
 * no one.
 *
 * ── WHY A CATALOGUE AND NOT A PAGE ─────────────────────────────────────────
 * `lib/studios/catalogue.ts` is the pattern and the reason is recorded there: the
 * page, the index, the landing showcase and the sitemap all read the studios from
 * one place, so a tenth studio cannot appear on one surface and be missing from
 * another. Segments will grow the same way — Deira is already named in the plan's
 * week 3 — so the second one must cost a row, not a rebuild.
 *
 * ── WHY `journey` IS A LIST OF STUDIO SLUGS ────────────────────────────────
 * A segment page's body is a JOURNEY, not a feature list: photo -> nine posts ->
 * captions -> a price. Naming the studios by slug rather than restating what they
 * do means the credit figure comes from `lib/credits/costs.ts` through
 * `studioCostLabel()`, exactly as the studio pages do, and a segment page can
 * never quote a price the product does not charge.
 */
export interface SegmentEntry {
  /** URL segment under `/[locale]/for/`. */
  slug: string;
  /** i18n key base under `segments.<slug>`. */
  key: string;
  /**
   * The studios this segment's journey walks through, in order. Every entry must
   * be a shipped studio — `scripts/tests/segment-pages.test.ts` asserts it against
   * STUDIO_SLUGS, so a journey cannot name `video`.
   */
  journey: StudioSlug[];
  /**
   * The one studio the page sells as the front door. `docs/POSITIONING.md` §3:
   * "A landing page that offers nine things offers no thing."
   */
  frontDoor: StudioSlug;
  /** Manifest example ids shown as proof. Checked against the manifest by the gate. */
  examples: string[];
}

export const SEGMENTS: SegmentEntry[] = [
  {
    slug: 'dubai-restaurants',
    key: 'dubai-restaurants',
    // Deliberately three, and in the order a shop owner meets them: the campaign
    // is the door, the photoshoot is what they ask for next, the plan is what they
    // did not know they wanted. Adding a fourth is how this page becomes the
    // landing page again.
    journey: ['campaign', 'photoshoot', 'plan'],
    frontDoor: 'campaign',
    // Both are real product output from paid production runs, and the shawarma
    // frame carries Arabic text on the wrapper — the capability this segment
    // notices first and the one a generic tool cannot do.
    examples: ['creator-shawarma-square', 'photoshoot-luxury'],
  },
];

export const SEGMENT_SLUGS = SEGMENTS.map((s) => s.slug);

export function getSegment(slug: string): SegmentEntry | null {
  return SEGMENTS.find((s) => s.slug === slug) ?? null;
}
