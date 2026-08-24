/**
 * The studios whose entire deliverable lives in `generations.output`.
 *
 * These three are different in kind from the other six. `creator`, `edit`,
 * `photoshoot`, `campaign` and `voiceover` produce files, and files are written
 * to `assets`, which the files page reads — so their work survives a reload
 * whatever happens to `output`. `plan`, `analysis` and `storyboard` produce
 * text, write it only into `output`, and had no customer-facing reader at all
 * until `/api/generations`. A customer who reloaded lost work they had paid
 * 5, 3 or 14 credits for.
 *
 * Keeping the list in one place matters because two rules depend on it and they
 * must not drift: the history route lists exactly these, and the detail route
 * refuses everything else. Measured on the live table, the studios NOT in this
 * list carry 904 kB – 2.8 MB of base64 in `output`; serving one of those rows
 * through the detail route would be a multi-megabyte response to a phone.
 *
 * `prompt-builder` is deliberately absent: it holds a NULL output (measured),
 * costs nothing and produces a prompt the customer already has on screen.
 */
export const TEXT_STUDIOS = ['plan', 'analysis', 'storyboard'] as const;

export type TextStudio = (typeof TEXT_STUDIOS)[number];

export function isTextStudio(value: string): value is TextStudio {
  return (TEXT_STUDIOS as readonly string[]).includes(value);
}

/**
 * Every studio a customer can reopen from history.
 *
 * `campaign` belongs here and NOT in TEXT_STUDIOS, because the two lists answer
 * different questions. Its nine Arabic captions, hooks, hashtag sets and
 * schedules live only in `generations.output` — with "Generate All Images"
 * unchecked the route writes ZERO `assets` rows, so a reload destroyed 3 credits
 * of strategy exactly the way it destroyed a plan. The header above claims their
 * work "survives a reload whatever happens to output"; for campaign that was
 * true only of the images, and only when images were asked for.
 *
 * But campaign's output also carries an `imageUrl` per post, and
 * lib/storage/persist-image.ts hands back a base64 `data:` URL on four
 * degradation paths — so unlike the three text studios, this row is not reliably
 * small. `stripInlineImages()` is what makes it safe to serve; adding campaign
 * here without it would reintroduce exactly the multi-megabyte response the
 * detail route was written to refuse.
 */
export const RETRIEVABLE_STUDIOS = ['plan', 'analysis', 'storyboard', 'campaign'] as const;

export type RetrievableStudio = (typeof RETRIEVABLE_STUDIOS)[number];

export function isRetrievableStudio(value: string): value is RetrievableStudio {
  return (RETRIEVABLE_STUDIOS as readonly string[]).includes(value);
}

/**
 * A stored `output` is only ever served after this. Any string value that is an
 * inline `data:` payload becomes null.
 *
 * Stated on the VALUE, not on the key name `imageUrl`: the rule has to hold for
 * whatever a future studio calls its image field, and a blacklist of key names is
 * the same shape of mistake as migration 038 v1's blacklist on OLD, which a NULL
 * hop walked straight through. The bytes are already reachable through `assets`
 * and the files page, so a null here costs a thumbnail, never the deliverable.
 */
export function stripInlineImages(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith('data:') ? null : value;
  if (Array.isArray(value)) return value.map(stripInlineImages);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripInlineImages(v);
    return out;
  }
  return value;
}

/**
 * Second, independent ceiling on one detail response. `stripInlineImages` covers
 * the only unbounded source known TODAY; this covers the one nobody has thought
 * of yet. 256 kB is far above the largest legitimate text deliverable (a
 * 14-credit storyboard) and far below the smallest blob the route refuses.
 */
export const MAX_RETRIEVABLE_OUTPUT_BYTES = 256 * 1024;
