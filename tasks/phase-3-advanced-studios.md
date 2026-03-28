# Phase 3: Advanced Studios — Tasks

> **Goal:** باقي الاستوديوهات (Plan + Storyboard + Analysis + Voice + Edit + Prompt)
> **Duration:** ~2 weeks
> **Demo:** Full marketing analysis + storyboard export

---

## Prerequisites
- [ ] Phase 2 مكتمل 100%
- [ ] AI infrastructure شغّال

---

## 1. Studio: Marketing Plan 🗺️

- [ ] **1.1** Create `app/(dashboard)/plan/page.tsx`
- [ ] **1.2** Create `components/studios/plan/PlanForm.tsx`:
  - Business name + description
  - Industry selector (dropdown: Restaurant, Clinic, Retail, SaaS, Real Estate, Other)
  - Current stage: Startup / Growth / Scale
  - Target market
  - Monthly budget range slider
  - Duration: 30 / 60 / 90 days
  - Goals (multi-select): Brand Awareness, Lead Generation, Sales, Retention
  - CreditCost badge (5 credits)

- [ ] **1.3** Create `components/studios/plan/PlanDisplay.tsx`:
  - Sections: Objectives / Channels / Content Calendar / Budget / KPIs
  - Collapsible sections
  - Visual calendar للـ content
  - "Export as PDF" button

- [ ] **1.4** Create `app/api/studios/plan/route.ts`
- [ ] **1.5** Plan System Prompt في `lib/ai/prompts/plan.ts`
- [ ] **1.6** PDF export لـ Plan (use `@react-pdf/renderer` أو puppeteer)

**Acceptance Criteria:**
- خطة 30 يوم تُولّد في < 30 ثانية
- PDF يحتوي تقويم المحتوى + الميزانية + الـ KPIs
- Credits = 5

---

## 2. Studio: Storyboard 🎬

- [ ] **2.1** Create `app/(dashboard)/storyboard/page.tsx`
- [ ] **2.2** Create `components/studios/storyboard/StoryboardForm.tsx`:
  - Video concept description
  - Duration selector: 15s / 30s / 60s
  - Style selector:
    - Cinematic (سينمائي)
    - UGC (مستخدم حقيقي)
    - Animation (رسوم)
    - Documentary (وثائقي)
  - Target platform: Instagram Reel / TikTok / YouTube / TV
  - Brand Kit toggle
  - CreditCost badge (14 credits)

- [ ] **2.3** Create `components/studios/storyboard/StoryboardDisplay.tsx`:
  - 9 scene cards في grid
  - كل scene:
    - Scene number
    - Thumbnail placeholder (قابل للتوليد)
    - Visual description
    - Dialogue/VO text
    - Camera angle + movement
    - Duration (seconds)
  - "Generate Images for All Scenes" (يستخدم Creator)
  - "Export as PDF" (storyboard format)

- [ ] **2.4** Create `app/api/studios/storyboard/route.ts`
- [ ] **2.5** Storyboard System Prompt في `lib/ai/prompts/storyboard.ts`

**System Prompt:**
```typescript
export const STORYBOARD_PROMPT = `
Act as a professional film director and storyboard artist.
Video concept: {concept}
Duration: {duration} seconds
Style: {style}
Platform: {platform}
Brand: {brand_name}

Create a professional storyboard with exactly 9 scenes. Each scene must include:
1. scene_number: integer
2. visual_description: Detailed description in English (for image generation)
3. dialogue: Spoken text or VO in Arabic (dialect: {dialect})
4. camera_angle: (Wide Shot, Medium Shot, Close Up, POV, etc.)
5. camera_movement: (Static, Pan, Zoom In, Dolly, etc.)
6. duration_seconds: number
7. mood: (Energetic, Calm, Dramatic, Humorous)
8. music_note: Suggested music style/tempo

Total duration must equal {duration} seconds.
Return as valid JSON array.
`;
```

**Acceptance Criteria:**
- 9 scenes مع تفاصيل كاملة
- PDF storyboard يبان احترافي
- كل scene يمكن generate صورة له
- Credits = 14

---

## 3. Studio: Marketing Analysis 📊

- [ ] **3.1** Create `app/(dashboard)/analysis/page.tsx`
- [ ] **3.2** Create `components/studios/analysis/AnalysisForm.tsx`:
  - Business name + website (اختياري)
  - Industry + description
  - Main competitors (3 inputs)
  - Target market
  - Current pain points
  - CreditCost badge (3 credits)

- [ ] **3.3** Create `components/studios/analysis/AnalysisDisplay.tsx`:
  - Tabbed sections:
    - SWOT Analysis (visual grid: 4 quadrants)
    - Buyer Personas (3 cards)
    - Competitor Analysis (comparison table)
    - USP & Positioning
    - GTM Strategy
    - Pricing Recommendations
    - 30-60-90 Day Roadmap (timeline view)
    - KPI Dashboard (metric cards)
  - "Export Full Report as PDF"

