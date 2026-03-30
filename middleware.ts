import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { jwtVerify } from 'jose';

const intlMiddleware = createIntlMiddleware(routing);

const publicPaths = ['/login', '/signup', '/callback', '/privacy', '/terms', '/forgot-password', '/reset-password'];

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
      '/api/health',
    ];

    const isPublicApi = publicApiPaths.some((p) => pathname.startsWith(p));

    if (!isPublicApi) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        const supabase = createServerClient(supabaseUrl, supabaseKey, {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => { request.cookies.set(name, value); });
            },
          },
        });

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
        }
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

    // Check if user is banned
    const { data: profile } = await supabase
      .from('profiles')
      .select('banned')
      .eq('id', user.id)
      .single();

    if (profile?.banned) {
      // Sign out banned user and redirect to login
      await supabase.auth.signOut();
      const locale = pathname.split('/')[1] || 'ar';
      return NextResponse.redirect(new URL(`/${locale}/login?error=banned`, request.url));
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
