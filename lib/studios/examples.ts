import manifest from '@/public/examples/studios/manifest.json';

/**
 * The real product outputs saved under public/examples/studios/.
 *
 * Built by scripts/build-studio-examples.mjs from live-run artifacts, and every
 * one of them is output this product actually produced on a PAID account
 * against production — see that script's header for why nothing here may come
 * from another generator.
 *
 * Read through this module, never by path: an id that names no file is then a
 * build failure (scripts/tests/studio-pages.test.ts) instead of a broken image.
 */
export interface StudioExample {
  id: string;
  file: string;
  width: number;
  height: number;
  bytes: number;
  sourceRun: string;
  sourceFile: string;
  alt: { ar: string; en: string };
}

const BY_ID = new Map<string, StudioExample>(
  (manifest as StudioExample[]).map((e) => [e.id, e]),
);

export function getExample(id: string): StudioExample | null {
  return BY_ID.get(id) ?? null;
}

export function getExamples(ids: readonly string[]): StudioExample[] {
  return ids.map((id) => BY_ID.get(id)).filter((e): e is StudioExample => Boolean(e));
}
