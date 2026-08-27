'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EditPresetId } from '@/lib/ai/prompts/edit';

/**
 * What a customer does with a finished image, named.
 *
 * ── WHY THIS REPLACED AN ICON ──────────────────────────────────────────────
 * `CreatorPreview` linked to `/edit?src=…` as a bare pencil with no visible
 * label, and `PhotoshootPreview` — the PRODUCT-PHOTOGRAPHY studio, the one this
 * customer actually points at their own goods — had no edit link at all. So the
 * finished shot was a dead end: the next step existed, cost one credit, and was
 * reachable only by knowing it was there and then typing a prompt to describe
 * it.
 *
 * Each action carries a `preset`, so the click lands on the edit studio with
 * both the image AND the recipe already chosen — one click from a photograph to
 * a marketplace-ready white background, with nothing typed. The edit page reads
 * `?preset=` and derives the edit type from the preset table, so this component
 * never has to state the type.
 *
 * ── WHY THE ids ARE A HAND-PICKED LIST AND NOT THE WHOLE TABLE ─────────────
 * The picker on the edit page IS derived from `EDIT_PRESET_IDS`, so a preset
 * added later cannot go unrendered there. This is the opposite job: three
 * suggestions, chosen on merit for someone who has just been handed a product
 * photograph. Fourteen chips under every tile is not a suggestion. The array is
 * typed `EditPresetId[]`, so a renamed or deleted preset is a compile error
 * rather than a link that 400s.
 */
export const PRODUCT_NEXT_ACTIONS: readonly EditPresetId[] = [
  // The reason the preset table exists: Amazon.ae and Noon reject a main image
  // that is not a pure white seamless, and no customer reaches that spec by
  // typing "white background".
  'marketplace_white',
  // A phone photograph of a product is almost never clean — this is the second
  // thing anyone does to one.
  'remove_props',
  // The catalogue grade. Cheap, safe, and it makes a dim phone shot listable.
  'bright_ecommerce',
];

/**
 * A `src` long enough that navigating to it would fail.
 *
 * `persistGeneratedImage` returns an inline `data:` URL on its degradation
 * paths, and those run to megabytes. Putting one in an `href` costs that many
 * bytes of DOM PER ACTION, and the navigation itself does not survive: browsers
 * cap the URL they will push into history well below that. The old pencil link
 * had the same defect at 1x and rendered anyway — a control that cannot work is
 * worse than an absent one, so these are dropped instead.
 *
 * 4000 is comfortably under every browser's practical limit and comfortably
 * above any storage URL this app produces (they are ~120 characters).
 */
const MAX_DEEP_LINK_SRC = 4000;

interface EditNextActionsProps {
  /** The image THIS row acts on. Never "the first one": `PhotoshootPreview`
   *  renders a grid and numbers by `shot.index` for the same reason. */
  imageUrl: string;
  presets?: readonly EditPresetId[];
  /** The section heading. Shown once above a single image; omitted under the
   *  tiles of a grid, where repeating it per tile is noise. */
  withTitle?: boolean;
  className?: string;
}

export function EditNextActions({
  imageUrl,
  presets = PRODUCT_NEXT_ACTIONS,
  withTitle = false,
  className,
}: EditNextActionsProps): React.ReactElement | null {
  const t = useTranslations('edit');

  if (!imageUrl || imageUrl.length > MAX_DEEP_LINK_SRC) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      {withTitle && (
        <p className="text-xs font-medium text-[var(--color-text-secondary)]">{t('nextActionsTitle')}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((id) => (
          <Link
            key={id}
            href={`/edit?src=${encodeURIComponent(imageUrl)}&preset=${id}`}
            title={t(`presets.${id}.description`)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-primary-300 hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            <Wand2 className="h-3 w-3 flex-shrink-0" />
            <span>{t(`presets.${id}.label`)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
