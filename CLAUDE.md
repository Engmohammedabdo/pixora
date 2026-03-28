# CLAUDE.md — Pixora Project Instructions

> هذا الملف للـ Claude Code Desktop. اقرأه كاملاً قبل أي كود.

---

## ⚠️ طريقة العمل — إلزامي!

### 1. اسأل قبل ما تبدأ
قبل كل مرحلة (Phase)، **اسأل المستخدم 3-5 أسئلة** للتأكد:
- هل فهمت المطلوب صح؟
- هل فيه تفضيلات تصميمية أو تقنية مختلفة؟
- هل فيه شي في الـ PRD مش منطقي أو يحتاج تعديل؟
- هل الأولويات زي ما هي ولا تغيّرت؟
- أي تساؤلات عن الربط مع المراحل السابقة؟

**لا تبدأ كود بدون أجوبة المستخدم!**

### 2. خطة قبل التنفيذ
قبل كل مرحلة، اكتب **خطة واضحة** تشمل:
- ✅ إيش اللي خلص في المراحل السابقة (ملخص سريع)
- 📋 إيش بنبني في هالمرحلة (قائمة مهام)
- 🔗 إيش يعتمد على إيش (dependencies من المراحل السابقة)
- ⚠️ أي مخاطر أو نقاط تحتاج انتباه
- اعرض الخطة على المستخدم واستنى موافقته

### 3. المراحل مترابطة
- كل مرحلة **تبني على اللي قبلها** — لا تكرر، لا تتعارض
- قبل ما تبدأ مرحلة جديدة، **راجع الكود الموجود** وتأكد إنك فاهم البنية
- لو لقيت شي في مرحلة سابقة يحتاج تعديل، **اقترح التعديل واسأل** قبل ما تغيّر
- حافظ على نفس الـ patterns والـ conventions بين المراحل

### 4. مراجعة مستمرة
- لو شي في الـ PRD أو tasks مش منطقي → **اسأل**
- لو عندك اقتراح أحسن → **اقترح واشرح ليش**
- لو الكود الموجود فيه مشكلة → **بلّغ المستخدم** قبل ما تمشي

### 5. سير العمل لكل مرحلة:
```
1. اقرأ tasks/phase-X-*.md
2. راجع الكود الموجود من المراحل السابقة
3. اكتب خطة + أسئلة (3-5 أسئلة)
4. استنى إجابات المستخدم
5. نفّذ المهام واحدة واحدة
6. بعد كل مهمة مهمة → أعرض النتيجة
7. لما تخلص المرحلة → ملخص شامل + إيش الخطوة الجاية
```

---

## Project Overview

**Pixora** — منصة SaaS للتسويق بالذكاء الاصطناعي. Multi-model (Gemini + GPT + Flux)، Arabic-first، Credits system + Stripe.

**Stack:** Next.js 15 + TypeScript + Tailwind + shadcn/ui + Supabase + Stripe + AI APIs

**الـ PRD الكامل:** `PRD.md`
**المراحل:** `PHASES.md`
**القواعد:** `RULES.md`

---

## File Structure

```
pixora/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth pages (no sidebar)
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/              # Protected dashboard
│   │   ├── layout.tsx            # Sidebar layout
│   │   ├── page.tsx              # Home/Dashboard
│   │   ├── creator/page.tsx
│   │   ├── photoshoot/page.tsx
│   │   ├── campaign/page.tsx
│   │   ├── plan/page.tsx
│   │   ├── storyboard/page.tsx
│   │   ├── analysis/page.tsx
│   │   ├── voiceover/page.tsx
│   │   ├── edit/page.tsx
│   │   ├── prompt-builder/page.tsx
│   │   ├── assets/page.tsx
│   │   ├── brand-kit/page.tsx
│   │   ├── projects/page.tsx
│   │   ├── team/page.tsx
│   │   ├── billing/page.tsx
│   │   └── settings/page.tsx
│   ├── api/                      # API Routes
│   │   ├── auth/
│   │   ├── credits/
│   │   ├── studios/
│   │   │   ├── creator/route.ts
│   │   │   ├── photoshoot/route.ts
│   │   │   ├── campaign/route.ts
│   │   │   └── ... (one file per studio)
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts
│   │   │   ├── topup/route.ts
│   │   │   ├── webhook/route.ts
│   │   │   └── portal/route.ts
│   │   ├── brand-kits/
│   │   ├── assets/
│   │   └── teams/
│   ├── globals.css
│   └── layout.tsx                # Root layout (fonts, providers)
│
├── components/
│   ├── ui/                       # shadcn components (DO NOT modify)
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   ├── CreditsWidget.tsx
│   │   └── StudioLayout.tsx      # Input + Preview panels
│   ├── studios/                  # One folder per studio
│   │   ├── creator/
│   │   │   ├── CreatorForm.tsx
│   │   │   ├── CreatorPreview.tsx
│   │   │   └── index.ts
│   │   └── ... (same pattern)
│   ├── brand-kit/
│   ├── billing/
│   ├── shared/
│   │   ├── GenerationHistory.tsx
│   │   ├── ExportButton.tsx
│   │   ├── ModelSelector.tsx
│   │   ├── ResolutionSelector.tsx
│   │   └── CreditCost.tsx
│   └── providers/
│       ├── QueryProvider.tsx
│       ├── SupabaseProvider.tsx
│       └── ThemeProvider.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── types.ts              # Generated DB types
│   ├── stripe/
│   │   ├── client.ts
│   │   └── plans.ts              # Plan definitions
│   ├── ai/
│   │   ├── gemini.ts
│   │   ├── openai.ts
│   │   ├── replicate.ts
│   │   └── router.ts             # Model selection logic
│   ├── credits/
│   │   ├── check.ts              # Check if enough credits
│   │   ├── deduct.ts             # Deduct credits + log
│   │   └── costs.ts              # Credit costs per action
│   └── utils.ts
│
├── hooks/
│   ├── useCredits.ts
│   ├── useBrandKit.ts
│   ├── useGeneration.ts
│   └── useUser.ts
│
├── store/
│   ├── credits.ts                # Zustand store
│   ├── brandKit.ts
│   └── ui.ts
│
├── types/
│   ├── database.ts               # Supabase types
│   ├── studios.ts                # Studio input/output types
│   └── api.ts
│
├── messages/                     # i18n
│   ├── ar.json
│   └── en.json
│
├── middleware.ts                  # Auth + locale redirect
├── next.config.ts
├── tailwind.config.ts
├── supabase/
│   ├── migrations/
│   └── seed.sql
└── .env.local.example
```

