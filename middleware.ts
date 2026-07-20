import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { jwtVerify } from 'jose';

const intlMiddleware = createIntlMiddleware(routing);

const publicPaths = ['/login', '/signup', '/callback', '/privacy', '/terms', '/pricing', '/forgot-password', '/reset-password', '/opengraph-image'];

function isPublicPath(pathname: string): boolean {
  // Root path (before locale redirect)
  if (pathname === '/') return true;
  // Landing page: /ar or /en (exact locale root)
  if (/^\/[a-z]{2}\/?$/.test(pathname)) return true;
  // Strip locale prefix and check against public paths
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '') || '/';
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
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '') || '/';
    if (['/login', '/signup'].some((p) => pathWithoutLocale.startsWith(p))) {
      const locale = pathname.split('/')[1] || 'ar';
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
      const locale = pathname.split('/')[1] || 'ar';
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
        const locale = pathname.split('/')[1] || 'ar';
        return NextResponse.redirect(new URL(`/${locale}/onboarding`, request.url));
      }
    }
  }

  // Redirect non-logged-in users to login (protected pages only)
  if (!user) {
    const locale = pathname.split('/')[1] || 'ar';
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