- [ ] **3.4** Create `app/api/studios/analysis/route.ts`
- [ ] **3.5** Analysis System Prompt في `lib/ai/prompts/analysis.ts`
- [ ] **3.6** SWOT visual component (4 colored quadrants)
- [ ] **3.7** Competitor comparison table component
- [ ] **3.8** Roadmap timeline component

**Acceptance Criteria:**
- تحليل كامل بـ 8 sections
- SWOT يعرض visual 4-quadrant grid
- PDF report يحمل كل الـ sections
- Credits = 3

---

## 4. Studio: Voice Over 🎙️

- [ ] **4.1** Create `app/(dashboard)/voiceover/page.tsx`
- [ ] **4.2** Create `components/studios/voiceover/VoiceOverForm.tsx`:
  - Script textarea (max 500 chars)
  - Character counter
  - Voice selection:
    - Male Professional (Arabic)
    - Female Professional (Arabic)
    - Male Youth
    - Female Youth
    - Male Formal (Newscaster)
  - Dialect: Saudi / Emirati / Egyptian / Khaleeji / Fusha
  - Speed: Slow (0.75x) / Normal (1x) / Fast (1.25x)
  - Tone: Professional / Friendly / Energetic / Calm
  - CreditCost badge (1 credit per 30s)

- [ ] **4.3** Create `components/studios/voiceover/VoiceOverPreview.tsx`:
  - Audio player (waveform visualization)
  - Play/Pause/Seek
  - Duration display
  - Download MP3 button

- [ ] **4.4** Create `app/api/studios/voiceover/route.ts`
  - Use Google Cloud TTS أو ElevenLabs API
  - Store MP3 in Supabase Storage

**Acceptance Criteria:**
- Voice over تُولّد وتشتغل في المتصفح
- Download MP3 يشتغل
- Credit = 1 per 30 seconds (rounded up)

---

## 5. Studio: Edit ✏️

- [ ] **5.1** Create `app/(dashboard)/edit/page.tsx`
- [ ] **5.2** Create `components/studios/edit/EditForm.tsx`:
  - Original image upload (أو اختيار من Assets)
  - Edit description textarea
  - Edit type:
    - Background Replace (تغيير الخلفية)
    - Object Remove (إزالة عنصر)
    - Color Change (تغيير اللون)
    - Text Add (إضافة نص)
    - Style Transfer (تغيير الأسلوب)
  - Mask painting tool (اختياري — brush tool)
  - CreditCost badge (1 credit)

- [ ] **5.3** Create `components/studios/edit/EditPreview.tsx`:
  - Side-by-side: Before / After
  - Slider comparison
  - Download result

- [ ] **5.4** Create `app/api/studios/edit/route.ts`
  - Use GPT-4o vision + DALL-E 3 inpainting أو Gemini

**Acceptance Criteria:**
- Edit يشتغل للـ background replacement على الأقل
- Before/After comparison واضح
- Credits = 1

---

## 6. Studio: Prompt Builder 💡

- [ ] **6.1** Create `app/(dashboard)/prompt-builder/page.tsx`
- [ ] **6.2** Create `components/studios/prompt-builder/PromptBuilderForm.tsx`:
  - Simple Arabic description input
  - Desired output type: Image / Video / Copy / Campaign
  - Style preferences
  - "Build Prompt" button (FREE — 0 credits)

- [ ] **6.3** Create `components/studios/prompt-builder/PromptResult.tsx`:
  - Generated English prompt
  - Copy button
  - "Use in Creator" / "Use in Campaign" shortcuts
  - Prompt variations (3 alternatives)

- [ ] **6.4** Create `app/api/studios/prompt-builder/route.ts`
  - Free endpoint (no credit check)
  - Use gemini-flash (cheapest)

**Acceptance Criteria:**
- Prompt Builder مجاني 100% (0 credits)
- Output = 3 prompt variations
- Copy to clipboard يشتغل
- Shortcut ينقل للـ Studio المناسب

---

## 7. Projects System

- [ ] **7.1** Create `app/(dashboard)/projects/page.tsx`:
  - Grid view للـ projects
  - Create new project
  - Each project: name, brand kit, generation count

- [ ] **7.2** Create `components/projects/ProjectCard.tsx`
- [ ] **7.3** Projects migration في Supabase
- [ ] **7.4** Link generations to projects (optional في الـ studios)
- [ ] **7.5** Create `app/api/projects/route.ts`

**Acceptance Criteria:**
- يمكن إنشاء projects وتنظيم الـ generations فيها
