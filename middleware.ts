import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { jwtVerify } from 'jose';

const intlMiddleware = createIntlMiddleware(routing);

// `/waitlist` is the pre-launch signup page: it exists to be reached by people
// who have no account at all, so leaving it out would redirect every visitor to
// the login screen and collect nothing.
// `/contact` must be public for the same reason `/waitlist` is, only more so: the
// people most likely to need it are the ones who cannot sign in. Requiring a session
// would close the support channel to exactly that group — which today includes
// anyone who forgets a password, since Supabase Auth has no mailer.
const publicPaths = ['/login', '/signup', '/callback', '/privacy', '/terms', '/pricing', '/waitlist', '/contact', '/forgot-password', '/reset-password', '/opengraph-image'];

const LOCALES: readonly string[] = routing.locales;

/**
 * The locale prefix of a path, or null when it has none.
 *
 * Every locale read below used to be `pathname.split('/')[1] || 'ar'`, which never
 * asks whether the first segment IS a locale. On `/login` it answered `'login'`,
 * so the redirect built from it became `/login/login` — whose first segment is
 * again `'login'`, so the next pass built the same URL again. Locale-less
 * `/login`, `/signup`, `/pricing` and `/dashboard` were an infinite redirect loop
 * in production, and `/pricing` is exactly the URL a launch announcement links to.
 *
 * Matching against the configured list is what makes the answer total: a segment
 * either is a locale or the path has none, with no third case left for a later
 * reader to guess at.
 */
function localeOf(pathname: string): string | null {
  const first = pathname.split('/')[1];
  return first && LOCALES.includes(first) ? first : null;
}

/** The path with its locale prefix removed, or unchanged when it has none. */
function stripLocale(pathname: string): string {
  const locale = localeOf(pathname);
  if (!locale) return pathname || '/';
  return pathname.slice(locale.length + 1) || '/';
}

