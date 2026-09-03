import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getStudio, type StudioSlug } from '@/lib/studios/catalogue';

/**
 * The credit figure a public page shows, built from lib/credits/costs.ts and
 * never from a translation. A price in a string is how the published number and
 * the charge drift apart — the reason the admin per-studio price knob was
 * deleted.
 *
 * It lives here, and not in the page that first needed it, because two surfaces
 * now publish it: /studios/[slug] and the /studios index. A second copy of this
 * switch is exactly the drift the catalogue exists to prevent — nine cards
 * quoting one number and nine pages quoting another, with nothing failing.
 *
 * The one literal is the photoshoot floor. `SHOT_COSTS` lives inside the route
 * (`app/api/studios/photoshoot/route.ts:29` — `{1:2, 3:4, 6:8}`) and is not
 * exported, so the floor cannot be imported; the ceiling is
 * `CREDIT_COSTS.photoshoot` and is. `landing.studios.s2Credits` already
 * publishes the same "2-8" range, so this agrees with what the product says
 * today rather than inventing a second figure.
 *
 * ── WHY `perDuration` CARRIES NO NUMBER OF ITS OWN ─────────────────────────
 * Voiceover is the one studio whose UNIT is not universal. It shipped as
 * `${CREDIT_COSTS.voiceover}+ credits · per 15 seconds`, with the 15 typed into
 * a translation, and that is wrong for three of the five plans:
 * lib/credits/voiceover-costs.ts bills free and starter at 1 credit per 15s and
 * pro, business and agency at 3 per 20s. A 60-second Pro voiceover costs
 * ceil(60/20)*3 = 9 credits, which the "1+ · per 15 seconds" badge reads as
 * roughly 4. The product already publishes the correct split on the pricing
 * page (`pricing.voiceoverNote`), so the page contradicted the page it links to.
 *
 * Both bands now come from `getVoiceoverConfig()` and arrive as ICU values, so
 * the string states neither the unit nor the price and cannot drift from the
 * table that charges. The credit detector in scripts/tests/studio-pages.test.ts
 * could never have caught the old one: 15 is a SECONDS figure, not a credit
 * figure, so the gate that guards prices did not apply. It does now.
 */
export interface StudioCostLabels {
  /** `studios.shared.creditUnit` — the word, never the number. */
  unit: string;
  free: string;
  perImage: string;
  perShoot: string;
  /** `studios.shared.perDuration`, already composed by the caller from
   *  getVoiceoverConfig(): the WHOLE line, both bands. */
  perDuration: string;
}

export function studioCostLabel(slug: StudioSlug, labels: StudioCostLabels): string {
  const entry = getStudio(slug);
  if (!entry) return '';
  switch (entry.costShape) {
    case 'free':
      return labels.free;
    case 'imageRange':
      return `${CREDIT_COSTS.image['1080p']}–${CREDIT_COSTS.image['4K']} ${labels.unit} · ${labels.perImage}`;
    case 'shotRange':
      return `2–${CREDIT_COSTS.photoshoot} ${labels.unit} · ${labels.perShoot}`;
    case 'perDuration':
      // No `unit` and no leading figure: a single number in front of a two-band
      // price is what made the old badge read as one universal rate.
      return labels.perDuration;
    case 'flat':
    default:
      return `${CREDIT_COSTS[entry.costKey] as number} ${labels.unit}`;
  }
}
