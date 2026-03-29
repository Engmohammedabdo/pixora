import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const publicPaths = ['/login', '/signup', '/callback', '/privacy', '/terms', '/forgot-password', '/reset-password'];

function isPublicPath(pathname: string): boolean {
  // Landing page: /ar or /en (exact locale root)
  if (/^\/[a-z]{2}\/?$/.test(pathname)) return true;
  return publicPaths.some((path) => pathname.includes(path));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
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
  const { pathname } = request.nextUrl;

  // Redirect logged-in users away from auth pages
  if (user && isPublicPath(pathname)) {
    const locale = pathname.split('/')[1] || 'ar';
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  // Redirect non-logged-in users to login
  if (!user && !isPublicPath(pathname) && !pathname.startsWith('/api')) {
    const locale = pathname.split('/')[1] || 'ar';
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
