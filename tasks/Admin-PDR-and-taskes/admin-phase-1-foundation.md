# Phase 1: Admin Foundation — Auth + Layout + Routing

> **Goal:** Admin can log in, see the layout, and navigate between empty pages.
> **Estimate:** 1-2 days
> **Dependencies:** `jose` package

---

## Pre-requisites

```bash
npm install jose recharts
```

Add to `.env.local.example`:
```bash
# Admin Dashboard
ADMIN_USERNAME=admin
ADMIN_PASSWORD=PyraAdmin2026!SecurePass
ADMIN_JWT_SECRET=your-64-char-random-string-here-generate-with-openssl-rand-hex-32
```

---

## Task 1.1: Database Migration

**File:** `supabase/migrations/015_admin_dashboard.sql`

```sql
-- System Settings (key-value store for admin overrides)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'admin'
);

-- Seed defaults
INSERT INTO system_settings (key, value) VALUES
  ('studio_config', '{}'),
  ('model_config', '{"enabled": ["gemini", "gpt", "flux"], "fallback_order": ["gemini", "gpt", "flux"]}'),
  ('prompt_overrides', '{}'),
  ('feature_flags', '{"maintenance_mode": false, "registration_enabled": true, "free_plan_enabled": true, "referral_enabled": true, "daily_bonus_enabled": true}'),
  ('rate_limits', '{"requests_per_minute": 10, "daily_generations": {"free": 10, "starter": 50, "pro": 100, "business": 200, "agency": 500}}'),
  ('app_config', '{"watermark_text": "PyraSuite", "default_locale": "ar"}')
ON CONFLICT (key) DO NOTHING;

-- Admin Logs
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);

-- Ban support on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
```

- [ ] Create migration file
- [ ] Apply via Supabase SQL Editor or `scripts/apply-migrations.sh`
- [ ] Verify tables exist: `system_settings`, `admin_logs`
- [ ] Verify `profiles` has `banned`, `banned_at`, `ban_reason` columns

---

## Task 1.2: Admin Auth Library

**File:** `lib/admin/auth.ts`

```typescript
import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';

const COOKIE_NAME = 'admin_session';
const EXPIRY = '24h';

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error('ADMIN_JWT_SECRET not configured');
  return new TextEncoder().encode(secret);
}

// Login rate limiting (in-memory, sufficient for single admin)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_ATTEMPTS) return false;
  record.count++;
  return true;
}

export function resetLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

export async function verifyCredentials(username: string, password: string): boolean {
  return (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  );
}

export async function createAdminToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyAdminSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export { COOKIE_NAME };
```

- [ ] Create `lib/admin/auth.ts`
- [ ] Ensure TypeScript compiles cleanly

---

## Task 1.3: Admin DB Client

**File:** `lib/admin/db.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

// Creates a Supabase client with service_role key (bypasses RLS)
// ONLY use this in admin API routes — never expose to frontend
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase env vars not configured');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
```

- [ ] Create `lib/admin/db.ts`

---

## Task 1.4: Admin Logger

**File:** `lib/admin/logger.ts`

```typescript
import { createAdminClient } from './db';

export async function logAdminAction(
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, any> | null,
  ipAddress: string | null
) {
  try {
    const supabase = createAdminClient();
    await supabase.from('admin_logs').insert({
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      ip_address: ipAddress,
    });
  } catch (error) {
    console.error('[AdminLogger] Failed to log action:', error);
  }
}

export function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
```

- [ ] Create `lib/admin/logger.ts`

---

## Task 1.5: Auth API Routes

**File:** `app/api/admin/auth/login/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyCredentials,
  createAdminToken,
  checkLoginRateLimit,
  resetLoginAttempts,
  COOKIE_NAME,
} from '@/lib/admin/auth';
import { logAdminAction } from '@/lib/admin/logger';
import { getClientIP } from '@/lib/admin/logger';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  // Rate limit check
  if (!checkLoginRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password required' },
        { status: 400 }
      );
    }

    const valid = await verifyCredentials(username, password);
    if (!valid) {
      await logAdminAction('login_failed', null, null, { username }, ip);
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Success — create token and set cookie
    resetLoginAttempts(ip);
    const token = await createAdminToken();

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 86400, // 24 hours
    });

    await logAdminAction('login_success', null, null, null, ip);
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**File:** `app/api/admin/auth/logout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/admin/auth';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);

  await logAdminAction('logout', null, null, null, getClientIP(request));
  return response;
}
```

- [ ] Create `app/api/admin/auth/login/route.ts`
- [ ] Create `app/api/admin/auth/logout/route.ts`

---

## Task 1.6: Update Middleware

**File:** `middleware.ts` — add admin route handling at the TOP of the function, before intl.

Add these imports at top:
```typescript
import { jwtVerify } from 'jose';
```

Add this block at the beginning of the `middleware()` function, BEFORE the `isPublicPath` check:

```typescript
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
      } catch { /* show login */ }
    }
    return NextResponse.next();
  }

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
```

Also update the matcher to ensure admin routes are matched:
```typescript
export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
```

- [ ] Add `jose` import to middleware
- [ ] Add admin route handling block BEFORE intl middleware
- [ ] Verify middleware matcher includes `/admin` paths
- [ ] Test: `/admin` redirects to `/admin/login` when not authenticated
- [ ] Test: `/admin/login` shows login page
- [ ] Test: After login, `/admin/login` redirects to `/admin/dashboard`

---

## Task 1.7: Admin Login Page

**File:** `app/admin/login/page.tsx`

This is a standalone page — NOT inside `[locale]`. Always English, LTR.

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || 'Login failed');
        return;
      }

      router.push('/admin/dashboard');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  // UI: Centered card on dark background
  // Form with username + password inputs
  // Submit button with loading state
  // Error message display
  // Style: slate-950 background, white card, indigo-600 button
  // No shadcn dependencies — plain Tailwind for simplicity
}
```

