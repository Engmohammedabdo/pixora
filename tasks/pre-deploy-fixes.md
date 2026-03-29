# Pre-Deploy Fixes — MUST complete before Coolify deployment

> **Priority:** 🔴 ALL items are blocking. Build must pass.
> **Rule:** After EVERY fix, run `npx tsc --noEmit` to verify. At the end: `npm run build` must succeed.

---

## Fix 1: Update Supabase Types — `purchased_credits` missing

**File:** `lib/supabase/types.ts`

Add `purchased_credits` to profiles in ALL three places (Row, Insert, Update):

```typescript
// In Row:
purchased_credits: number;
onboarding_completed: boolean;
onboarding_step: number;

// In Insert:
purchased_credits?: number;
onboarding_completed?: boolean;
onboarding_step?: number;

// In Update:
purchased_credits?: number;
onboarding_completed?: boolean;
onboarding_step?: number;
```

---

## Fix 2: Update `checkCredits` to include purchased_credits

**File:** `lib/credits/check.ts`

Currently only checks `credits_balance`. Must check total = `credits_balance + purchased_credits`:

```typescript
const { data, error } = await supabase
  .from('profiles')
  .select('credits_balance, purchased_credits')
  .eq('id', userId)
  .single();

const totalBalance = (data?.credits_balance || 0) + (data?.purchased_credits || 0);

return {
  hasEnough: totalBalance >= amount,
  currentBalance: totalBalance,
  required: amount,
};
```

---

## Fix 3: Update `useCredits` hook and credits store to include purchased_credits

**File:** `store/credits.ts` — add `purchasedCredits` field
**File:** `hooks/useCredits.ts` — fetch both fields
**File:** `app/[locale]/(dashboard)/layout.tsx` — set both balances

The dashboard layout currently does:
```typescript
setBalance(profile.credits_balance);
```
Should be:
```typescript
setBalance(profile.credits_balance + (profile.purchased_credits || 0));
```

---

## Fix 4: Fix Tailwind CSS build error

The build fails with `Cannot find module 'tailwindcss'`. 

Run:
```bash
npm install -D tailwindcss @tailwindcss/postcss postcss autoprefixer
```

Then check `postcss.config.js` — it should be:
```js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
```

OR if using Tailwind v3:
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

Check `package.json` to see which tailwind version is installed and match accordingly.

Also check `globals.css` — if using Tailwind v4, the `@tailwind` directives are wrong. They should be:
```css
@import "tailwindcss";
```
instead of:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Match the CSS syntax to the installed Tailwind version.

---

## Fix 5: Add `output: 'standalone'` for Docker/Coolify deployment

**File:** `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'pixoradb.pyramedia.cloud' },
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { protocol: 'https', hostname: 'replicate.delivery' },
    ],
  },
};
```

---

## Fix 6: Create Dockerfile for Coolify

**File:** `Dockerfile`

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args for env vars needed at build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_DEFAULT_LOCALE=ar

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_DEFAULT_LOCALE=$NEXT_PUBLIC_DEFAULT_LOCALE

RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

Also create `.dockerignore`:
```
node_modules
.next
.git
*.md
.env.local
```

---

## Fix 7: Remove local filesystem fallback from Upload API

**File:** `app/api/upload/route.ts`

Remove the entire local fallback section (the `writeFile` / `mkdir` part). If Supabase Storage fails, return error instead of falling back to local disk.

Remove these imports too:
```typescript
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
```

The upload should ONLY use Supabase Storage. If not configured, return a clear error.

---

## Fix 8: Voiceover — Wire up real TTS

**File:** `app/api/studios/voiceover/route.ts`

Replace the mock audio with a real TTS call. Use the OpenAI TTS API (simplest):

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const mp3 = await openai.audio.speech.create({
  model: 'tts-1',
  voice: mapVoice(input.voice), // map Arabic voice names to OpenAI voices
  input: input.script,
  speed: parseFloat(input.speed),
});

const audioBuffer = Buffer.from(await mp3.arrayBuffer());
// Upload to Supabase Storage bucket 'assets'
```

If OPENAI_API_KEY is not set, return a clear error message instead of mock data.

Install if needed: `npm install openai`

---

## Fix 9: Add rate limiting to AI studio endpoints

**File:** Create `lib/rate-limit.ts`

Simple in-memory rate limiter (good enough for single-instance Coolify):

```typescript
const rateMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
```

Apply in each studio API route at the top:
```typescript
if (!rateLimit(`studio:${user.id}`, 20, 60000)) {
  return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
}
```

---

## Final Verification

After all fixes, run these commands and ALL must pass:

```bash
npx tsc --noEmit        # Zero TypeScript errors
npm run build            # Build succeeds
```

Then commit:
```bash
git add -A && git commit -m "Pre-deploy fixes: types, Dockerfile, rate-limit, TTS, standalone output" && git push origin main
```
