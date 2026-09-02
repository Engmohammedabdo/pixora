/**
 * Owned public profiles, for Organization.sameAs.
 *
 * DELIBERATELY EMPTY until a real URL is added. The 2026-09-01 audit found no
 * profile URL anywhere in this repo — only share-intent links — and an entity
 * graph that points at a profile the company does not own is worse than one
 * that points nowhere: answer engines key on it. Add only URLs you control:
 *   'https://www.instagram.com/<handle>',
 *   'https://www.linkedin.com/company/<slug>',
 *   'https://x.com/<handle>',
 * Footer.tsx renders whatever is here, so one edit updates both the schema
 * and the visible links.
 */
export const SOCIAL_PROFILES: readonly string[] = [];

/** How people and engines write the name. Arabic first. */
export const ORGANIZATION_ALTERNATE_NAMES: readonly string[] = ['Pyra Suite', 'بايرا سويت', 'بايرا'];

/** ISO 3166-1 alpha-2, the Gulf. */
export const AREA_SERVED: readonly string[] = ['AE', 'SA', 'KW', 'QA', 'BH', 'OM'];
