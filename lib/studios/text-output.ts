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