---

## Tech Stack Rules

### Next.js
- **App Router ONLY** — لا pages directory
- **Server Components** by default — استخدم `'use client'` فقط عند الحاجة
- **Loading states:** استخدم `loading.tsx` في كل folder
- **Error states:** استخدم `error.tsx`
- **Streaming:** استخدم Suspense للـ AI responses الطويلة
- **Route Groups:** `(auth)` و `(dashboard)` بدون URL prefix

### TypeScript
```typescript
// ✅ صح — كل شي typed
interface CreatorInput {
  prompt: string;
  model: 'gemini' | 'gpt' | 'flux';
  resolution: '1080p' | '2K' | '4K';
  brandKitId?: string;
  referenceImageUrl?: string;
}

// ❌ غلط
const input: any = {...}
```

- `strict: true` في tsconfig
- لا `any` — استخدم `unknown` لو مضطر
- Types في `types/` — مش inline
- استخدم Zod للـ API validation

### Tailwind & Styling
- CSS Variables للألوان (موجودة في `globals.css`)
- RTL يشتغل تلقائياً مع `dir="rtl"` على الـ html element
- استخدم `start/end` بدل `left/right` للـ RTL compatibility:
  ```jsx
  // ✅
  <div className="ps-4 me-2">
  // ❌
  <div className="pl-4 mr-2">
  ```
- Dark mode: class-based (`dark:`)
- لا inline styles

### shadcn/ui
- Components في `components/ui/` — لا تعدّل الملفات مباشرة
- Extend عن طريق wrapping:
  ```tsx
  // components/shared/PixoraButton.tsx
  import { Button } from '@/components/ui/button';
  export function PixoraButton(props) {
    return <Button variant="default" className="..." {...props} />;
  }
  ```

### Supabase
```typescript
// Server Component / API Route
import { createServerClient } from '@/lib/supabase/server';
const supabase = createServerClient();

// Client Component
import { createBrowserClient } from '@/lib/supabase/client';
const supabase = createBrowserClient();
```
- **RLS على كل table** — لا استثناءات
- لا تستخدم `service_role` key في الـ client side
- Migrations في `supabase/migrations/` — لا تعدّل DB مباشرة

### State Management
- **Zustand:** فقط للـ global client state (credits, sidebar, active brand kit)
- **React Query:** كل server data (generations, assets, projects)
- **useState:** local UI state فقط
- لا Redux — مش محتاجينه

### AI API Calls
**مهم جداً:** كل AI calls تروح من الـ server (API Routes) فقط:
```typescript
// ✅ app/api/studios/creator/route.ts
import { generateImage } from '@/lib/ai/gemini';

// ❌ لا تستدعي AI APIs من الـ client
```

**Model Selection Logic:**
```typescript
// lib/ai/router.ts
export function selectModel(studio: Studio, userPreference?: Model) {
  // Default models per studio
  const defaults = {
    creator: 'gemini',
    photoshoot: 'flux',
    edit: 'gpt',
  };
  return userPreference ?? defaults[studio];
}
```

### Credits System
```typescript
// قبل أي generation — دائماً
import { checkAndDeductCredits } from '@/lib/credits/deduct';

const result = await checkAndDeductCredits({
  userId,
  amount: CREDIT_COSTS.campaign,
  studio: 'campaign',
  description: 'Campaign generation - 9 posts',
});

if (!result.success) {
  return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
}
```