- [ ] Create `app/admin/login/page.tsx`
- [ ] Style: dark background, centered white card, clean inputs
- [ ] Test: login flow end-to-end

---

## Task 1.8: Admin Layout

**File:** `app/admin/layout.tsx`

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PyraSuite Admin',
  robots: 'noindex, nofollow', // Don't index admin pages
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body className="bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

**File:** `components/admin/AdminLayout.tsx`

Client component wrapping authenticated admin pages.

```typescript
'use client';

import { useState } from 'react';
import AdminSidebar from './AdminSidebar';
import AdminTopBar from './AdminTopBar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopBar />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

**File:** `components/admin/AdminSidebar.tsx`

```
Navigation items:
- 📊 Dashboard      → /admin/dashboard
- 👥 Users          → /admin/users
- 🎨 Generations    → /admin/generations
- 💳 Transactions   → /admin/transactions
- ─── separator ───
- 🎛️ Studios        → /admin/studios
- 🤖 AI Models      → /admin/models
- 📝 Prompts        → /admin/prompts
- ─── separator ───
- ⚙️ Settings       → /admin/settings
- 📋 Logs           → /admin/logs
```

Style:
- Width: 240px (collapsed: 64px)
- Background: `slate-900`
- Active item: `slate-800` with `indigo-500` left border (3px)
- Text: `slate-400` inactive, `white` active
- Icons: Lucide React
- PyraSuite logo/text at top
- Collapse toggle at bottom

**File:** `components/admin/AdminTopBar.tsx`

```
- Height: 56px
- Background: white with bottom border
- Left: Breadcrumb (Admin / Current Page)
- Right: Red "Admin" badge + "Logout" button
- Logout: POST /api/admin/auth/logout → redirect to /admin/login
```

- [ ] Create `app/admin/layout.tsx`
- [ ] Create `components/admin/AdminLayout.tsx`
- [ ] Create `components/admin/AdminSidebar.tsx`
- [ ] Create `components/admin/AdminTopBar.tsx`

---

## Task 1.9: Dashboard Layout Page (Placeholder)

**File:** `app/admin/dashboard/page.tsx`

Use the AdminLayout wrapper. Show placeholder text "Dashboard — Coming in Phase 2".

```typescript
import AdminLayout from '@/components/admin/AdminLayout';

export default function AdminDashboardPage() {
  return (
    <AdminLayout>
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-slate-500 mt-2">Coming in Phase 2...</p>
    </AdminLayout>
  );
}
```

Create similar placeholder pages for ALL routes:
- [ ] `app/admin/dashboard/page.tsx`
- [ ] `app/admin/users/page.tsx`
- [ ] `app/admin/users/[id]/page.tsx`
- [ ] `app/admin/generations/page.tsx`
- [ ] `app/admin/transactions/page.tsx`
- [ ] `app/admin/studios/page.tsx`
- [ ] `app/admin/models/page.tsx`
- [ ] `app/admin/prompts/page.tsx`
- [ ] `app/admin/settings/page.tsx`
- [ ] `app/admin/logs/page.tsx`

---

## Verification Checklist

- [ ] `npm run build` passes with no errors
- [ ] `/admin` redirects to `/admin/login`
- [ ] Login with correct credentials → redirected to `/admin/dashboard`
- [ ] Login with wrong credentials → error message
- [ ] 6 rapid wrong logins → rate limited (429)
- [ ] `/admin/dashboard` shows layout with sidebar and topbar
- [ ] All sidebar links navigate to correct placeholder pages
- [ ] Logout → redirected to `/admin/login`
- [ ] After logout, `/admin/dashboard` redirects to login
- [ ] Regular user pages (`/ar/dashboard`) still work normally
- [ ] Admin routes not visible in sitemap