function isPublicPath(pathname: string): boolean {
  // Root path (before locale redirect)
  if (pathname === '/') return true;
  // Landing page: /ar or /en (exact locale root)
  if (/^\/[a-z]{2}\/?$/.test(pathname)) return true;
  // Strip locale prefix and check against public paths. The old version cut two
  // characters off unconditionally, turning '/login' into 'gin' and '/pricing'
  // into 'icing', so no locale-less public path ever matched this list and all
  // of them fell through to the authenticated branch below.
  const pathWithoutLocale = stripLocale(pathname);
  if (pathWithoutLocale === '/' || pathWithoutLocale === '') return true;
  return publicPaths.some((path) => pathWithoutLocale.startsWith(path));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ===== ADMIN ROUTES — Handle before intl =====
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      const adminToken = request.cookies.get('admin_session')?.value;
      if (adminToken) {
        try {
          const secret = process.env.ADMIN_JWT_SECRET;
          if (secret) {
            await jwtVerify(adminToken, new TextEncoder().encode(secret));
            return NextResponse.redirect(new URL('/admin/dashboard', request.url));
          }
        } catch { /* invalid token, show login */ }
      }
      return NextResponse.next();
    }

    // All other admin routes — require auth
    const adminToken = request.cookies.get('admin_session')?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    try {
      const secret = process.env.ADMIN_JWT_SECRET;
      if (!secret) throw new Error('No secret');
      await jwtVerify(adminToken, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('admin_session');
      return response;
    }
  }
  // ===== END ADMIN ROUTES =====

  // ===== ADMIN API ROUTES — Defense-in-depth JWT check =====
  if (pathname.startsWith('/api/admin') && !pathname.startsWith('/api/admin/auth/login')) {
    const adminToken = request.cookies.get('admin_session')?.value;
    if (!adminToken) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    try {
      const secret = process.env.ADMIN_JWT_SECRET;
      if (!secret) throw new Error('No secret');
      await jwtVerify(adminToken, new TextEncoder().encode(secret));
    } catch {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }
  // ===== END ADMIN API ROUTES =====

  // ===== API ROUTE AUTH (defense-in-depth) =====
  if (pathname.startsWith('/api/')) {
    const publicApiPaths = [
      '/api/stripe/webhook',
      '/api/public/',
      '/api/admin/',
      // Errors on the login page or before hydration are exactly the ones
      // worth seeing — this route does its own validation, rate limiting
      // and newline-stripping, and attaches a user id when a session
      // happens to exist, but must never require one.
      '/api/client-errors',
      // Uptime monitors have no session to send. The handler itself only
      // ever returns a coarse `{ status, timestamp }` — see app/api/health/
      // route.ts — so exposing it here leaks nothing sensitive.
      '/api/health',
      // Pre-launch signup: the whole point is that the visitor has no account.
      // The handler rate-limits by IP, validates with Zod, carries a honeypot,
      // and writes through a service-role RPC that accepts only four fields —
      // and the public key can neither read the list nor call that RPC.
      '/api/waitlist',
      // Support: unauthenticated by design. The handler rate-limits by IP, validates
      // with Zod, carries a honeypot, and writes through a service-role RPC with a
      // fixed argument list. It attaches the user id only from a VERIFIED session,
      // never from the request body, so a logged-out sender cannot file a ticket
      // that appears to come from someone else.
      '/api/support',
      // Password reset. Requiring a session here is a contradiction: the caller
      // is by definition someone who cannot get one. Left out of this list it
      // returned 401 to every locked-out customer — which is how the first
      // version of the route behaved until it was actually exercised.
      //
      // The handler is built for the exposure: it decides mail availability
      // from configuration BEFORE it looks at the address, throttles per source
      // AND per address through the atomic RPC, stores only a hash of the
      // address in the counter, and returns a byte-identical body whether or
      // not the account exists.
      '/api/auth/recover',
    ];

    const isPublicApi = publicApiPaths.some((p) => pathname.startsWith(p));

    if (!isPublicApi) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        // getUser() can rotate the refresh token. Both the outgoing request AND
        // the response must carry the new values, or the browser keeps a token
        // the server has already consumed and its next refresh fails.
        //
        // The response must be RECREATED inside setAll, after request.cookies
        // is mutated — not built once beforehand. NextResponse.next({ request })
        // snapshots request.headers into the `x-middleware-request-*` headers
        // at CONSTRUCTION time, so a `response` built before setAll runs would
        // carry a pre-mutation snapshot of the request and the downstream route
        // handler would never observe the rotated cookie, even though the
        // browser (which reads response.cookies, set further below) does
        // receive it correctly.
        let response = NextResponse.next({ request });

        const supabase = createServerClient(supabaseUrl, supabaseKey, {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => { request.cookies.set(name, value); });
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) => { response.cookies.set(name, value, options); });
            },
          },
        });

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
        }

        // A ban has to be enforced HERE, not per route. Until this line existed
        // the ONLY ban check in the product was in the page-navigation branch
        // below, so a banned account lost nothing but HTML: every studio, every
        // credit spend and every paid route stayed open to it, and grepping
        // `banned` across app/api and lib returned zero hits outside the admin
        // panel's own read/write of the column. Banning also did not revoke the
        // Supabase session — the sole signOut() is in the page branch and
        // therefore fires only if the banned user chooses to load a page, which
        // is the one thing they no longer need to do.
        //
        // Cost, stated so nobody deletes it as "an extra query": one primary-key
        // select on `profiles` per authenticated API request, the same read the
        // page branch already makes per navigation. There is no cheaper place for
        // it — the flag lives in a table, not in the JWT, so no claim on the token
        // can answer this without a round trip.
        //
        // Fails OPEN on a read error, deliberately. For a session that just
        // passed getUser(), the only way this select fails is the database being
        // unreachable — and then every route behind this check is failing anyway,
        // so a fail-closed version would turn an outage into a wall of "banned"
        // for paying customers. The second layer covering that window is the
        // GoTrue-side revocation performed at ban time in
        // app/api/admin/users/[id]/route.ts, which stops the refresh token from
        // outliving the ban.
        const { data: profile } = await supabase
          .from('profiles')
          .select('banned')
          .eq('id', user.id)
          .single();

        if (profile?.banned) {
          return NextResponse.json({ success: false, error: 'banned' }, { status: 403 });
        }

        return response;
      }
    }

    return NextResponse.next();
  }
  // ===== END API ROUTE AUTH =====

  // Public paths: run intl middleware and return immediately (no auth check)
  if (isPublicPath(pathname)) {
    const intlResponse = intlMiddleware(request);
    return intlResponse || NextResponse.next({ request });
  }

  // Handle intl routing first
  const intlResponse = intlMiddleware(request);
  const response = intlResponse || NextResponse.next({ request });

  // Skip auth checks if Supabase is not configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  // Create Supabase client with cookie handling
  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect logged-in users away from auth pages (login/signup only, NOT landing page)
  if (user) {
    const pathWithoutLocale = stripLocale(pathname);
    if (['/login', '/signup'].some((p) => pathWithoutLocale.startsWith(p))) {
      const locale = localeOf(pathname) ?? routing.defaultLocale;
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    }

    // Check ban + onboarding status in the same query — a second `profiles`
    // select here would double the per-navigation round trip this block
    // already makes.
    const { data: profile } = await supabase
      .from('profiles')
      .select('banned, onboarding_completed')
      .eq('id', user.id)
      .single();

    if (profile?.banned) {
      // Sign out banned user and redirect to login
      await supabase.auth.signOut();
      const locale = localeOf(pathname) ?? routing.defaultLocale;
      return NextResponse.redirect(new URL(`/${locale}/login?error=banned`, request.url));
    }

    // Force onboarding for any signed-in, non-banned user who has not
    // completed it, but ONLY when landing on the dashboard root. This is the
    // path that catches an email/password signup or login: today
    // login/page.tsx navigates straight to /dashboard and never sees
    // onboarding at all, while OAuth/magic-link users get a one-time
    // redirect from callback/route.ts on sign-in only. Checking the flag
    // here closes the "closed the tab mid-flow" gap for the password flow
    // too.
    //
    // Scope is deliberately narrow — exactly /dashboard or / (post-locale-
    // strip) — NOT every authenticated page. A user mid-onboarding who
    // clicks the "جرّب الآن" CTA into a studio (e.g. /creator) is allowed to
    // use it rather than being bounced back to /onboarding; only re-entering
    // the dashboard root re-triggers the prompt. Public paths (login/signup/
    // callback/privacy/terms/forgot-password/reset-password, plus the bare
    // locale root) never reach this line — isPublicPath() above returns
    // before this block runs. API routes (/api/*) are handled in their own
    // early-return branch further up and also never reach here.
    if (!profile?.onboarding_completed) {
      const isDashboardRoot = pathWithoutLocale === '/dashboard' || pathWithoutLocale === '/';
      if (isDashboardRoot) {
        const locale = localeOf(pathname) ?? routing.defaultLocale;
        return NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url));
      }
    }
  }

  // Redirect non-logged-in users to login (protected pages only)
  if (!user) {
    const locale = localeOf(pathname) ?? routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