---

## Coding Conventions

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` (prefix: `use`)
- Utils: `camelCase.ts`
- Types: `camelCase.ts`
- API routes: `route.ts` (fixed)
- Constants: `UPPER_SNAKE_CASE`

### Component Structure
```tsx
// 1. Imports (external → internal → types)
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCost } from '@/components/shared/CreditCost';
import type { CreatorInput } from '@/types/studios';

// 2. Types
interface CreatorFormProps {
  onSubmit: (input: CreatorInput) => void;
  isLoading: boolean;
}

// 3. Component
export function CreatorForm({ onSubmit, isLoading }: CreatorFormProps) {
  // 3a. State
  const [prompt, setPrompt] = useState('');
  
  // 3b. Derived/computed
  const isValid = prompt.length > 10;
  
  // 3c. Handlers
  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({ prompt, model: 'gemini', resolution: '1080p' });
  };
  
  // 3d. Render
  return (
    <div>...</div>
  );
}
```

### API Route Structure
```typescript
// app/api/studios/creator/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { checkAndDeductCredits } from '@/lib/credits/deduct';
import { generateCreatorImage } from '@/lib/ai/router';
import { CREDIT_COSTS } from '@/lib/credits/costs';

const InputSchema = z.object({
  prompt: z.string().min(10).max(1000),
  model: z.enum(['gemini', 'gpt', 'flux']),
  resolution: z.enum(['1080p', '2K', '4K']),
  brandKitId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    // 2. Validate input
    const body = await req.json();
    const input = InputSchema.parse(body);
    
    // 3. Check + deduct credits
    const creditCost = CREDIT_COSTS.image[input.resolution];
    const creditResult = await checkAndDeductCredits({ userId: user.id, amount: creditCost, studio: 'creator' });
    if (!creditResult.success) {
      return NextResponse.json({ error: 'insufficient_credits', required: creditCost }, { status: 402 });
    }

    // 4. Generate
    const result = await generateCreatorImage(input);

    // 5. Save generation
    await supabase.from('generations').insert({
      user_id: user.id,
      studio: 'creator',
      model: input.model,
      input,
      output: result,
      credits_used: creditCost,
      status: 'completed',
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'validation_error', details: error.errors }, { status: 400 });
    }
    console.error('Creator API error:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
```

---

## Environment Variables

```bash
# .env.local
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# AI APIs
GOOGLE_GEMINI_API_KEY=
OPENAI_API_KEY=
REPLICATE_API_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=ar

# Analytics
NEXT_PUBLIC_POSTHOG_KEY=
SENTRY_DSN=
```

---

## Testing Requirements

### Unit Tests (Vitest)
- `lib/credits/` — 100% coverage
- `lib/ai/router.ts` — 100% coverage
- Utils functions

### Integration Tests (Playwright)
- Auth flow (signup → verify → login)
- Credits: check, deduct, top-up flow
- Stripe checkout flow (test mode)
- Studio generation (mock AI responses)

### Run Commands
```bash
npm run test        # unit tests
npm run test:e2e    # playwright
npm run test:ci     # all + coverage
```

---

## Git Conventions

### Branches
```
main          # production
develop       # integration
feature/*     # new features
fix/*         # bug fixes
chore/*       # deps, config
```

### Commit Messages
```
feat: add Campaign Planner studio
fix: credit deduction race condition
chore: update shadcn components
refactor: extract model router to lib/ai
test: add credit system unit tests
```

### PR Rules
- PR → develop (لا main مباشرة)
- Tests يجب تعدي
- لا `console.log` في الـ production code
- TypeScript errors = صفر

---

## Do's and Don'ts

### ✅ DO
- استخدم Server Components بقدر الإمكان
- Validate كل API input بـ Zod
- Log errors في Sentry
- استخدم `loading.tsx` و `error.tsx`
- RTL-first: استخدم `start/end/ms/me/ps/pe`
- Cache expensive operations بـ React Query
- Optimistic updates للـ UX

### ❌ DON'T
- لا `any` type
- لا AI calls من الـ client
- لا secrets في الـ client bundle
- لا direct DB calls بدون RLS check
- لا inline styles
- لا تعدل files في `components/ui/`
- لا تسقط الـ error handling في API routes
- لا تستخدم `left/right` CSS — استخدم `start/end`

---

## Deployment

### Vercel (Production)
```bash
# Deploy
vercel --prod

# Environment Variables
# Set via Vercel Dashboard or:
vercel env add STRIPE_SECRET_KEY production
```

### Supabase Migrations
```bash
# Apply migrations
supabase db push

# Generate types
supabase gen types typescript --local > lib/supabase/types.ts
```

### Pre-deployment Checklist
- [ ] All env vars set in Vercel
- [ ] Stripe webhook URL updated
- [ ] Supabase RLS policies enabled
- [ ] `npm run build` passes
- [ ] Tests pass
- [ ] Sentry DSN configured
