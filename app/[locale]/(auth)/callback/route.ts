import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function getBaseUrl(request: NextRequest): string {
  // Use NEXT_PUBLIC_APP_URL in production (Docker returns 0.0.0.0:3000 as origin)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  // Fallback: try x-forwarded headers from reverse proxy
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host && !host.includes('0.0.0.0')) {
    return `${proto}://${host}`;
  }
  // Last resort
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const locale = request.nextUrl.pathname.split('/')[1] || 'ar';
  const baseUrl = getBaseUrl(request);

  if (code) {
    const response = NextResponse.redirect(`${baseUrl}/${locale}/dashboard`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(`${baseUrl}/${locale}/login`);
}
