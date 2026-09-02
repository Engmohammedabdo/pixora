/**
 * Which paths need a session.
 *
 * Exactly the route directories under app/[locale]/(dashboard)/ — nothing
 * else. This is a hand-written list, and scripts/tests/protected-prefixes.test.ts
 * fails the build the moment it disagrees with the directory listing, in either
 * direction; a new studio that is not added here is a build failure, not a
 * public page. (Reading the filesystem from middleware is not possible on the
 * edge runtime, which is why the test does it instead.)
 *
 * Before this, "not public" meant "protected", so every unknown URL on the
 * site 307'd to login instead of 404ing.
 */
export const PROTECTED_PREFIXES: readonly string[] = [
  '/analysis',
  '/assets',
  '/billing',
  '/brand-kit',
  '/campaign',
  '/creator',
  '/dashboard',
  '/edit',
  '/onboarding',
  '/photoshoot',
  '/plan',
  '/projects',
  '/prompt-builder',
  '/referrals',
  '/settings',
  '/storyboard',
  '/voiceover',
];

/** `pathWithoutLocale` is the path after stripLocale(): '/creator/x', '/pricing', '/'. */
export function isProtectedPath(pathWithoutLocale: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(`${p}/`));
}
