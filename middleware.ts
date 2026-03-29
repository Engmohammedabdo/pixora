import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

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

  // Public paths: run intl middleware and return immediately (no auth check)
  if (isPublicPath(pathname) || pathname.startsWith('/api')) {
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
  }

  // Redirect non-logged-in users to login (protected pages only)
  if (!user) {
    const locale = pathname.split('/')[1] || 'ar';
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
