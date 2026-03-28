# Phase 2: Core AI Studios — Tasks

> **Goal:** 3 استوديوهات رئيسية شغّالة مع Credits
> **Duration:** ~2 weeks
> **Demo:** Upload product → Generate campaign → Download results

---

## Prerequisites
- [ ] Phase 1 مكتمل 100%
- [ ] AI API keys موجودة في `.env.local`
- [ ] Supabase Storage buckets configured

---

## 1. AI Infrastructure

- [ ] **1.1** Create `lib/ai/gemini.ts`:
  - `generateImage(prompt, options)` — gemini-2.5-flash-image
  - `generateText(prompt, options)` — gemini-2.5-pro
  - Error handling + retry (3 attempts)
  - Rate limiting wrapper
  
- [ ] **1.2** Create `lib/ai/openai.ts`:
  - `generateImage(prompt, options)` — gpt-image-1
  - `generateText(prompt, options)` — gpt-4o
  - Error handling + retry
  
- [ ] **1.3** Create `lib/ai/replicate.ts`:
  - `generateFlux(prompt, options)` — flux-1.1-pro
  - Polling للـ async generation
  - Error handling
  
- [ ] **1.4** Create `lib/ai/router.ts`:
  - `generateImage(studio, model, input)` — routes to correct API
  - Default model per studio
  - Fallback: إذا فشل Gemini → GPT
  
- [ ] **1.5** Create `components/shared/ModelSelector.tsx`:
  - Tabs: Gemini / GPT / Flux
  - كل model يعرض: speed, quality, cost
  - Default highlighted

- [ ] **1.6** Create `components/shared/ResolutionSelector.tsx`:
  - Options: 1080p / 2K / 4K
  - كل option يعرض الكريدت المطلوب
  - Disabled options حسب الـ plan

- [ ] **1.7** Create `components/shared/GenerationHistory.tsx`:
  - Strip أسفل كل studio
  - آخر 5 generations
  - Click to restore/reuse

- [ ] **1.8** Create `app/api/upload/route.ts`:
  - تحميل صور للـ Supabase Storage
  - Validation: PNG/JPG/SVG فقط، max 10MB
  - Returns signed URL

**Acceptance Criteria:**
- كل 3 APIs تشتغل (يمكن mock أثناء التطوير)
- ModelSelector يعمل وirects الـ request
- File upload لـ Supabase Storage يشتغل

---

## 2. Studio: Creator 🎨

- [ ] **2.1** Create `app/(dashboard)/creator/page.tsx`
- [ ] **2.2** Create `components/studios/creator/CreatorForm.tsx`:
  - Prompt textarea (Arabic + English)
  - Reference image upload (اختياري)
  - ModelSelector
  - ResolutionSelector
  - Style selector: Photographic / Illustrative / Minimalist / Bold
  - Brand Kit toggle (auto-inject brand colors/logo)
  - CreditCost badge
  - "Generate" button

- [ ] **2.3** Create `components/studios/creator/CreatorPreview.tsx`:
  - Loading skeleton during generation
  - Generated image(s) display
  - Variations grid (1x أو 4x)
  - Download button per image
  - "Regenerate" button
  - "Edit" shortcut (يفتح Edit studio)

- [ ] **2.4** Create `app/api/studios/creator/route.ts`:
  ```typescript
  // Input validation (Zod):
  // - prompt: string (10-1000 chars)
  // - model: 'gemini' | 'gpt' | 'flux'
  // - resolution: '1080p' | '2K' | '4K'
  // - style: string
  // - brandKitId?: string
  // - referenceImageUrl?: string
  
  // Flow:
  // 1. Auth check
  // 2. Credit check (1/2/4 based on resolution)
  // 3. Fetch brand kit if provided
  // 4. Build prompt (inject brand info)
  // 5. Call AI API
  // 6. Upload result to Storage
  // 7. Deduct credits
  // 8. Save generation
  // 9. Return image URL
  ```

- [ ] **2.5** Creator System Prompt في `lib/ai/prompts/creator.ts`
- [ ] **2.6** Creator i18n strings في `messages/ar.json`

**Acceptance Criteria:**
- User يكتب prompt → يضغط generate → يشوف الصورة
- Brand kit يُضاف تلقائياً للـ prompt
- Credits تنقص بعد التوليد
- صورة تُحفظ في Assets
- Error state واضح لو فشل

---

## 3. Studio: Photoshoot 📸

