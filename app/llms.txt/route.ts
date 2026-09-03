import { buildLlmsTxt } from '@/lib/seo/llms';

/**
 * /llms.txt — served from code so it cannot drift from the routes it points at.
 *
 * The body, and the reason this is not `public/llms.txt` any more, are in
 * `lib/seo/llms.ts`. The short version: the static file listed seven URLs and
 * not one of the twenty studio pages, and nothing could ever have told it they
 * existed. Deleting the static file is load-bearing — a `public/` file wins
 * over a route of the same name, which is how nineteen robots.txt rules sat
 * unserved in production for weeks.
 *
 * `middleware.ts:339` matches `/((?!_next|.*\..*).*)`, so a path containing a
 * dot never reaches the locale-prefix redirect. /llms.txt is unlocalized on
 * purpose: it carries both languages in one document.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(buildLlmsTxt(), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
