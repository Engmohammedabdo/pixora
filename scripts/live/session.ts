/**
 * Mint a real session for the live-verification account, without a password.
 *
 * `admin.generateLink` mints a token and SENDS NOTHING; `/auth/v1/verify`
 * redeems it for a session. No password is created, typed, stored or
 * transmitted anywhere in this flow — which is what makes it safe to keep in the
 * repo and to run unattended.
 *
 * The cookie shape is @supabase/ssr's: `sb-<ref>-auth-token` carrying
 * `base64-` + base64url(JSON), split at 3180 characters when it does not fit.
 * Built by hand rather than by driving a browser because the harness is a
 * script, and because nothing here should be able to type into a login form.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_CHUNK = 3180;

function envValue(root: string, key: string): string {
  const src = readFileSync(join(root, '.env.local'), 'utf8');
  const m = src.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!m) throw new Error(`${key} is not set in .env.local`);
  return m[1].trim();
}

function base64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface LiveSession {
  cookie: string;
  userId: string;
  email: string;
}

export async function mintSession(root: string, email: string): Promise<LiveSession> {
  const supabaseUrl = envValue(root, 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
  const anon = envValue(root, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const service = envValue(root, 'SUPABASE_SERVICE_ROLE_KEY');

  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const link = (await linkRes.json()) as { hashed_token?: string; properties?: { hashed_token?: string } };
  if (!linkRes.ok) throw new Error(`generate_link ${linkRes.status}`);
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  if (!tokenHash) throw new Error('generate_link returned no hashed_token');

  const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }),
    redirect: 'manual',
  });
  const session = (await verifyRes.json()) as {
    access_token?: string; refresh_token?: string; token_type?: string;
    expires_in?: number; expires_at?: number; user?: { id: string };
  };
  if (!session.access_token || !session.user) throw new Error(`verify ${verifyRes.status}`);

  const encoded = 'base64-' + base64url(JSON.stringify({
    access_token: session.access_token,
    token_type: session.token_type ?? 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
  }));

  const ref = new URL(supabaseUrl).hostname.split('.')[0];
  const name = `sb-${ref}-auth-token`;
  const parts: string[] = [];
  for (let i = 0; i < encoded.length; i += MAX_CHUNK) parts.push(encoded.slice(i, i + MAX_CHUNK));

  return {
    cookie: parts.length === 1
      ? `${name}=${parts[0]}`
      : parts.map((p, i) => `${name}.${i}=${p}`).join('; '),
    userId: session.user.id,
    email,
  };
}