- [ ] **3.1** Create `app/(dashboard)/photoshoot/page.tsx`
- [ ] **3.2** Create `components/studios/photoshoot/PhotoshootForm.tsx`:
  - Product image upload (إلزامي)
  - Environment selector (visual cards):
    - White Studio (خلفية بيضاء)
    - Lifestyle (بيئة حياتية)
    - Nature (طبيعة)
    - Urban (مدني)
    - Luxury (فاخر)
    - Festive (احتفالي)
  - Number of shots: 1 / 3 / 6
  - Additional notes textarea
  - CreditCost badge

- [ ] **3.3** Create `components/studios/photoshoot/PhotoshootPreview.tsx`:
  - Grid display للـ shots
  - Individual download
  - "Select All" + batch download

- [ ] **3.4** Create `app/api/studios/photoshoot/route.ts`:
  ```typescript
  // Input: productImageUrl, environment, shotCount, notes
  // Credits: 8 for 6 shots, 4 for 3 shots, 2 for 1
  // For each shot: different angle/lighting/composition
  // Parallel generation (Promise.all)
  ```

- [ ] **3.5** Photoshoot System Prompts في `lib/ai/prompts/photoshoot.ts`

**Acceptance Criteria:**
- رفع صورة المنتج يشتغل
- 6 shots مختلفة تُولّد بزوايا مختلفة
- Credits = 8 للـ 6 shots
- كل صورة قابلة للتحميل منفردة

---

## 4. Studio: Campaign Planner 📋

- [ ] **4.1** Create `app/(dashboard)/campaign/page.tsx`
- [ ] **4.2** Create `components/studios/campaign/CampaignForm.tsx`:
  - Product/Service description textarea
  - Target audience input
  - Dialect selector:
    - 🇸🇦 سعودية
    - 🇦🇪 إماراتية
    - 🇪🇬 مصرية
    - 🌙 خليجية عامة
    - 📖 فصحى
  - Platform selector (multi-select):
    - Instagram
    - TikTok
    - LinkedIn
    - Twitter/X
    - Facebook
  - Occasion (اختياري): dropdown مع custom input
  - Product image (اختياري)
  - CreditCost badge (12 credits)

- [ ] **4.3** Create `components/studios/campaign/CampaignPlanDisplay.tsx`:
  - 9 post cards في grid
  - كل card: رقم اليوم، الـ scenario، الكابشن، الـ hook، الهاشتاقات
  - "Generate Images" button لكل post (يفتح Creator)
  - "Copy All" للكابشنز
  - "Export as PDF" للخطة كاملة

- [ ] **4.4** Create `app/api/studios/campaign/route.ts`:
  ```typescript
  // Input: description, targetMarket, dialect, platform, occasion
  // Credits: 12
  // AI: gemini-2.5-pro (text generation)
  // Output: JSON array of 9 posts
  // Validate JSON output before returning
  ```

- [ ] **4.5** Campaign System Prompt في `lib/ai/prompts/campaign.ts`
- [ ] **4.6** JSON validation للـ campaign output (Zod schema)
- [ ] **4.7** "Generate All Images" button — batch generates images لكل الـ 9 scenarios

**Acceptance Criteria:**
- الحملة تُولّد 9 posts كاملة بـ JSON صحيح
- كل post يعرض: scenario + caption + hook + hashtags
- يمكن نسخ أي caption بضغطة
- "Generate Image" لكل post ينقل للـ Creator Studio
- Credits = 12 تُخصم مرة واحدة

---

## 5. Assets Gallery

- [ ] **5.1** Create `app/(dashboard)/assets/page.tsx`:
  - Grid view للكل الـ generated assets
  - Filter by studio
  - Filter by date range
  - Search by prompt
  - Select multiple + batch download/delete

- [ ] **5.2** Create `components/shared/AssetCard.tsx`:
  - Thumbnail
  - Studio badge
  - Date
  - Credits used
  - Download / Delete actions

- [ ] **5.3** Create `app/api/assets/route.ts` (GET with filters)
- [ ] **5.4** Create `app/api/assets/[id]/route.ts` (GET + DELETE)
- [ ] **5.5** Create `app/api/assets/export/route.ts` — ZIP batch export

**Acceptance Criteria:**
- كل generated image تظهر في Assets
- Filter يشتغل
- Download فردي + batch ZIP
- Delete asset يحذف من Storage أيضاً
