# RULES.md — Pixora Project Rules

> هذي القواعد غير قابلة للتفاوض. كل قاعدة موجودة لسبب.

---

## 1. Code Quality Rules

### TypeScript
- `strict: true` — لا استثناءات
- لا `any` type. استخدم `unknown` + type narrowing
- كل function لها return type صريح
- Interfaces للـ objects، Types للـ unions
- Zod لـ runtime validation (خصوصاً API inputs)

```typescript
// ✅
async function getUser(id: string): Promise<User | null> { ... }

// ❌
async function getUser(id: any) { ... }
```

### Functions
- Function واحدة = مهمة واحدة (Single Responsibility)
- Max 50 lines per function — أكثر = extract
- Max 3 parameters — أكثر = object parameter
- لا side effects مخفية

### Components
- Max 150 lines per component — أكثر = split
- لا logic في الـ JSX — extract to variables
- Props interface صريحة دايماً
- لا prop drilling أكثر من 2 levels — استخدم context/zustand

### Error Handling
```typescript
// ✅ — كل API route لازم يكون هيك
try {
  // logic
} catch (error) {
  if (error instanceof z.ZodError) return validationError(error);
  if (error instanceof CreditsError) return creditError(error);
  logger.error('Unexpected error', { error, context });
  return serverError();
}
```

---

## 2. AI Prompt Engineering Rules

### Prompt Structure
كل prompt لازم يحتوي:
1. **Role** — "Act as a professional..."
2. **Context** — معلومات المستخدم والبراند
3. **Task** — المطلوب بالتحديد
4. **Format** — الشكل المطلوب للـ output
5. **Constraints** — القيود والممنوعات

### Image Prompts
```
// ✅ Template محددة
"Professional commercial photography for {brand_name}.
Product: {product_description}.
Style: {style}. Background: {background}.
Lighting: {lighting}. Camera angle: {angle}.
STRICTLY PRESERVE: original brand colors ({colors}), logo placement.
NO EXTRA generated text. NO extra logos.
Resolution: {resolution}."
```

### Text Prompts (Arabic)
- حدد اللهجة دايماً: سعودية / إماراتية / مصرية / خليجية / فصحى
- اطلب JSON output للـ structured data
- أضف `Return as valid JSON` في نهاية كل prompt يطلب structured output
- Validate الـ JSON response قبل ما تحفظه

### Prompt Versioning
- كل prompt يحمل version: `v1.0`
- عند تعديل prompt → version جديدة + comment
- Log أي prompt failures مع الـ input

### Safety
- لا تضع user input مباشرة في الـ prompt بدون sanitization
- Reject prompts تحتوي: NSFW keywords, competitor brand names
- Rate limit per user: 10 requests/minute per studio

---

## 3. Security Rules

### Authentication
- تحقق من الـ user في كل API route (لا exceptions)
- استخدم `supabase.auth.getUser()` مش `getSession()` في الـ server
- JWT expiry: 1 hour (refresh automatically)

### API Security
```typescript
// أول سطر في كل API route
const { data: { user }, error } = await supabase.auth.getUser();
if (!user || error) return unauthorized();
```

### Data Validation
- Validate كل input بـ Zod قبل أي processing
- Sanitize file uploads: allowed types فقط (PNG, JPG, SVG)
- Max file size: 10MB للصور
- لا تقبل URLs من المستخدم للـ AI بدون validation

### Secrets
- لا secrets في الـ client bundle — أبداً
- AI API keys في الـ server فقط
- Stripe secret key في الـ server فقط
- استخدم `.env.local` للـ local development
- لا `.env.local` في الـ git (في `.gitignore`)

### Stripe Webhooks
```typescript
// تحقق من signature دايماً
const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET!
);
```

### Storage
- Supabase Storage buckets: `private` للصور المولّدة
- Signed URLs فقط (15 min expiry)
- RLS على كل جدول — تحقق من ownership

---

## 4. Performance Rules

### Images
- استخدم `next/image` دايماً (لا `<img>`)
- Lazy loading افتراضي
- WebP format للـ generated images
- Thumbnails للـ gallery (300px wide)

### API Routes
- Response time target: < 500ms للـ non-AI endpoints
- AI generation: streaming عند الإمكانية
- Cache الـ brand kit data (React Query, 5 min)
- لا N+1 queries — استخدم joins

### React
- `React.memo` للـ expensive components
- `useMemo` للـ expensive computations
- `useCallback` للـ handlers في lists
- Virtualize lists أكثر من 50 items (TanStack Virtual)

### Bundle
- Dynamic imports للـ studios (lazy loading)
- لا تستورد libraries كاملة:
  ```typescript
  // ✅
  import { format } from 'date-fns/format';
  // ❌
  import dateFns from 'date-fns';
  ```

---

## 5. Accessibility Rules

### Semantic HTML
- استخدم elements صحيحة: `<button>` للـ buttons، `<a>` للـ links
- Headings hierarchy: h1 → h2 → h3 (لا skip)
- `<main>`, `<nav>`, `<aside>`, `<header>` لازم موجودة

### ARIA
- كل interactive element يحتاج label:
  ```jsx
  <button aria-label="توليد صورة">
  <input aria-describedby="prompt-hint">
  ```
- Loading states: `aria-busy="true"`
- Dynamic content: `aria-live="polite"`

### Keyboard Navigation
- Tab order منطقي
- Focus visible دايماً (لا `outline: none` بدون بديل)
- Escape يغلق الـ modals
- Arrow keys للـ dropdowns

### Colors
- Contrast ratio: min 4.5:1 للـ normal text
- لا تعتمد على اللون وحده للـ information
- Error states: لون + أيقونة + نص

---

## 6. Arabic / RTL Rules

### Direction
```html
<!-- Root layout -->
<html lang="ar" dir="rtl">
```

### CSS Classes (Tailwind RTL)
```jsx
// ✅ استخدم logical properties
className="ps-4 pe-6 ms-2 me-auto"
// ps = padding-inline-start
// pe = padding-inline-end
// ms = margin-inline-start

// ❌ ممنوع
className="pl-4 pr-6 ml-2 mr-auto"
```

### Icons في RTL
بعض الأيقونات تحتاج تعكس في RTL:
```jsx
// السهم يتعكس في RTL
<ChevronRight className="rtl:rotate-180" />
```

### Text
- الأرقام: استخدم `toLocaleString('ar-SA')` للأرقام العربية
- التواريخ: `new Date().toLocaleDateString('ar-SA')`
- العملة: `Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'USD' })`

### i18n
```typescript
// messages/ar.json
{
  "studios": {
    "creator": {
      "title": "منشئ الصور",
      "description": "أنشئ صوراً تسويقية احترافية"
    }
  }
}
```

- كل string visible للمستخدم لازم في ملفات الترجمة
- لا hardcoded Arabic/English text في الـ components
- استخدم `useTranslations` من `next-intl`

### Fonts
```css
/* globals.css */
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap');

:root {
  --font-arabic-heading: 'Cairo', sans-serif;
  --font-arabic-body: 'Tajawal', sans-serif;
}

[lang="ar"] {
  font-family: var(--font-arabic-body);
}

[lang="ar"] h1, [lang="ar"] h2, [lang="ar"] h3 {
  font-family: var(--font-arabic-heading);
}
```
