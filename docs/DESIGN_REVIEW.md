# 🎨 DESIGN_REVIEW.md — مراجعة تصميم الواجهة الشاملة

> مراجعة آلية شاملة عبر 8 أبعاد (36 وكيل مراجعة + تحقق مزدوج لكل ملاحظة حرجة/عالية).
> كل ملاحظة تشير لملف وسطر حقيقي مع الحل المقترح.

**النتيجة:** 115 ملاحظة مؤكدة — 🔴 4 حرجة · 🟠 23 عالية · 🟡 57 متوسطة · 🔵 31 منخفضة

| البُعد | عدد الملاحظات |
|--------|:---:|
| وصولية/i18n/براند | 21 |
| صفحة الهبوط | 18 |
| الاستوديوهات | 16 |
| هيكل الداشبورد | 16 |
| RTL | 13 |
| نظام التصميم | 11 |
| الموبايل | 11 |
| الوضع الداكن | 9 |

**حالة التنفيذ:** ⬜ لم يبدأ

---

## 🔴 حرجة — لازم تتصلح فوراً (4)

### 1. VoiceOver studio exposes provider names (ElevenLabs / OpenAI TTS) in the UI, violating Pyra AI branding

- **الملف:** `app/[locale]/(dashboard)/voiceover/page.tsx:129`
- **البُعد:** الاستوديوهات
- **المشكلة:** Three places show raw provider names to users: line 129 renders an 'ElevenLabs' badge on each premium voice in the voice list, line 211 renders a badge with '🌟 ElevenLabs' or 'OpenAI TTS' in the info-badge row, and line 238 renders '🌟 ElevenLabs' / 'OpenAI' next to the generated audio. CLAUDE.md rule #1 is explicit: never show model/provider names in the UI — users interact with 'بايرا' only. Every other studio hides models behind 'سرعة/جودة/إبداع' (ModelSelector), so voiceover is the one studio leaking the tech stack.
- **الحل:** Replace provider badges with Pyra-branded tier labels: e.g. '🌟 صوت بريميوم' for ElevenLabs voices and 'صوت قياسي' (or nothing) for OpenAI ones, in all three locations (lines 129, 211, 238). Keep the provider string internal only.
- **الحالة:** ⬜

### 2. Static Tailwind surface palette diverges from CSS variables — white cards/dialogs/menus in dark mode

- **الملف:** `tailwind.config.ts:32`
- **البُعد:** نظام التصميم
- **المشكلة:** The design system has two parallel color vocabularies that disagree in dark mode. globals.css flips --color-surface/--color-surface-2/--color-bg under .dark (lines 34-46), but tailwind.config.ts defines `surface: { DEFAULT: '#FFFFFF', 2: '#F1F5F9', dark: ..., 'dark-2': ... }` as static hex. Every `bg-surface` / `bg-surface-2` class therefore stays LIGHT in dark mode. Grep confirms zero `dark:bg-surface-dark` usages in the entire repo, while `bg-surface(-2)` is used in components/ui/card.tsx:8, dialog.tsx:37, dropdown-menu.tsx:22 and 38, avatar.tsx:37, progress.tsx:13, skeleton.tsx:9, button.tsx (outline/secondary/ghost hover), plus ~54 more usages in app pages and shared components. In dark mode a Card renders `bg-surface` = #FFFFFF with `text-[var(--color-text-primary)]` = #F8FAFC — near-white text on a white card, i.e. unreadable — and dropdowns/dialogs appear as blinding white panels on the dark #0F172A background. Meanwhile some components use the other vocabulary for the same color (`bg-[var(--color-surface-2)]` in ModelComparison.tsx:63,76; `bg-[var(--color-surface)]` in StudioLoading.tsx), which DOES adapt — so sibling components disagree. The same trap exists for `primary-50/100`: globals.css redefines --color-primary-50/100 in .dark, but the Tailwind classes `bg-primary-50` etc. are static.
- **الحل:** Point the Tailwind palette at the CSS variables so both vocabularies are one system: in tailwind.config.ts set `surface: { DEFAULT: 'var(--color-surface)', 2: 'var(--color-surface-2)' }`, `background: 'var(--color-bg)'`, and delete the now-dead `surface.dark` / `surface['dark-2']` / `background.dark` aliases (unused). Optionally do the same for primary-50/100 or remove the .dark overrides of --color-primary-50/100 in globals.css. This single config change fixes dark mode for all ~60 usages without touching call sites.
- **الحالة:** ⬜

### 3. surface/background Tailwind tokens are static light hex — every bg-surface / bg-surface-2 stays white in dark mode

- **الملف:** `tailwind.config.ts:32`
- **البُعد:** الوضع الداكن
- **المشكلة:** globals.css defines theme-aware CSS variables (--color-surface flips #FFFFFF → #1E293B in .dark), but tailwind.config.ts maps the utility tokens to static hex: surface.DEFAULT = '#FFFFFF', surface.2 = '#F1F5F9', background.DEFAULT = '#F8FAFC' (lines 32-40). So the 60+ usages of `bg-surface` / `bg-surface-2` never change in dark mode while text colors (set via CSS vars) DO flip to near-white. Result in dark mode: components/layout/TopBar.tsx:50 (header stays white), components/layout/Sidebar.tsx:200,208 (sidebar white), components/layout/StudioLayout.tsx:22,27,34 (both studio panels white), components/ui/card.tsx:8 (every dashboard Card is white with text-[var(--color-text-primary)] = #F8FAFC → white-on-white, unreadable), components/ui/dialog.tsx:37 (DialogContent white), components/ui/dropdown-menu.tsx:22 (dropdown white with near-white text), components/ui/skeleton.tsx:9 / avatar.tsx:37 / progress.tsx:13 (bright light-gray blocks), plus dashboard pages (voiceover/plan/analysis/assets tab chips with bg-surface-2). Dark mode is effectively broken across the entire authenticated app.
- **الحل:** In tailwind.config.ts map the tokens to the CSS variables instead of hex: surface: { DEFAULT: 'var(--color-surface)', 2: 'var(--color-surface-2)' }, background: { DEFAULT: 'var(--color-bg)' } (and delete the now-redundant surface.dark / background.dark keys). This single change fixes all bg-surface/bg-surface-2/bg-background call sites at once because the variables already flip in .dark.
- **الحالة:** ⬜

### 4. User-visible 'ElevenLabs' / 'OpenAI TTS' / 'OpenAI' provider badges in VoiceOver studio

- **الملف:** `app/[locale]/(dashboard)/voiceover/page.tsx:211`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** Direct violation of the core Pyra AI brand mandate (CLAUDE.md: never show model/provider names to users). Line 129 renders an 'ElevenLabs' Badge next to each premium voice, line 211 renders '🌟 ElevenLabs' / 'OpenAI TTS' as the plan-info badge, and line 238 renders 'ElevenLabs'/'OpenAI' next to the generated audio. Every VoiceOver user sees the underlying vendors.
- **الحل:** Replace provider names with Pyra-branded tier labels, e.g. isEL → 'صوت بايرا برو 🌟' / 'Pyra Pro', config.provider badge → 'بايرا صوت HD' vs 'بايرا صوت', result badge → 'بصوت بايرا 🦊'. Add keys under voiceover.* in messages/ar.json + en.json; keep provider ids in code only.
- **الحالة:** ⬜

---

## 🟠 عالية — تأثير واضح على المستخدم (23)

### 5. Entire landing page is hardcoded Arabic — /en locale renders Arabic copy in an LTR document

- **الملف:** `app/[locale]/page.tsx:14`
- **البُعد:** صفحة الهبوط
- **المشكلة:** None of the 12 landing components use next-intl (useTranslations); every string is hardcoded Arabic (e.g. HeroSection TYPEWRITER_WORDS, FAQS, pillars). The root layout sets dir='ltr' for locale 'en' (app/[locale]/layout.tsx:53), so an English visitor on /en gets Arabic marketing copy laid out left-to-right: logical `start/end` positioning flips (hero floating cards move to the left), `rtl:rotate-180` on CTA arrows no longer applies so arrows point the wrong way, and punctuation/em-dashes break. Worse, FaqSection.tsx:44-46 explicitly promises 'الواجهة متوفرة بالعربي والإنجليزي' — a claim the landing page itself contradicts.
- **الحل:** Move all landing strings into a `landing` namespace in messages/ar.json and messages/en.json and consume via useTranslations/getTranslations in each component. Until English copy exists, redirect /en landing to /ar or hide the en locale from the landing entry points so users never see the mixed-direction page.
- **الحالة:** ⬜

### 6. 'Try it yourself' demo is fake: ignores input, fake 2s spinner, returns placehold.co placeholder images

- **الملف:** `components/landing/InteractiveDemo.tsx:22`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The section headline says 'جرّب بنفسك — بدون تسجيل' (try it yourself, no signup), but handleGenerate ignores whatever the user typed, shows a 2-second fake Loader2 spinner, then displays a random placehold.co image containing English placeholder text ('PyraSuite Demo', 'Coffee Brand', 'Real Estate'). A prospect who types their own prompt and receives a flat-color placeholder that has nothing to do with their input will conclude the product is vaporware — this actively damages trust at the most persuasive moment of the page. It also depends on an external host (placehold.co), so the 'result' can fail to load entirely.
- **الحل:** Either wire the demo to a rate-limited public demo endpoint, or convert it to an honest curated gallery: pre-rendered real Pyra AI outputs bundled locally, with clickable example prompt chips and a label like 'أمثلة حقيقية من بايرا'. Remove the fake spinner and the free-text input if it does not drive real generation.
- **الحالة:** ⬜

### 7. Fabricated testimonials with full realistic names, job titles, and uniform 5-star ratings

- **الملف:** `components/landing/SocialProof.tsx:8`
- **البُعد:** صفحة الهبوط
- **المشكلة:** TESTIMONIALS hardcodes three invented people ('سارة المهندي — مديرة تسويق', 'خالد الحربي — صاحب وكالة تسويق', 'نورة العتيبي — فريلانسر') with 5/5 stars each, presented as genuine customer quotes. Fake named testimonials are a legal/reputational liability in several GCC markets and, once noticed (identical star counts, no avatars, no company names), undermine the page's core promise of 'أسعار شفافة — بدون مفاجآت'.
- **الحل:** Replace with real customer quotes (with permission) as they arrive. Until then, swap this block for verifiable proof that needs no fabrication: number of generations produced, studio output samples, or the existing infrastructure trust paragraph. If placeholder cards must remain during development, gate them behind an env flag so they cannot ship.
- **الحالة:** ⬜

### 8. VoiceOver studio card advertises '1/30s' but the real price is 1 credit/15s (Free/Starter) or 3 credits/20s (Pro+)

- **الملف:** `components/landing/StudiosShowcase.tsx:72`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The التعليق الصوتي card shows credits '1/30s'. lib/credits/voiceover-costs.ts charges 1 credit per 15 seconds on Free/Starter (OpenAI) and 3 credits per 20 seconds on Pro+ (ElevenLabs) — i.e. the landing page understates the actual cost by 2x to 4.5x. On a page whose pricing headline is 'أسعار شفافة — بدون مفاجآت', a user who budgets from this card will feel deceived at their first voiceover generation.
- **الحل:** Change the badge to reflect reality, e.g. 'من 1 كريدت / 15 ثانية', or derive it from getVoiceoverConfig so landing and billing can never drift. (The other 8 cards were verified correct against CREDIT_COSTS and SHOT_COSTS.)
- **الحالة:** ⬜

### 9. Language switcher is a no-op in English locale (broken locale detection)

- **الملف:** `components/layout/TopBar.tsx:42`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** `const currentLocale = pathname.startsWith('/en') ? 'en' : 'ar'` uses `usePathname` from '@/i18n/routing', which is next-intl's createNavigation hook and always returns the pathname WITHOUT the locale prefix (e.g. '/dashboard', never '/en/dashboard'). So currentLocale is always 'ar' and switchLocale is always 'en'. From the Arabic UI the globe button works, but from the English UI clicking it calls router.replace(pathname, { locale: 'en' }) — a no-op. English users cannot switch back to Arabic from the TopBar. The identical bug exists in app/[locale]/(dashboard)/settings/page.tsx:53, where it makes the 'العربية' button appear permanently selected even when the UI is in English.
- **الحل:** Use `const currentLocale = useLocale()` from 'next-intl' instead of parsing the pathname, in both TopBar.tsx and settings/page.tsx.
- **الحالة:** ⬜

### 10. Streak badge is hardcoded to "0" — permanent dead widget

- **الملف:** `components/layout/TopBar.tsx:74`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** The streak badge renders a literal `🔥 <span>0</span>` with no data source. Every user sees "🔥 0" forever, regardless of daily activity, even though lib/gamification exists. A gamification widget that never moves reads as broken and actively demotivates; it also has no tooltip/label explaining what the number means.
- **الحل:** Wire the badge to the real streak value (fetch from profile/gamification endpoint and store it alongside credits), add an aria-label/tooltip ('سلسلة أيامك النشطة'), and hide the badge entirely (or show an encouraging empty state) while the value is 0 or loading.
- **الحالة:** ⬜

### 11. Onboarding CTA on steps 2–4 abandons the flow and never marks completion

- **الملف:** `app/[locale]/(dashboard)/onboarding/page.tsx:80`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** In handleNext, when the current step has an `action` (brand-kit, creator, billing), the code does `router.push(currentStep.action); return;` — it never advances `step`, never persists progress, and the completion POST to /api/user/onboarding only fires if the user reaches step 5 and clicks. So a user who follows the primary CTA ('أنشئ هويتك البصرية') leaves onboarding at step 2/5; returning to /onboarding restarts at step 1, and onboarding is never recorded complete (risking repeated onboarding prompts/redirects). The only ways to 'finish' are Skip or clicking Next-without-acting through all 5 steps — the opposite of what the CTAs encourage.
- **الحل:** Mark the onboarding step/completion before navigating away (fire the API call and/or persist current step in localStorage so returning resumes), or keep users in the flow: make the primary button advance the step and render the action as a secondary link that opens the studio in the same tab after saving progress.
- **الحالة:** ⬜

### 12. Raw API error codes shown verbatim to users in every studio

- **الملف:** `app/[locale]/(dashboard)/creator/page.tsx:52`
- **البُعد:** الاستوديوهات
- **المشكلة:** All studios do setError(data.error) and render it directly: creator page.tsx:52, plan page.tsx:56, storyboard page.tsx:51, analysis page.tsx:58, edit page.tsx:46, photoshoot page.tsx:43, and voiceover page.tsx:86 (which maps only 3 codes and falls back to the raw string). The API routes return machine codes — 'insufficient_credits', 'rate_limited', 'generation_failed', 'prompt_blocked', 'validation_error', 'unauthorized' (see app/api/studios/*/route.ts) — so an Arabic-speaking user who runs out of credits literally sees the English string 'insufficient_credits' in the preview panel. The catch branches also show hardcoded English 'Network error'. There are no error-message keys in messages/ar.json to map these. Additionally, 'insufficient_credits' shows no top-up CTA even though UpgradePrompt/LowCreditsBanner components exist.
- **الحل:** Add a studio.errors namespace to messages/ar.json and en.json (insufficient_credits, rate_limited, generation_failed, prompt_blocked, validation_error, network, unauthorized, fallback) and a small mapApiError(code, t) helper used by all 9 pages instead of setError(data.error). For insufficient_credits, render the existing UpgradePrompt with a link to /billing.
- **الحالة:** ⬜

### 13. Studio panels use static light-color Tailwind classes (bg-surface / bg-surface-2) that do not change in dark mode

- **الملف:** `components/layout/StudioLayout.tsx:22`
- **البُعد:** الاستوديوهات
- **المشكلة:** StudioLayout wraps every studio's input and preview panels in bg-surface (lines 22, 27, 34). In tailwind.config.ts, surface.DEFAULT is the fixed hex #FFFFFF and surface.2 is #F1F5F9 — these classes are NOT the CSS variables that flip in .dark (globals.css lines 39-40). With darkMode:'class' and next-themes, the body/text switch to dark values while all 9 studio panels stay pure white, and body text becomes near-white #F8FAFC — unreadable white-on-white content in dark mode. The same static bg-surface-2 is used for chips/tabs in plan (line 69), analysis (line 118), voiceover (lines 152, 200, 241), storyboard scene thumbnails (line 98), and empty tiles in PhotoshootPreview (line 109). CLAUDE.md explicitly mandates CSS variables (bg-[var(--color-surface)]) instead of hardcoded colors.
- **الحل:** In StudioLayout change bg-surface to bg-[var(--color-surface)] and audit all studio files replacing bg-surface / bg-surface-2 utilities with the corresponding bg-[var(--color-surface)] / bg-[var(--color-surface-2)] variables (or map the Tailwind surface colors to the CSS variables in tailwind.config.ts so the utilities become theme-aware everywhere at once).
- **الحالة:** ⬜

### 14. Cross-studio prompt handoff links (?prompt=) are dead — Creator/Campaign never read the query param

- **الملف:** `components/studios/campaign/CampaignPlanDisplay.tsx:112`
- **البُعد:** الاستوديوهات
- **المشكلة:** CampaignPlanDisplay line 112 links to `/creator?prompt=${scenario}` ('توليد صورة' CTA on image-less posts), and prompt-builder/page.tsx line 113 links generated prompts to /creator or /campaign with ?prompt=. But neither CreatorForm.tsx nor CampaignForm.tsx (nor their pages) call useSearchParams — grep confirms zero searchParams usage in the creator page or any components/studios file. The user clicks 'use this prompt', lands on the studio, and the textarea is empty; the flagship cross-studio flow silently does nothing.
- **الحل:** In CreatorForm (and CampaignForm), read the prompt param on mount: const sp = useSearchParams(); useEffect(() => { const p = sp.get('prompt'); if (p) setPrompt(p); }, []) — and prefill the textarea.
- **الحالة:** ⬜

### 15. Prompt Builder has no loading state in the preview panel and no error display at all

- **الملف:** `app/[locale]/(dashboard)/prompt-builder/page.tsx:94`
- **البُعد:** الاستوديوهات
- **المشكلة:** previewPanel (line 94) only branches on results.length — while generating, the user keeps staring at the empty state ('البرومبتات ستظهر هنا') with no skeleton/progress, unlike every other studio. Worse, failures are fully silent: the catch block at line 42 swallows exceptions, and when data.success is false (rate_limited, generation_failed from the API) nothing happens — no error state variable even exists in this page. The user clicks Build Prompt, the button un-disables, and nothing visibly changed.
- **الحل:** Add isLoading and error branches to previewPanel matching the other studios (Skeleton cards while loading, AlertTriangle + translated message on error), and add setError handling for !data.success and the catch block.
- **الحالة:** ⬜

### 16. Google Fonts @import placed after @tailwind directives — Cairo/Tajawal/Inter likely never load

- **الملف:** `app/globals.css:5`
- **البُعد:** نظام التصميم
- **المشكلة:** The `@import url('https://fonts.googleapis.com/...')` sits on line 5, after `@tailwind base/components/utilities` (lines 1-3). Tailwind's PostCSS plugin expands those directives into real CSS rules ABOVE the @import in the compiled stylesheet, and per the CSS spec browsers ignore any @import that appears after other rules (PostCSS even emits a build warning for this). The project has no next/font usage in app/[locale]/layout.tsx either, so the entire typography system — Cairo for Arabic headings, Tajawal for Arabic body, Inter for English (globals.css lines 48-61 and tailwind fontFamily) — silently falls back to generic sans-serif. Even where it happens to load, a render-blocking cross-origin @import causes FOUT with no font-display control.
- **الحل:** Remove the @import and load the three fonts via next/font/google in app/[locale]/layout.tsx (Cairo, Tajawal, Inter with subsets: ['arabic','latin'], display: 'swap'), exposing them as CSS variables consumed by the existing [lang='ar']/[lang='en'] rules and tailwind fontFamily config. Minimal alternative: move the @import to line 1, above the @tailwind directives.
- **الحالة:** ⬜

### 17. Hero CTA arrow points backwards in both locales (double-flip: ArrowLeft + rtl:rotate-180)

- **الملف:** `components/landing/HeroSection.tsx:136`
- **البُعد:** RTL
- **المشكلة:** The primary signup CTA 'ابدأ مجاناً — 25 كريدت هدية' uses <ArrowLeft className="rtl:rotate-180"/>. ArrowLeft already points left (the correct 'forward' direction in Arabic), but rtl:rotate-180 flips it again, so in the default Arabic RTL locale the arrow renders pointing RIGHT — i.e. 'back' against the reading direction, into the button text. In the English locale it renders pointing LEFT ('back' in LTR). The arrow is wrong in BOTH directions on the highest-visibility button of the landing page.
- **الحل:** Change the icon to ArrowRight and keep the flip: <ArrowRight className="h-4 w-4 rtl:rotate-180" />. This yields → in English and ← in Arabic. Apply the same convention used correctly in components/layout/Sidebar.tsx:140 (LTR-correct icon + rtl:rotate-180).
- **الحالة:** ⬜

### 18. Progress bar fills left-to-right in RTL (physical translateX on Radix Indicator)

- **الملف:** `components/ui/progress.tsx:18`
- **البُعد:** RTL
- **المشكلة:** The Indicator uses style={{ transform: `translateX(-${100 - value}%)` }}, which always reveals the LEFT portion of the track. In the Arabic RTL UI, progress bars should fill from the right. This affects every progress bar in the product: sidebar credits balance (components/layout/Sidebar.tsx:174), CreditsWidget.tsx:49, billing page credit usage (billing/page.tsx:128), onboarding stepper (onboarding/page.tsx:109), ProfileCompletion.tsx:33 and WeeklyChallenge.tsx:39 — all animate/fill in the wrong direction for Arabic users.
- **الحل:** Replace the transform with a direction-agnostic width: <ProgressPrimitive.Indicator className="h-full bg-primary-500 transition-all" style={{ width: `${value || 0}%` }} /> — a block with a set width auto-anchors to the inline-start edge in both directions. Alternatively negate the translateX sign under [dir='rtl'] (e.g. rtl:translate-x-[+…]) and pass dir to ProgressPrimitive.Root.
- **الحالة:** ⬜

### 19. Button secondary/ghost/outline variants use static text-primary-900 — unreadable dark-indigo text in dark mode

- **الملف:** `components/ui/button.tsx:14`
- **البُعد:** الوضع الداكن
- **المشكلة:** Lines 13-15: outline = 'hover:bg-surface-2 hover:text-primary-900', secondary = 'bg-surface-2 text-primary-900', ghost = 'hover:bg-surface-2 hover:text-primary-900'. text-primary-900 is static #312E81 (dark indigo). In dark mode, even after the surface tokens are fixed (surface-2 dark = #334155), #312E81 text on #334155 is near-invisible (~1.1:1 contrast). Today, combined with the static white surface-2, secondary buttons render as bright light-gray buttons inside the dark UI. Same defect in components/ui/dropdown-menu.tsx:38 — 'focus:bg-surface-2 focus:text-primary-900' makes hovered dropdown items dark-indigo-on-dark. Every secondary/ghost button and dropdown item across the dashboard is affected.
- **الحل:** Replace text-primary-900 with the theme-aware token: 'text-[var(--color-text-primary)]' (or add a dark variant: 'text-primary-900 dark:text-primary-100') in button.tsx variants and dropdown-menu.tsx:38, so hover/focus text adapts to the dark surface.
- **الحالة:** ⬜

### 20. Admin page titles use text-slate-900 on the slate-950 admin shell — headings are invisible

- **الملف:** `app/admin/settings/page.tsx:126`
- **البُعد:** الوضع الداكن
- **المشكلة:** app/admin/layout.tsx:16 sets body to bg-slate-950 text-slate-100, and components/admin/AdminLayout.tsx:37 wraps content in a slate-950→slate-900 gradient. But 8 admin pages render their <h1> directly on that dark background with text-slate-900 (#0f172a on ~#020617 ≈ invisible): settings/page.tsx:126, models/page.tsx:136, studios/page.tsx:100, prompts/page.tsx:77, users/page.tsx:164, transactions/page.tsx:190, logs/page.tsx:199, generations/page.tsx:184. Admins see pages with no visible title.
- **الحل:** Change these h1 classes from text-slate-900 to text-white (or text-slate-100) to match the dark admin shell — e.g. className="text-2xl font-bold text-white" on all 8 pages.
- **الحالة:** ⬜

### 21. Studio shell fixed height clips generate button behind mobile BottomNav (pattern in all 9 studios)

- **الملف:** `app/[locale]/(dashboard)/creator/page.tsx:97`
- **البُعد:** الموبايل
- **المشكلة:** Every studio page wraps its content in `<div className="h-[calc(100vh-3.5rem)]">` (creator:97, photoshoot:60, campaign:63, plan:115, storyboard:120, analysis:130, voiceover:268, edit:105, prompt-builder:129). This height only subtracts the 3.5rem TopBar. Two problems: (1) the wrapper is NOT a flex column, and it contains a page header (`px-6 py-4 border-b`, ~65px) plus StudioLayout which uses `h-full` = 100% of the wrapper — so StudioLayout overflows the wrapper by the header height and the bottom of the panels/history strip is pushed below the fold on every breakpoint. (2) On mobile the fixed BottomNav (h-14, layout.tsx adds pb-14 to <main> but that padding sits BELOW this fixed-height div) is not subtracted, so the last ~56px of the studio — typically the Generate button and history strip — is hidden under the bottom nav. (3) `100vh` on iOS Safari includes the collapsed URL bar, clipping another ~60px.
- **الحل:** Change wrapper to `flex flex-col h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-3.5rem)]` (subtracting BottomNav below lg) and give StudioLayout `flex-1 min-h-0` instead of `h-full`; use `dvh` units. Apply to all 9 studio pages (ideally extract the header + wrapper into a shared StudioShell component).
- **الحالة:** ⬜

### 22. Two-panel studio layout creates cramped nested scroll areas on mobile instead of stacking naturally

- **الملف:** `components/layout/StudioLayout.tsx:20`
- **البُعد:** الموبايل
- **المشكلة:** Below `lg` the input and preview panels stack (`flex-col`), but because the parent is a fixed-height flex container and both panels have `overflow-y-auto` (lines 22, 27), the phone viewport (~600px usable) is split between two independently scrolling boxes. Long forms (VoiceOver has a textarea + 10 voice rows + dialect/speed/tone pills) get squeezed into a ~300px scroll region, and users must scroll inside a tiny inner box to reach the Generate button while the preview panel wastes the rest of the screen showing an empty state. This is the single biggest mobile usability problem in the app.
- **الحل:** Make the panel scrolling desktop-only: container `overflow-y-auto lg:overflow-visible`, panels `lg:overflow-y-auto` with natural (auto) height below lg so the whole studio scrolls as one page on mobile. Better: add a mobile tab switcher (الإدخال / المعاينة) that shows one panel at a time below lg and auto-switches to preview after generation.
- **الحالة:** ⬜

### 23. TopBar overflows horizontally on small phones (fixed content ~400px wide)

- **الملف:** `components/layout/TopBar.tsx:50`
- **البُعد:** الموبايل
- **المشكلة:** The header row (`flex h-14 items-center gap-4 px-4`) always renders: menu button (40px) + credits badge (~70px) + streak badge (~50px) + theme button (40px) + language button (40px) + avatar (32px) + six 16px gaps + 32px padding ≈ 400px of unshrinkable content. On a 360–375px viewport (iPhone SE/mini, small Androids) the row overflows, clipping the avatar/menu or causing horizontal page scroll. None of the badges or icon buttons can shrink (whitespace-nowrap, fixed h/w).
- **الحل:** Use `gap-2 sm:gap-4`, and hide the streak badge and language button below sm (`hidden sm:flex`), moving language switch into the user dropdown menu so the bar fits: menu + credits + theme + avatar.
- **الحالة:** ⬜

### 24. Entire landing page is hardcoded Arabic — English locale (/en) shows a fully Arabic marketing site

- **الملف:** `components/landing/HeroSection.tsx:16`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** All 12 landing components (HeroSection.tsx:16-22,100-148; NavBar.tsx:11-13,55-58,66; FaqSection, PricingSection, Footer, HowItWorks, StudiosShowcase, ValuePillars, SocialProof, StatsSection, FinalCta, InteractiveDemo) contain zero useTranslations calls, and messages/en.json has no 'landing' namespace at all. An English visitor on /en gets an untranslated Arabic landing page — the single highest-traffic page in the product.
- **الحل:** Create a 'landing' namespace in messages/ar.json and messages/en.json, move all strings (nav links, hero typewriter words, CTA copy, FAQ, pricing, footer) into it, and consume via useTranslations('landing') in each component. Data arrays (NAV_LINKS, TYPEWRITER_WORDS, FLOATING_CARDS) should hold label keys, not literals.
- **الحالة:** ⬜

### 25. Asset cards are not keyboard-accessible; icon-only actions unlabeled and hover-gated

- **الملف:** `components/shared/AssetCard.tsx:42`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** The card is a plain div with onClick (line 42) — no role, no tabIndex, no key handler — so keyboard users cannot select assets at all. The Download (line 60) and Delete (line 69) buttons are icon-only with no aria-label, and their container is opacity-0 group-hover:opacity-100 (line 57), so they are invisible/unreachable for keyboard and touch users. The asset image also has alt="" (line 47), hiding it from screen readers. Selection state is shown by a fake div 'checkbox' with no checkbox semantics.
- **الحل:** Make the card a <button> (or add role="button", tabIndex=0, onKeyDown Enter/Space) with aria-pressed={selected}; add aria-label to Download/Delete buttons; add focus-within:opacity-100 alongside group-hover:opacity-100; set alt to a meaningful description (studio + date).
- **الحالة:** ⬜

### 26. Mixed i18n in VoiceOver page: hardcoded Arabic errors/placeholder next to t() calls, plus English 'Network error'

- **الملف:** `app/[locale]/(dashboard)/voiceover/page.tsx:86`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** The page uses useTranslations for labels but hardcodes Arabic in the same file: plan-limit error messages (line 86: 'هذا الصوت غير متاح في خطتك الحالية' etc.), textarea placeholder (line 103), duration hint 'تقريباً / تجاوز الحد' (line 105), result badge 'التعليق الصوتي' (line 237), 'محسّن' (line 239), and VOICE_NAMES fallbacks (lines 36-47). Meanwhile the catch handler shows raw English 'Network error' (line 92) to Arabic users. English locale sees Arabic; Arabic locale sees English — in one screen.
- **الحل:** Move all these strings into the voiceover.* namespace in both message files (errors.voiceUnavailable, errors.dialectUnavailable, errors.durationExceeded, errors.network, scriptPlaceholder, enhanced, approx) and use tVo(). Same 'Network error' fix applies to campaign/page.tsx:56, edit/page.tsx:49, plan/page.tsx:59, storyboard/page.tsx:54, creator/page.tsx:78, analysis/page.tsx:61, photoshoot/page.tsx:53.
- **الحالة:** ⬜

### 27. Shared components hardcode Arabic UI strings with zero i18n — English users see Arabic across the whole app

- **الملف:** `components/shared/CommandPalette.tsx:38`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** A cluster of reused components contains only hardcoded Arabic and no useTranslations: CommandPalette.tsx:38-47 (all command labels/groups), DailyBonus.tsx:23-29, GenerationProgress.tsx:7-10 (the loading stages every studio shows), PersonaSelector.tsx:16-44 (onboarding), PromptHistory.tsx:58-82, PromptTemplateLibrary.tsx:42-59, PromptSuggestions.tsx:9-14, QualityRating.tsx:22,29, ShareMenu.tsx:16,40,55, PromptEnhancer.tsx:39-42, and ModelSelector.tsx:32 ('مسار بايرا 🦊' label — ModelSelector even defines nameAr/nameEn on line 22-24 but only ever renders nameAr on line 48). These render inside /en pages untranslated.
- **الحل:** Add a 'shared' (or per-component) namespace to messages/ar.json + en.json and convert each component to useTranslations. In ModelSelector, pick nameAr/nameEn by locale (useLocale()) or better, move names to message keys; translate the 'مسار بايرا' label via t().
- **الحالة:** ⬜

---

## 🟡 متوسطة — تحسينات مهمة (57)

### 28. Loading text 'جاري التوليد...' violates the mandatory Pyra AI branding rule

- **الملف:** `components/landing/InteractiveDemo.tsx:44`
- **البُعد:** صفحة الهبوط
- **المشكلة:** CLAUDE.md's identity rules explicitly require loading states to read 'بايرا تشتغل...' instead of 'جاري التوليد' — this exact forbidden string is what the demo button shows while 'generating'. It is the only generation-style loading state on the landing page, so it is the first impression of the Pyra persona and it breaks the brand voice the rest of the page builds.
- **الحل:** Change the loading label to 'بايرا تشتغل... 🦊' and keep the Sparkles/Loader icon as-is.
- **الحالة:** ⬜

### 29. Privacy/Terms links open pages wrapped in the authenticated dashboard shell

- **الملف:** `components/landing/Footer.tsx:17`
- **البُعد:** صفحة الهبوط
- **المشكلة:** LEGAL_LINKS point to /privacy and /terms, which middleware correctly whitelists as public — but both pages live in app/[locale]/(dashboard)/, so anonymous visitors clicking from the landing footer get the full app chrome: Sidebar with studio links, TopBar, LowCreditsBanner, CommandPalette, and useUser/credits hooks firing with no session. A logged-out visitor reviewing the privacy policy before signup sees a broken half-logged-in dashboard instead of a public document page.
- **الحل:** Move privacy/ and terms/ out of the (dashboard) route group into the (landing) group (which already exists with a pass-through layout at app/[locale]/(landing)/layout.tsx) and give them the public NavBar + Footer.
- **الحالة:** ⬜

### 30. Footer studio and settings links send anonymous visitors to auth-gated /dashboard/* routes

- **الملف:** `components/landing/Footer.tsx:3`
- **البُعد:** صفحة الهبوط
- **المشكلة:** STUDIO_LINKS (lines 3-8) link to /dashboard/creator, /dashboard/campaign, /dashboard/analysis, /dashboard/photoshoot, and SUPPORT_LINKS includes /dashboard/settings (line 13). Middleware redirects any logged-out visitor straight to /login with no return-to context — so a prospect exploring 'منشئ الصور' from the footer hits a login wall instead of learning about the studio. The support column also contains no actual support/contact channel.
- **الحل:** Point studio labels at the public #studios anchor (or future marketing pages), drop 'الإعدادات' from a public footer, and add a real contact link (mailto or /#faq) under الدعم.
- **الحالة:** ⬜

### 31. Landing pricing shows monthly-only while the billing page offers an annual toggle at 18% off

- **الملف:** `components/landing/PricingSection.tsx:61`
- **البُعد:** صفحة الهبوط
- **المشكلة:** PricingSection renders ${plan.price}/شهر with no billing-period toggle, but the billing page (app/[locale]/(dashboard)/billing/page.tsx:159-161) offers ANNUAL_PLANS with an isAnnual toggle showing e.g. Pro at $23.75/mo instead of $29. The landing page therefore advertises a worse price than the product actually sells, hides the strongest conversion lever (18% savings), and creates a 'the price changed after I signed up' inconsistency.
- **الحل:** Add the same monthly/annual toggle to PricingSection, driven by ANNUAL_PLANS from lib/stripe/plans.ts, with a 'وفّر 18%' badge — reusing the exact data source the billing page uses so they cannot diverge.
- **الحالة:** ⬜

### 32. Five永-running infinite animations with zero prefers-reduced-motion handling

- **الملف:** `components/landing/HeroSection.tsx:75`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The page runs perpetual animations that never stop: two hero background blobs (lines 75-84), three floating cards bobbing infinitely (line 164), two FinalCta blobs (FinalCta.tsx:13-22), and a pulsing 'الأكثر شعبية' badge (PricingSection.tsx:49-51). No component uses useReducedMotion and there is no MotionConfig or CSS prefers-reduced-motion fallback anywhere in components/landing/ or globals.css. Users with vestibular disorders get continuous motion they cannot disable, and idle-tab CPU/battery drain is nonzero.
- **الحل:** Wrap the landing page in <MotionConfig reducedMotion="user"> (framer-motion honors it for transform/opacity animations), and for the requestAnimationFrame counter in StatsSection check window.matchMedia('(prefers-reduced-motion: reduce)') and render the final value immediately.
- **الحالة:** ⬜

### 33. 'Typewriter' headline is an instant word-swap with layout shift and 2x/sec full-hero re-renders

- **الملف:** `components/landing/HeroSection.tsx:56`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The h1 shows a blinking cursor implying typing, but TYPEWRITER_WORDS[wordIndex] hard-swaps the entire word every 2.8s with no per-character animation and no exit transition — the gradient span's width jumps between 'صورة تبيع' and 'تحليل ينافس الوكالات', reflowing the h1 (and everything under it) each cycle, a visible CLS jank on the most-viewed element of the page. Separately, the 530ms setInterval cursor blink (lines 62-67) re-renders the whole HeroSection component tree ~2 times per second for the lifetime of the page.
- **الحل:** Use AnimatePresence with mode='wait' to crossfade words inside a fixed min-width/min-height span (sized to the longest word), and replace the cursor state with a pure CSS animation (@keyframes blink) so React never re-renders for it.
- **الحالة:** ⬜

### 34. Mobile menu missing aria-expanded/aria-controls, snaps closed with no exit animation; nav links have no focus-visible style

- **الملف:** `components/landing/NavBar.tsx:63`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The hamburger button (lines 63-69) has aria-label but no aria-expanded or aria-controls, so screen readers cannot tell menu state. The dropdown (line 73) animates in via framer-motion but is unmounted without AnimatePresence, so closing it snaps abruptly — inconsistent with the polished entrance. The desktop and mobile anchor links (lines 42-49, 82-89) define hover:text-* but no focus-visible styling, so keyboard users tabbing the nav get only the browser default outline while the adjacent shadcn Buttons show branded focus rings — visibly inconsistent focus treatment on the same bar. There is also no Escape-key close.
- **الحل:** Add aria-expanded={mobileOpen} and aria-controls to the button, wrap the dropdown in <AnimatePresence> with an exit variant, add focus-visible:ring-2 focus-visible:ring-primary-500 rounded classes to the nav anchors, and close the menu on Escape.
- **الحالة:** ⬜

### 35. Previous/Next arrows point in the wrong direction in BOTH locales

- **الملف:** `app/[locale]/(dashboard)/onboarding/page.tsx:141`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** Previous uses `<ArrowRight className="rtl:rotate-180" />`: in Arabic (RTL) the rotation makes it point LEFT — the forward direction in RTL; in English it points RIGHT — also the forward direction. Next (line 159) uses `<ArrowLeft className="rtl:rotate-180" />`, which is equally inverted (points right in RTL, left in LTR). Both navigation arrows are flipped relative to reading direction in every locale, which is disorienting in a step wizard.
- **الحل:** Swap the icons: Previous should be `<ArrowLeft className="h-4 w-4 rtl:rotate-180" />` (left in LTR, right in RTL) and Next should be `<ArrowRight className="h-4 w-4 rtl:rotate-180" />`.
- **الحالة:** ⬜

### 36. Active nav item uses light-only colors — glaring pastel chip in dark mode

- **الملف:** `components/layout/Sidebar.tsx:94`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** Active state is `bg-primary-50 text-primary-600` with no dark: variants. primary-50 is a static hex (#EEF2FF, tailwind.config.ts:14), so in dark mode the active sidebar item becomes a bright near-white indigo block against the dark surface — inconsistent with the rest of the app, which uses `dark:bg-primary-900/30 dark:text-primary-300` (e.g. settings/page.tsx:144).
- **الحل:** Change the active classes to `bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 font-medium` to match the established dark-mode pattern.
- **الحالة:** ⬜

### 37. "Soon" nav items are keyboard-focusable links to a nonexistent route (404)

- **الملف:** `components/layout/Sidebar.tsx:96`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** Disabled items use `opacity-50 pointer-events-none`, but pointer-events-none does not block keyboard navigation: Tab + Enter on the 'video' item navigates to /video, which has no page directory under app/[locale]/(dashboard)/ — a 404 from the app's own sidebar. Screen readers also announce these as normal links with no disabled semantics. (Same pattern applies to /projects, /community, /referrals, /team, though those routes exist.)
- **الحل:** Render `soon` items as a non-interactive element: `<span aria-disabled="true" className="... opacity-50 cursor-not-allowed">` (or keep Link but add `tabIndex={-1}` and `onClick={(e) => e.preventDefault()}` plus `aria-disabled`).
- **الحالة:** ⬜

### 38. Credits badge flashes "0" on every page load (loading state ignored)

- **الملف:** `components/layout/TopBar.tsx:69`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** The credits store initializes `balance: 0, loading: true`, and the balance is only set after useUser resolves the profile (layout.tsx:23-27). CreditsWidget correctly renders a skeleton while loading, but the TopBar badge (`<AnimatedNumber value={balance} />`) and the Sidebar footer counter (Sidebar.tsx:163, 172) render the raw balance immediately — so on every hard navigation the user sees '0 credits' then an animated count-up to their real balance. A momentary '0 credits' in a credits-based SaaS is alarming and looks like a billing bug.
- **الحل:** Read `loading` from useCreditsStore in TopBar and Sidebar; while loading render a small pulse placeholder (e.g. `<span className="h-3 w-6 animate-pulse rounded bg-surface-2" />`) instead of the number.
- **الحالة:** ⬜

### 39. Full window.location.reload() after profile save is jarring and eats the success toast

- **الملف:** `app/[locale]/(dashboard)/settings/page.tsx:46`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** After a successful name/avatar PATCH, the page calls `window.location.reload()`. This blows away the whole SPA (sidebar state, scroll, theme flash) and the 'تم تحديث الملف الشخصي' toast is destroyed almost immediately by the reload, so users get a white flash instead of confirmation. Root cause: useUser (hooks/useUser.ts) exposes no refetch method.
- **الحل:** Add a `refresh()` function to useUser (re-run the profile select) and call it after save, or optimistically update local state with the returned profile (`setEditName`/avatar preview) — remove the reload entirely.
- **الحالة:** ⬜

### 40. Shell navigation strings hardcoded in Arabic — English UI shows mixed languages

- **الملف:** `components/layout/BottomNav.tsx:9`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** The mobile BottomNav labels ('الرئيسية', 'منشئ', 'حملات', 'ملفاتي', 'المزيد', lines 9-12 and 33) and the entire CommandPalette (components/shared/CommandPalette.tsx:36-61 group/item labels, :88 placeholder 'ابحث عن استوديو أو صفحة...', :93 'لا توجد نتائج') bypass next-intl entirely. The app ships an English locale, and these are the two primary navigation surfaces on mobile and keyboard — English users get an Arabic bottom bar and an Arabic ⌘K palette (which is also hardcoded `dir="rtl"` at CommandPalette.tsx:86). The palette search is un-searchable for English users who type English studio names.
- **الحل:** Replace all literals with `t('nav.*')` keys (they already exist in messages/ar.json and messages/en.json), and derive `dir` from the active locale instead of hardcoding rtl.
- **الحالة:** ⬜

### 41. Billing toggle and plan cards ignore the English locale; annual toggle lacks accessible semantics

- **الملف:** `app/[locale]/(dashboard)/billing/page.tsx:146`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** The monthly/annual toggle labels ('شهري', 'سنوي', 'وفّر 18%', lines 146-156), the error toasts (lines 47, 64, 77), `locale="ar"` hardcoded on PlanCard (line 169), and `toLocaleDateString('ar-SA')` for the renewal date (line 131) all render Arabic in the English UI, on the page where users pay money — the worst place for language confusion. Additionally the toggle is a bare `<button>` with no `role="switch"`, no `aria-checked`, no accessible label, and the 'شهري'/'سنوي' text labels are not clickable — only the 28px pill is.
- **الحل:** Move the strings into messages/*.json (`billing.monthly`, `billing.annual`, `billing.save18`), pass the active locale to PlanCard and toLocaleDateString, and give the toggle `role="switch" aria-checked={isAnnual}` with clickable labels (or use the shadcn Switch component).
- **الحالة:** ⬜

### 42. Checkout/portal buttons fail silently when the API returns an error

- **الملف:** `app/[locale]/(dashboard)/billing/page.tsx:43`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** handleSubscribe/handleTopup/handleManageSubscription only toast inside `catch` (network failure). When the API responds with `success: false` (rate limit, missing Stripe price, unauthenticated), `if (data.success && data.data.url)` is simply false: the spinner stops and nothing happens. The user clicks 'اشترك', the button un-disables, and there is zero feedback — they will click repeatedly and assume billing is broken. Also a single shared `loading` boolean disables every plan and top-up card at once with no indication which one was clicked.
- **الحل:** Add an else branch: `toast.error(data.error || t('billing.checkoutFailed'))` in all three handlers, and track `loading` as the clicked planId/topupId string so only the active card shows its spinner.
- **الحالة:** ⬜

### 43. Quick-action icon chips have no dark-mode variants

- **الملف:** `app/[locale]/(dashboard)/dashboard/page.tsx:21`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** The six quick-action colors ('bg-purple-100 text-purple-600', 'bg-blue-100 text-blue-600', etc., lines 21-26) are light-mode-only Tailwind classes. In dark mode the dashboard home — the first screen after login — shows six bright pastel squares against dark cards, directly violating the project's own CSS-variable/dark-mode convention (compare ActivityTimeline.tsx:70 which correctly uses `dark:bg-primary-900/30`).
- **الحل:** Add dark variants to each entry, e.g. `bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300`, matching the pattern used elsewhere.
- **الحالة:** ⬜

### 44. Selected-state styles missing dark: variants in 7 of 9 studios (light indigo pill on dark theme)

- **الملف:** `components/studios/creator/CreatorForm.tsx:155`
- **البُعد:** الاستوديوهات
- **المشكلة:** Voiceover (page.tsx:125,176) and ModelSelector (line 43) correctly use 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300', but the same selected-state pattern everywhere else omits the dark: variants: CreatorForm lines 155, 175, 188, 213; PhotoshootForm lines 117, 141; CampaignForm lines 99, 122, 152; plan page line 79; storyboard page lines 65, 69, 73; analysis page line 72; edit page line 75; ResolutionSelector line 37. bg-primary-50 is the fixed hex #EEF2FF in tailwind.config.ts, so in dark mode selected buttons flash a bright light-indigo block that clashes with the theme and is inconsistent with the voiceover studio sitting one nav item away.
- **الحل:** Extract one shared selectable-chip class (e.g. a SelectableButton component or a cn constant) using the voiceover pattern 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' and use it in all listed locations.
- **الحالة:** ⬜

### 45. Hardcoded Arabic strings across studios break the English locale and bypass existing i18n keys

- **الملف:** `components/studios/creator/CreatorPreview.tsx:72`
- **البُعد:** الاستوديوهات
- **المشكلة:** The app is bilingual (next-intl ar/en) yet many user-facing strings are hardcoded Arabic and will render Arabic inside the English UI: CreatorPreview empty state 'النتيجة ستظهر هنا' (line 72) and the fallback notice (line 94 — even though a studio.usedFallback key already exists in messages/ar.json); PhotoshootPreview 'الصور ستظهر هنا' (line 57); CampaignPlanDisplay 'الحملة ستظهر هنا' (line 80); every placeholder in plan page (lines 64, 65, 74, 75), analysis page (66, 78, 79, 80, 81), storyboard page (62), edit page (80); voiceover placeholder + inline strings (lines 103, 105, 237, 239) and its hand-rolled Arabic error messages (line 86); all prompt-builder labels/empty state (lines 58, 62, 71, 97, 132); ModelSelector label 'مسار بايرا 🦊' (line 32); ResolutionSelector label 'دقة الصورة' (line 26); GenerationProgress stage labels (lines 6-11). Meanwhile voiceover/plan/analysis/etc. DO use t() for adjacent strings — the mix is arbitrary per studio.
- **الحل:** Move every listed string into messages/ar.json + en.json (emptyState keys per studio, placeholders, selector labels) and replace with t() calls; on CreatorPreview line 94 simply use the existing t('usedFallback') from the studio namespace.
- **الحالة:** ⬜

### 46. Raw English enum values shown as UI labels in Arabic studios

- **الملف:** `app/[locale]/(dashboard)/analysis/page.tsx:73`
- **البُعد:** الاستوديوهات
- **المشكلة:** Several studios print internal enum ids instead of translated labels: analysis industry chips render ind.replace('_',' ') producing 'real estate', 'saas', 'clinic' in the middle of an Arabic form (line 73); prompt-builder output-type buttons render the raw values 'image / video / copy / campaign' (line 78) and the submit button says hardcoded English 'Build Prompt' (line 88); PhotoshootPreview shows 'Failed' on failed shots (line 110); storyboard cards title 'Scene {n}' in English (line 101); GenerationHistory shows 'Text' and the '{n}c' credits suffix (lines 52, 59); CreditCost renders hardcoded 'Free' (line 18) which appears on the Arabic prompt-builder page. Other studios translate the exact same kind of options (campaign dialects, storyboard styles), so this is inconsistent within the product.
- **الحل:** Add translation keys (analysis.industries.*, promptBuilder.outputTypes.*, studio.failed, storyboard.scene, credits.free) and replace the raw values; for CreditCost use t('free') from the credits namespace.
- **الحالة:** ⬜

### 47. Branded GenerationProgress component is never used — all studios fall back to bare Skeletons with divergent layouts

- **الملف:** `components/shared/GenerationProgress.tsx:18`
- **البُعد:** الاستوديوهات
- **المشكلة:** GenerationProgress implements the intended Pyra-branded staged loading ('بايرا تحلل طلبك... 🦊' + progress bar), but grep shows zero imports anywhere. Instead each studio invents its own loading UI: creator shows one 64px skeleton + text, photoshoot a skeleton grid sized by expectedCount, campaign always 9 skeletons, plan 4 bars, analysis 4 bars, storyboard 9 cards, voiceover two skeletons, edit two panes, prompt-builder nothing at all. Users get a different (and unbranded) waiting experience in every studio for the same 'Pyra is working' moment. Note the unused component also prints 'Model: {model}' (line 44) which would violate branding if it were ever wired up with a raw model name.
- **الحل:** Use GenerationProgress as the standard loading state in all 9 studio preview panels (optionally alongside content-shaped skeletons), and delete or Pyra-brand the 'Model:' line before wiring it up.
- **الحالة:** ⬜

### 48. Internal 'Mock Response' debug badge shown to end users in three studios

- **الملف:** `components/studios/creator/CreatorPreview.tsx:99`
- **البُعد:** الاستوديوهات
- **المشكلة:** CreatorPreview line 99, PhotoshootPreview line 76, and CampaignPlanDisplay line 89 render an English 'Mock Response' badge whenever the API returns mock=true (i.e., AI keys unconfigured or fallback demo data). This is developer jargon leaking into a paid product — a customer who paid credits sees 'Mock Response' with no explanation, and it is untranslated. Per branding rules, degraded output should be phrased as a Pyra state.
- **الحل:** Replace with a translated, user-meaningful notice (e.g. 'نتيجة تجريبية — بايرا في وضع المعاينة' via a shared key) or hide the badge in production entirely.
- **الحالة:** ⬜

### 49. Download buttons use the download attribute on cross-origin URLs — navigates away or opens the file instead of downloading

- **الملف:** `components/studios/creator/CreatorPreview.tsx:77`
- **البُعد:** الاستوديوهات
- **المشكلة:** handleDownload (lines 77-82) creates an <a download> pointing at the generated image URL and clicks it without target. Generated assets are Supabase signed URLs (cross-origin per project conventions), and browsers ignore the download attribute cross-origin — so clicking 'Download' navigates the current tab to the raw image, destroying the user's studio state (form + results). handleDownloadAll (line 84) is doubly broken: it fires 1-4 sequential navigations, of which only one wins. Same pattern in PhotoshootPreview handleDownloadAll (lines 62-71) and its per-shot <a download> (line 97), edit page (line 100), CampaignPlanDisplay (line 157), and the voiceover MP3 link (line 261).
- **الحل:** Fetch the asset as a blob and download via URL.createObjectURL (fetch(url).then(r=>r.blob())...), or route downloads through a same-origin proxy endpoint that sets Content-Disposition: attachment; for downloadAll, zip server-side (the assets export API already produces ZIPs) or trigger blob downloads sequentially.
- **الحالة:** ⬜

### 50. Edit shortcut from Creator results discards the generated image

- **الملف:** `components/studios/creator/CreatorPreview.tsx:158`
- **البُعد:** الاستوديوهات
- **المشكلة:** The pencil action on generated results (lines 157-161) is just <Link href="/edit"> — it opens the Edit studio with an empty upload slot, forcing the user to download the image and re-upload it manually. The affordance (edit icon directly on the result) promises editing THIS image; the edit page supports an initial image only via its own upload state, and nothing carries the URL over.
- **الحل:** Pass the image along (e.g. href={`/edit?image=${encodeURIComponent(imageUrls[0])}`}) and have the edit page read the param into originalImage on mount (with signed-URL handling), mirroring the ?prompt= fix.
- **الحالة:** ⬜

### 51. Conflicting transition-colors + transition-transform utilities on Button — one silently cancels the other

- **الملف:** `components/ui/button.tsx:7`
- **البُعد:** نظام التصميم
- **المشكلة:** The base cva string contains both `transition-colors` and `transition-transform` (plus `active:scale-[0.97]`). Both utilities set the `transition-property` on the same element, so only the one that comes later in Tailwind's generated stylesheet applies — either hover background/color changes snap with no transition, or the active press-scale snaps, on every button in the app. This also makes Button's motion timing inconsistent with other components, which each pick their own (`transition-all` in AssetCard/PersonaSelector/PromptTemplateLibrary/GenerationHistory, `transition-colors` elsewhere, `duration-200` only in dialog.tsx).
- **الحل:** Replace the two utilities with one declaration that covers both needs, e.g. `transition-[color,background-color,border-color,transform] duration-150`, and adopt that one duration token (150 or 200ms) across ui/shared components instead of the current mix of unspecified defaults.
- **الحالة:** ⬜

### 52. Hardcoded ring-offset-white on Button and Dialog close vs token-based offset on Input

- **الملف:** `components/ui/button.tsx:7`
- **البُعد:** نظام التصميم
- **المشكلة:** Button's base class uses `ring-offset-white` (button.tsx:7) and DialogClose uses `ring-offset-white` (dialog.tsx:43), while Input uses `ring-offset-[var(--color-surface)]` (input.tsx:10). In dark mode, every focused button shows a hard white halo ring-offset against the dark #1E293B surface — visually broken — while inputs focus correctly. Same interaction, two different focus appearances.
- **الحل:** Change `ring-offset-white` to `ring-offset-[var(--color-surface)]` in components/ui/button.tsx:7 and components/ui/dialog.tsx:43 (or wire shadcn's `ringOffsetColor` to the variable in tailwind.config.ts and use plain `ring-offset-2`).
- **الحالة:** ⬜

### 53. hover:text-primary-900 hardcodes dark indigo text on outline/secondary/ghost variants — breaks on dark surfaces

- **الملف:** `components/ui/button.tsx:13`
- **البُعد:** نظام التصميم
- **المشكلة:** outline (line 13), secondary (line 14) and ghost (line 15) variants set `text-primary-900` / `hover:text-primary-900` — static #312E81 — instead of the text token; dropdown-menu.tsx:38 does the same with `focus:text-primary-900`. Once the surface palette is made variable-driven (the critical finding), dark-mode hover states become #312E81 dark-indigo text on #334155 dark surface — illegible. Even today it is inconsistent: default text uses `var(--color-text-primary)` but hover swaps to a hardcoded shade that does not exist in the token set for text.
- **الحل:** Replace `text-primary-900` / `hover:text-primary-900` / `focus:text-primary-900` with `text-[var(--color-text-primary)]` (or a new `--color-text-on-surface-hover` token) in components/ui/button.tsx lines 13-15 and components/ui/dropdown-menu.tsx line 38.
- **الحالة:** ⬜

### 54. Selected-state styling diverges from sibling ModelSelector (no dark variants, no hover surface)

- **الملف:** `components/shared/ResolutionSelector.tsx:37`
- **البُعد:** نظام التصميم
- **المشكلة:** These two selectors sit side by side in every studio form yet style the same 'selected chip' pattern differently. ModelSelector.tsx:45-47 selected = `border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300`, unselected hover = `hover:border-primary-300 hover:bg-surface-2`. ResolutionSelector.tsx:37-38 selected = `border-primary-500 bg-primary-50 text-primary-700` (no dark: variants — a bright #EEF2FF chip stuck in dark mode) and unselected hover has only `hover:border-primary-300` with no background change. Users see two adjacent controls with visibly different selected/hover treatments.
- **الحل:** Extract one shared class string (or a small SelectableChip component) used by both: `border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300` for selected and `border-[var(--color-border)] hover:border-primary-300 hover:bg-surface-2` for unselected; apply it in ResolutionSelector.tsx:35-39.
- **الحالة:** ⬜

### 55. Filter-pill buttons duplicated across PromptHistory and PromptTemplateLibrary with a broken unselected state

- **الملف:** `components/shared/PromptHistory.tsx:64`
- **البُعد:** نظام التصميم
- **المشكلة:** PromptHistory.tsx:64-65 and PromptTemplateLibrary.tsx:49-77 hand-roll the identical pill pattern: raw <button> with `rounded-full px-3 py-1 text-xs` and `bg-primary-500 text-white : bg-surface-2`. Problems: (a) the unselected state sets a background but no text color, so in dark mode it renders static light #F1F5F9 with inherited near-white text — unreadable; (b) no hover state and no focus-visible ring; (c) the same pattern is copy-pasted in two files and can drift (it already differs from the studio-selector chips). This is exactly what the Badge/Button primitives exist for.
- **الحل:** Create one shared FilterChip component (e.g. components/shared/FilterChip.tsx) built on the design system: selected `bg-primary-500 text-white`, unselected `bg-surface-2 text-[var(--color-text-secondary)] hover:bg-surface-2/80`, plus the standard `focus-visible:ring-2 focus-visible:ring-primary-500`, and use it in both PromptHistory.tsx:64-65 and PromptTemplateLibrary.tsx:48-77.
- **الحالة:** ⬜

### 56. Custom interactive buttons across shared components lack the design system's focus-visible ring

- **الملف:** `components/shared/ModelSelector.tsx:38`
- **البُعد:** نظام التصميم
- **المشكلة:** The Button primitive defines the canonical focus treatment (`focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2`), but every hand-rolled <button> in shared components omits it: ModelSelector.tsx:38-50, ResolutionSelector.tsx:29-41, PersonaSelector.tsx:46-56, QualityRating.tsx:23 and 26, PromptSuggestions.tsx:24-27, GenerationHistory.tsx:38-42, ModelComparison.tsx:73, PromptHistory.tsx:64-65 and the star/copy icon buttons at :81-82, PromptTemplateLibrary.tsx:49-77 and :83-90. Keyboard users get the browser's default outline on some controls and the indigo ring on others — an inconsistent and partly invisible focus experience, on the app's most-used controls (studio forms).
- **الحل:** Append the shared ring classes `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2` to each custom button (or add a `.focus-ring` utility via @layer components in globals.css and apply it everywhere, including Button, so there is a single source of truth).
- **الحالة:** ⬜

### 57. Semantic status colors bypass the defined tokens — even mixed within a single component

- **الملف:** `components/shared/QualityRating.tsx:23`
- **البُعد:** نظام التصميم
- **المشكلة:** globals.css defines --color-success/--color-warning/--color-error (lines 27-29), yet components hardcode raw palette classes for the same semantics: QualityRating.tsx uses `text-green-600`/`bg-green-100` (line 23) and `text-red-600`/`bg-red-100` (line 26) but then `text-[var(--color-success)]` on line 29 — two vocabularies in one 32-line file. Elsewhere: badge.tsx:11-16 uses `bg-red-500`/`bg-emerald-500`/`bg-amber-500` for destructive/success/warning; button.tsx destructive uses `bg-red-500 hover:bg-red-600`; ShareMenu.tsx:47,53 uses `text-green-600`/`text-blue-600`; LowCreditsBanner.tsx:20-23, ComingSoonBanner and DailyBonus roll their own amber/red sets. If the brand ever adjusts a status color, only token-based usages update; the rest silently drift, and green-600 (#16A34A) already differs from --color-success (#10B981).
- **الحل:** Add success/warning/error to the Tailwind palette pointing at the variables (e.g. `success: 'var(--color-success)'`) and replace the raw green/red/amber/emerald classes in badge.tsx, button.tsx (destructive), QualityRating.tsx, ShareMenu.tsx, LowCreditsBanner.tsx, DailyBonus.tsx and ComingSoonBanner with the tokens (use color-mix()/opacity modifiers for the soft backgrounds).
- **الحالة:** ⬜

### 58. Onboarding Previous/Next arrows both point the wrong way (double-flip)

- **الملف:** `app/[locale]/(dashboard)/onboarding/page.tsx:141`
- **البُعد:** RTL
- **المشكلة:** The 'previous' button (line 141) uses ArrowRight + rtl:rotate-180: it renders ← in Arabic (should be →, i.e. back against RTL reading direction) and → in English (should be ←). The 'next' CTA (line 159) uses ArrowLeft + rtl:rotate-180: renders → in Arabic (should be ←) and ← in English (should be →). Both wizard navigation arrows are inverted in both locales, actively miscommunicating direction in a step-by-step flow.
- **الحل:** Swap the icons and keep the rtl flip: previous → <ArrowLeft className="h-4 w-4 rtl:rotate-180" />, next → <ArrowRight className="h-4 w-4 rtl:rotate-180" /> (line 159).
- **الحالة:** ⬜

### 59. No Radix DirectionProvider — Radix primitives run in LTR mode inside the RTL app

- **الملف:** `app/[locale]/layout.tsx:58`
- **البُعد:** RTL
- **المشكلة:** html gets dir="rtl" but Radix UI components resolve direction from @radix-ui/react-direction context (default 'ltr'), not from the document. Consequences: DropdownMenuContent align="end" in components/layout/TopBar.tsx:109 is interpreted as physical right — in RTL the avatar menu (leftmost header item) tries to open toward the wrong side and only lands correctly via collision fallback; arrow-key navigation inside menus is reversed for Arabic keyboard users; any future Radix Slider/Select inherits the same LTR assumption.
- **الحل:** In app/[locale]/layout.tsx wrap children with Radix's DirectionProvider: import { DirectionProvider } from '@radix-ui/react-direction' (already in the dependency tree) and render <DirectionProvider dir={dir}>…</DirectionProvider> inside NextIntlClientProvider so all Radix primitives inherit the locale's direction.
- **الحالة:** ⬜

### 60. Before/After slider hardcodes RTL geometry — divider detaches from image boundary in the English locale

- **الملف:** `components/shared/BeforeAfterSlider.tsx:36`
- **البُعد:** RTL
- **المشكلة:** handleMove (line 20) measures position from rect.right and the divider is placed with style={{ right: `${position}%` }} (line 36), while the clipped 'before' layer (line 32) relies on CSS over-constrained inset resolution (inset-0 + width) which anchors right ONLY when direction is rtl. In the en (LTR) locale the clip anchors to the LEFT while the divider stays measured from the RIGHT, so the drag handle sits at the mirrored position, disconnected from the actual image split (they only coincide at 50%). Labels 'قبل/بعد' (lines 43-44) are also hardcoded Arabic.
- **الحل:** Make the component direction-aware: read locale/dir (e.g. const isRtl = document.dir === 'rtl' or useLocale()); compute x = isRtl ? rect.right - clientX : clientX - rect.left; position the divider with style={{ insetInlineStart: `${position}%` }} and anchor the clipped layer explicitly with insetInlineStart: 0 + width; translate the labels via next-intl.
- **الحالة:** ⬜

### 61. Arabic placeholders render left-aligned inside dir="ltr" auth inputs

- **الملف:** `app/[locale]/(auth)/login/page.tsx:98`
- **البُعد:** RTL
- **المشكلة:** Email/password inputs use dir="ltr" (correct for typed Latin values) but their placeholders are Arabic ('أدخل بريدك الإلكتروني', 'أدخل كلمة المرور' — messages/ar.json). With dir=ltr the Arabic placeholder is laid out with an LTR base direction and left alignment, so on the very first screens (login lines 98/110/170, signup/page.tsx:117/130, forgot-password/page.tsx:72, reset-password/page.tsx:100/112, team/page.tsx:146) the placeholder sits on the LEFT edge while every label and the rest of the RTL form is right-aligned — visibly broken bidi on the entry point of the product.
- **الحل:** Use dir="auto" on these inputs (empty field takes the placeholder's direction, typed email/password renders LTR), or keep dir="ltr" and add a placeholder alignment override such as className="rtl:placeholder:text-right" (the rtl: variant matches the html[dir=rtl] ancestor even though the input itself is ltr).
- **الحالة:** ⬜

### 62. Final CTA arrow points backwards (same ArrowLeft + rtl:rotate-180 double-flip)

- **الملف:** `components/landing/FinalCta.tsx:54`
- **البُعد:** RTL
- **المشكلة:** The closing signup CTA 'ابدأ مجاناً الحين' renders its arrow pointing right in Arabic (back direction) and left in English — inverted in both locales, same defect class as the hero CTA.
- **الحل:** Replace with <ArrowRight className="h-4 w-4 rtl:rotate-180" />.
- **الحالة:** ⬜

### 63. Studio form selected-option chips use bg-primary-50 without a dark: variant — bright lavender chips glare in dark mode

- **الملف:** `components/studios/creator/CreatorForm.tsx:155`
- **البُعد:** الوضع الداكن
- **المشكلة:** Selected state 'border-primary-500 bg-primary-50 text-primary-700' uses static #EEF2FF, so in dark mode selected style/variation/brand-kit chips render as bright light-lavender blocks inside an otherwise dark form. Sibling components already handle this correctly (components/shared/ModelSelector.tsx:43 uses 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'), so the forms are visibly inconsistent with the selectors directly below them. Affected lines: CreatorForm.tsx 155, 176, 189, 213; components/studios/photoshoot/PhotoshootForm.tsx 117, 141; components/studios/campaign/CampaignForm.tsx 99, 122, 152; components/shared/ResolutionSelector.tsx 37; components/brand-kit/LogoUpload.tsx 72 (drag-over state).
- **الحل:** Apply the ModelSelector pattern to every selected/drag state: 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'. Consider extracting a shared `selectedChipClasses` constant so all studio forms stay in sync.
- **الحالة:** ⬜

### 64. Active sidebar nav item uses bg-primary-50 with no dark variant — bright pill in dark sidebar

- **الملف:** `components/layout/Sidebar.tsx:94`
- **البُعد:** الوضع الداكن
- **المشكلة:** The active navigation link is 'bg-primary-50 text-primary-600 font-medium' — static #EEF2FF. In dark mode the currently-active studio link renders as a bright light-lavender pill against the dark sidebar on every authenticated page, the single most visible dark-mode inconsistency in the app chrome. globals.css even redefines --color-primary-50 to #1E1B4B in .dark, showing the token was meant to flip, but the Tailwind class bypasses the variable.
- **الحل:** Use 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300' (matching components/dashboard/ActivityTimeline.tsx:70), or switch to 'bg-[var(--color-primary-50)]' so the existing .dark variable override takes effect.
- **الحالة:** ⬜

### 65. Sonner Toaster not wired to next-themes — toasts always render light-theme in dark mode

- **الملف:** `components/providers/ToastProvider.tsx:5`
- **البُعد:** الوضع الداكن
- **المشكلة:** <Toaster position="top-center" richColors closeButton dir="rtl" /> omits the theme prop, and sonner's own theme detection is independent of the next-themes class on <html>. Users in dark mode get bright white toast cards (success/error notifications after every generation, credit deduction, etc.) flashing over the dark UI.
- **الحل:** Make ToastProvider read the active theme: const { resolvedTheme } = useTheme() from 'next-themes', then <Toaster theme={resolvedTheme as 'light' | 'dark'} position="top-center" richColors closeButton dir="rtl" />.
- **الحالة:** ⬜

### 66. 404 pages hardcode dark-only bg-[#0a0a0a] and an off-brand orange gradient — broken in light theme

- **الملف:** `app/not-found.tsx:6`
- **البُعد:** الوضع الداكن
- **المشكلة:** Both app/not-found.tsx:6 and app/[locale]/not-found.tsx:13 use 'min-h-screen bg-[#0a0a0a]' with text-gray-400/500 and white headings, ignoring the theme system entirely: a light-mode user hitting a 404 gets a jarring full-black page. The CTA gradient 'from-orange-500 to-amber-500' (lines 8, 23 and locale 15, 28) also contradicts the indigo brand (primary-500 #6366F1) used everywhere else — the 404 looks like a different product.
- **الحل:** Use theme tokens: container 'bg-[var(--color-bg)]', body text 'text-[var(--color-text-secondary)]/[var(--color-text-muted)]', heading 'text-[var(--color-text-primary)]', and swap the gradient to 'from-primary-500 to-accent-500' with hover 'from-primary-600 to-accent-600' in both files.
- **الحالة:** ⬜

### 67. Admin panel mixes light-theme white cards/modals inside its dark-only shell

- **الملف:** `components/admin/ConfirmDialog.tsx:61`
- **البُعد:** الوضع الداكن
- **المشكلة:** The admin is intentionally dark (layout hardcodes .dark + bg-slate-950), and dashboard/analytics pages use glassy dark cards (bg-white/[0.02], border-white/[0.06]). But a second set of admin surfaces is styled for a light theme: ConfirmDialog.tsx:61 and CreditAdjustModal.tsx:86 ('rounded-xl bg-white p-6 shadow-xl' modals), UserDetailCard.tsx:53, StudioConfigCard.tsx:25, ModelConfigCard.tsx:37, PromptEditor.tsx:50, FilterBar.tsx:54,64 (bg-white inputs/selects), plus bg-white filter selects in settings/models/transactions/logs/generations pages. The result is stark white cards and dialogs popping against the slate-950 gradient — two clashing design languages within one panel, and light-gray badge styles like 'bg-slate-100 text-slate-700' look washed out on dark rows.
- **الحل:** Restyle the light-styled admin components to the dark glass system used by DataTable/KPICard: surfaces 'bg-slate-900/95 border border-white/[0.08]' (modals) or 'bg-white/[0.02] border-white/[0.06]' (cards), inputs 'bg-white/[0.04] border-white/[0.08] text-slate-200', badges using the /10-opacity ring pattern (e.g. 'bg-slate-500/10 text-slate-400 ring-1 ring-slate-500/20').
- **الحالة:** ⬜

### 68. Assets studio-filter pill row overflows viewport on mobile (no wrap, no scroll)

- **الملف:** `app/[locale]/(dashboard)/assets/page.tsx:136`
- **البُعد:** الموبايل
- **المشكلة:** The filter row `<div className="flex gap-2">` renders 9 pill buttons (الكل، منشئ الصور، تصوير، حملات، خطط، ستوري بورد، تحليل، صوت، تعديل) plus a `ms-auto` select-all link. Flex items don't wrap by default and the Arabic labels can't shrink, so on any screen under ~700px the row extends past the viewport edge, causing horizontal page scroll and making the last filters (and select-all) unreachable without awkward sideways panning.
- **الحل:** Change to `flex gap-2 overflow-x-auto pb-1 -mx-6 px-6` for a swipeable chip row (or `flex-wrap`), and move the select-all button out of this row onto the header line next to the bulk-action buttons.
- **الحالة:** ⬜

### 69. BottomNav ignores iOS safe-area inset — home indicator overlaps nav items

- **الملف:** `components/layout/BottomNav.tsx:20`
- **البُعد:** الموبايل
- **المشكلة:** The fixed bottom nav (`fixed bottom-0 inset-x-0 ... h-14`) has no `env(safe-area-inset-bottom)` padding. On iPhones with a home indicator, the gesture bar overlays the bottom ~20px of the 56px nav, making the icon labels sit under the indicator and taps prone to triggering the system home gesture instead of navigation.
- **الحل:** Add `pb-[env(safe-area-inset-bottom)]` to the nav element (keep the inner row at h-14), and ensure the dashboard layout's `pb-14` compensation becomes `pb-[calc(3.5rem+env(safe-area-inset-bottom))]`. Also add `viewport-fit=cover` to the viewport meta if not present.
- **الحالة:** ⬜

### 70. Download/Delete actions are hover-only — unreachable on touch devices

- **الملف:** `components/shared/AssetCard.tsx:57`
- **البُعد:** الموبايل
- **المشكلة:** The per-asset action buttons are wrapped in `opacity-0 group-hover:opacity-100`, and tapping the card itself toggles selection (line 42). On phones/tablets there is no hover, so a mobile user has no way to download or delete a single asset from its card — the buttons never become visible, and even a first tap goes to onSelect. The 7x7 (28px) buttons are also below the 44px touch-target minimum.
- **الحل:** Show actions on touch/coarse pointers: `opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100` (or use a `pointer-coarse` media/variant), and bump buttons to h-9 w-9 minimum on mobile.
- **الحالة:** ⬜

### 71. Per-variation download button hover-only — mobile users can't save individual variations

- **الملف:** `components/studios/creator/CreatorPreview.tsx:137`
- **البُعد:** الموبايل
- **المشكلة:** In the 4-variations grid, each image's download button uses `opacity-0 group-hover:opacity-100`, so it is permanently invisible on touch devices. Mobile users can only use 'Download All'; saving one specific variation is impossible. The 28px (p-1.5 + 14px icon) button is also under the 44px touch minimum.
- **الحل:** Make the button always visible on touch: `opacity-100 md:opacity-0 md:group-hover:opacity-100`, and increase to ~p-2.5 with a 16px icon so the target reaches ~40-44px.
- **الحالة:** ⬜

### 72. 5-column pricing grid produces ~170px cards at 1024px and an orphaned 5th card at tablet width

- **الملف:** `components/landing/PricingSection.tsx:31`
- **البُعد:** الموبايل
- **المشكلة:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` jumps straight from 2 columns to 5. At lg (1024–1280px) each card is ~170–200px wide including p-6 padding, so the $ price (text-4xl), Arabic feature lines with check icons, and CTA button get badly cramped/wrapped. At sm/md, 5 cards in 2 columns leave the last card alone on its own row at half width, which looks broken. Same pattern on the billing page (app/[locale]/(dashboard)/billing/page.tsx:158).
- **الحل:** Use `sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5` (cards ≥230px before going 5-up), or a horizontally scroll-snapping card row on md. Apply the same change to billing/page.tsx:158.
- **الحالة:** ⬜

### 73. Touch targets well under 44px: 16px edit-profile pencil, 28px sidebar controls, ~30px option pills

- **الملف:** `app/[locale]/(dashboard)/settings/page.tsx:77`
- **البُعد:** الموبايل
- **المشكلة:** The profile edit button is a bare 16px pencil icon with no padding — nearly impossible to tap on a phone. Same class of issue: Sidebar close/collapse buttons are `p-1` around a 16–20px icon (~28px, components/layout/Sidebar.tsx:129,136), and the voiceover dialect/tone/speed pills are `px-3 py-1.5 text-xs` (~30px tall, voiceover/page.tsx:150,198). All are below the 44px iOS / 48dp Android minimum, causing mis-taps in the primary generation flows.
- **الحل:** Give the pencil `p-2.5 -m-2.5` (visual size unchanged, 44px hit area); change sidebar buttons to `p-2`; bump pill controls to `py-2.5 px-4 min-h-[40px]` on mobile (e.g. `py-2.5 sm:py-1.5`).
- **الحالة:** ⬜

### 74. SEO metadata is static Arabic for both locales (og locale pinned to ar_SA)

- **الملف:** `app/[locale]/layout.tsx:10`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** metadata (lines 10-35) hardcodes the Arabic title/description/keywords and openGraph.locale 'ar_SA' at module level, so /en pages ship Arabic <title>, meta description, and ar_SA OG tags. English search results and link previews show Arabic.
- **الحل:** Replace the static export with generateMetadata({ params }) that awaits locale, reads strings via getTranslations({ locale, namespace: 'meta' }), and sets openGraph.locale to 'ar_SA' or 'en_US' accordingly.
- **الحالة:** ⬜

### 75. Dates hardcoded to 'ar-SA' locale everywhere — Hijri-calendar dates, ignores English locale

- **الملف:** `components/shared/AssetCard.tsx:31`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** toLocaleDateString('ar-SA') is hardcoded regardless of the active locale: AssetCard.tsx:31, PromptHistory.tsx:77, billing/page.tsx:131, projects/page.tsx:58, components/billing/TransactionTable.tsx:72, components/dashboard/ActivityTimeline.tsx:78. English users get Arabic-formatted dates, and 'ar-SA' defaults to the Umm al-Qura (Hijri) calendar in most runtimes, so even Arabic users see Islamic-calendar dates for renewal/creation timestamps (e.g. billing renewal '15 محرم'), which is confusing for billing dates.
- **الحل:** Use useLocale()/useFormatter() from next-intl (format.dateTime(date, {...})), or pass locale === 'ar' ? 'ar-EG' : 'en-US' (or 'ar-SA-u-ca-gregory') to force the Gregorian calendar.
- **الحالة:** ⬜

### 76. ModelComparison exposes raw model names 'Gemini', 'GPT', 'Flux' as user-facing badges

- **الملف:** `components/shared/ModelComparison.tsx:16`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** MODELS (lines 16-18) defines display names 'Gemini'/'GPT'/'Flux' rendered as badges on line 63, plus hardcoded Arabic descriptions and button text 'قارن الثلاث نماذج' (line 55). This violates the brand rule that model names never appear in UI ('سرعة / جودة / إبداع' is mandated). The component is currently not imported anywhere, but it is one import away from leaking the vendors.
- **الحل:** Rename display names to the branded paths (سرعة / جودة / إبداع with i18n keys) keeping ids gemini/gpt/flux code-only, or delete the unused component.
- **الحالة:** ⬜

### 77. Loading copy 'جاري التوليد...' contradicts the mandated Pyra brand voice

- **الملف:** `messages/ar.json:138`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** CLAUDE.md explicitly requires the loading state to read 'بايرا تشتغل...' instead of 'جاري التوليد'. messages/ar.json studio.generating (line 138) is 'جاري التوليد...' and is used by every studio's generate button; the landing InteractiveDemo.tsx:44 also hardcodes 'جاري التوليد...'. The brand persona disappears at the most-watched moment of the product.
- **الحل:** Change ar.json studio.generating to 'بايرا تشتغل... 🦊' (en: 'Pyra is working...'), and make InteractiveDemo use the same translated key.
- **الحالة:** ⬜

### 78. 'Mock Response' developer badge shown to end users in three studios

- **الملف:** `components/studios/creator/CreatorPreview.tsx:99`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** When the API returns mock data, users see a raw English 'Mock Response' outline badge: CreatorPreview.tsx:99, PhotoshootPreview.tsx:76, CampaignPlanDisplay.tsx:89. This is an internal dev artifact leaking into the Arabic UI and undermines the Pyra brand ('بايرا' should never look like a stub).
- **الحل:** Gate the badge behind process.env.NODE_ENV === 'development', or replace with a translated, on-brand notice (e.g. 'معاينة تجريبية') if it must ship.
- **الحالة:** ⬜

### 79. Play/Pause audio button is icon-only with no accessible name or state

- **الملف:** `app/[locale]/(dashboard)/voiceover/page.tsx:253`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** The main playback control (lines 253-258) renders only a Play/Pause icon with no aria-label and no aria-pressed, so screen-reader users hear just 'button' for the core interaction of the VoiceOver result screen.
- **الحل:** Add aria-label={isPlaying ? tVo('pause') : tVo('play')} (new i18n keys) to the Button; optionally aria-pressed={isPlaying}.
- **الحالة:** ⬜

### 80. Thumbs up/down rating buttons: icon-only, unlabeled, state conveyed by color only

- **الملف:** `components/shared/QualityRating.tsx:23`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** Both rating buttons (lines 23-28) have no aria-label and no aria-pressed; the selected state is indicated purely by a green/red background tint, which fails WCAG 1.4.1 (use of color) and is invisible to screen readers. The surrounding strings 'كيف النتيجة؟' (line 22) and 'شكراً!' (line 29) are also hardcoded Arabic.
- **الحل:** Add aria-label (e.g. t('rating.good')/t('rating.bad')) and aria-pressed={rating === 5}/{rating === 1}; add a non-color cue (ring/checkmark); move strings to messages files.
- **الحالة:** ⬜

### 81. Dashboard pages mix t() with hardcoded Arabic toasts, placeholders, and buttons

- **الملف:** `app/[locale]/(dashboard)/settings/page.tsx:44`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** Same-file mixed pattern breaks /en: settings/page.tsx toasts (lines 44-50: 'تم تحديث الملف الشخصي', 'فشل التحديث', 'حدث خطأ في الشبكة'), placeholder 'الاسم' (line 96), button labels 'جاري الحفظ.../حفظ/إلغاء' (107-110), 'قانوني/سياسة الخصوصية/شروط الاستخدام/تسجيل الخروج' (187-201). Also billing/page.tsx:47,64,77 (toast 'حدث خطأ. حاول مرة أخرى.'), 146-155 ('شهري/سنوي/وفّر 18%'), analysis/page.tsx:66-81 (all placeholders), edit/page.tsx:80 (placeholder), signup/page.tsx:77-80 (email-confirmation screen).
- **الحل:** Move every literal into the existing settings/billing/analysis/edit/auth namespaces in messages/ar.json + en.json and reference via the t() instances already present in these files.
- **الحالة:** ⬜

### 82. Error boundaries and 404 pages hardcoded Arabic (and may expose raw error.message)

- **الملف:** `app/[locale]/(dashboard)/error.tsx:15`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** app/[locale]/(dashboard)/error.tsx:15-20 and (auth)/error.tsx:15-19 hardcode Arabic headings/buttons even though they live under [locale] and could use translations; they also render raw error.message to users. app/not-found.tsx:12-25 and global-error.tsx:19-26 are Arabic-only (acceptable outside [locale], but inconsistent with app/[locale]/not-found.tsx which does the isAr ternary).
- **الحل:** In the [locale] error boundaries use useTranslations (client components under NextIntlClientProvider) or the isAr pattern used by [locale]/not-found.tsx; show a generic translated message instead of error.message.
- **الحالة:** ⬜

### 83. Form labels not programmatically associated with inputs across studio forms

- **الملف:** `app/[locale]/(dashboard)/voiceover/page.tsx:102`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** The codebase has 56 <Label> usages but only 11 htmlFor attributes. E.g. voiceover/page.tsx:102-103 (Label + textarea with no id), analysis/page.tsx:66-81 (five labeled inputs, none associated), edit/page.tsx:80. Screen readers announce these textareas/inputs with no name; clicking the label doesn't focus the field. Settings' name input relies on placeholder only (settings/page.tsx:96).
- **الحل:** Give each input/textarea an id and set htmlFor on its Label (shadcn Label supports it), or wrap the control inside the label. For placeholder-only inputs add an explicit label or aria-label.
- **الحالة:** ⬜

### 84. Meaningful generated-content images rendered with alt="" (decorative)

- **الملف:** `components/shared/GenerationHistory.tsx:47`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** Generated/user-content images are marked decorative, hiding them from assistive tech: GenerationHistory.tsx:47 (history thumbnails inside buttons — the buttons end up with no accessible name at all), AssetCard.tsx:47, CampaignPlanDisplay.tsx:107 (campaign post visuals), edit/page.tsx:58 (image being edited), PhotoshootForm.tsx:82 and CreatorForm.tsx:124 (uploaded reference/product previews).
- **الحل:** Provide meaningful alt text (prompt excerpt, 'المنتج المرفوع', studio + date) or, for the history thumbnails, an aria-label on the wrapping button describing the generation.
- **الحالة:** ⬜

---

## 🔵 منخفضة — صقل نهائي (31)

### 85. Two consecutive surface-background sections break the alternating section rhythm

- **الملف:** `components/landing/InteractiveDemo.tsx:30`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The page alternates bg default / bg-[var(--color-surface)] to delimit sections, but HowItWorks (HowItWorks.tsx:34) and InteractiveDemo (line 30) are both bg-[var(--color-surface)] back-to-back, merging into one undifferentiated ~1000px block. Relatedly, SocialProof.tsx places bg-[var(--color-surface)] testimonial cards on a bg-[var(--color-surface)] section (lines 34 and 60), so cards are distinguished only by a 50%-opacity border and nearly disappear in dark mode.
- **الحل:** Give InteractiveDemo the default page background (remove bg-[var(--color-surface)]), and change SocialProof card backgrounds to bg-[var(--color-bg)] or var(--color-surface-2) so they separate from the section.
- **الحالة:** ⬜

### 86. Hero glow uses undefined --color-primary-light, falling back to off-brand violet #7C3AED

- **الملف:** `components/landing/HeroSection.tsx:73`
- **البُعد:** صفحة الهبوط
- **المشكلة:** Line 73 references var(--color-primary-light, rgba(124,58,237,0.10)), but --color-primary-light is not defined anywhere in app/globals.css (verified), so the fallback always wins: rgba(124,58,237,…) is violet-600 (#7C3AED), not the brand indigo primary-500 (#6366F1 per tailwind.config.ts). The largest color field on the page is therefore permanently off-brand by a full hue step.
- **الحل:** Either define --color-primary-light: rgba(99,102,241,0.10) in globals.css (:root and .dark), or replace the var() with bg-primary-500/10 via an arbitrary radial-gradient using #6366F1.
- **الحالة:** ⬜

### 87. 5 pricing cards in sm:grid-cols-2 leave an orphan card; lg:grid-cols-5 cramps cards at 1024px

- **الملف:** `components/landing/PricingSection.tsx:31`
- **البُعد:** صفحة الهبوط
- **المشكلة:** With exactly 5 plans, sm:grid-cols-2 produces rows of 2/2/1 with a lone Agency card stuck at the start edge on tablets, and lg:grid-cols-5 squeezes five cards into ~180px columns at the 1024px breakpoint — feature list text ('هويات بصرية غير محدودة') wraps awkwardly and the highlighted Pro card loses prominence.
- **الحل:** Use sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 (or a 2xl breakpoint for 5-up), and add sm:last:col-span-2 sm:last:max-w-sm sm:last:mx-auto (or reorder so Pro is centered) to handle the orphan.
- **الحالة:** ⬜

### 88. Copy contradiction: 'أكثر من 9 استوديوهات' vs the exact '9 استوديوهات' claimed everywhere else

- **الملف:** `components/landing/FinalCta.tsx:60`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The closing line says 'أكثر من 9 استوديوهات جاهزة تنتظرك' (more than 9 studios), while the hero stats bar (HeroSection.tsx:193), StatsSection, and StudiosShowcase heading all state exactly 9. An inflated count in the final CTA is exactly the kind of small dishonesty that erodes the 'بدون مفاجآت' positioning.
- **الحل:** Change to '9 استوديوهات جاهزة تنتظرك'.
- **الحالة:** ⬜

### 89. Hero subtitle paragraph is marked up as <h2>, polluting the heading hierarchy

- **الملف:** `components/landing/HeroSection.tsx:120`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The subheadline ('اكتب فكرتك — Pyra AI تحوّلها...') is a motion.h2 (lines 120-127), so the document outline reads: h1 → h2 (a sentence of body copy) → h2 'ليش PyraSuite؟' → h2 'ثلاث خطوات'…. Screen-reader heading navigation and SEO both treat a marketing sentence as a section heading of equal rank to the real section titles.
- **الحل:** Change motion.h2 to motion.p; keep the same classes.
- **الحالة:** ⬜

### 90. Brand persona name flips between Latin 'Pyra AI' and Arabic 'بايرا' mid-copy

- **الملف:** `components/landing/HeroSection.tsx:124`
- **البُعد:** صفحة الهبوط
- **المشكلة:** The same persona is named 'Pyra AI' in Latin script inside Arabic sentences (HeroSection.tsx:124 'Pyra AI تحوّلها', HowItWorks.tsx:18 'Pyra AI تشتغل 🦊', SocialProof.tsx:10, FaqSection.tsx:9) but 'بايرا' in others (StudiosShowcase.tsx:87/105, FinalCta.tsx:34, Footer.tsx:35). Latin tokens inside RTL sentences also create bidi direction hops. For an 'Arabic-first, not translated' product this inconsistency is directly against the pitch.
- **الحل:** Standardize on 'بايرا' for the persona in Arabic running copy and reserve Latin 'Pyra AI' for the engine label in badges/logos ('مدعوم بمحرك Pyra AI'), per the CLAUDE.md identity guidance.
- **الحالة:** ⬜

### 91. Mixed Arabic dialects within single sentences across the page

- **الملف:** `components/landing/StudiosShowcase.tsx:87`
- **البُعد:** صفحة الهبوط
- **المشكلة:** Copy mixes Gulf markers ('إيش تبي', 'الحين', 'ما فيه', 'أبي', 'تستاهل') with Egyptian/Levantine 'مش' — sometimes in the same sentence, e.g. line 87 'مش عارف توصف؟' next to line 105 'إنت بس تقول لبايرا إيش تبي', and ValuePillars.tsx:19 'مش ترجمة. مش تعريب' beside 'تفهم لهجتك'. For a product whose #1 pillar is dialect authenticity, inconsistent register within one page weakens the claim (unless a deliberate 'white dialect' guide exists — none is documented in the repo).
- **الحل:** Pick one register (Gulf-leaning white dialect fits the target market and most existing copy), replace 'مش' with 'مو/ما هي' consistently, and document the choice in a copy style note so future sections match.
- **الحالة:** ⬜

### 92. User dropdown has two menu items pointing to the same /settings page

- **الملف:** `components/layout/TopBar.tsx:117`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** 'الملف الشخصي' (t('settings.profile')) and 'الإعدادات' (t('nav.settings')) both link to /settings with identical behavior — a duplicate that makes the menu look broken when both land on the same screen. Meanwhile the menu lacks a Billing/Credits link, which is the destination users most often hunt for from the avatar menu.
- **الحل:** Keep one Settings item and replace the duplicate with a Billing item (`<Link href="/billing">` with CreditCard icon), or make Profile deep-link to a profile section anchor.
- **الحالة:** ⬜

### 93. Inconsistent page containers: settings is start-aligned max-w-2xl, billing is centered max-w-6xl, dashboard is full-width

- **الملف:** `app/[locale]/(dashboard)/settings/page.tsx:67`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** Settings uses `p-6 space-y-6 max-w-2xl` WITHOUT `mx-auto`, so on desktop the whole page hugs the start edge with a huge blank area on the other side; billing/page.tsx:82 uses `p-6 max-w-6xl mx-auto` (centered); dashboard/page.tsx:34 uses bare `p-6` (full width). There is also no shared page-header component — each page hand-rolls its own h1 with different spacing. Navigating between the three shell pages makes content visibly jump between alignments and widths.
- **الحل:** Add `mx-auto` to settings (and standardize on a shared PageContainer/PageHeader component with an agreed max-width per page type: forms max-w-2xl mx-auto, marketing-style pages max-w-6xl mx-auto).
- **الحالة:** ⬜

### 94. Settings page mixes hardcoded Arabic strings into the translated UI

- **الملف:** `app/[locale]/(dashboard)/settings/page.tsx:44`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** Toasts ('تم تحديث الملف الشخصي', 'فشل التحديث', 'حدث خطأ في الشبكة', lines 44-50), the name placeholder 'الاسم' (line 96), save/cancel buttons ('جاري الحفظ...', 'حفظ', 'إلغاء', lines 107-110), the 'قانوني' card and its links (lines 187-192), and the logout button 'تسجيل الخروج' (line 201) are all hardcoded Arabic while the surrounding page uses t('settings.*'). English users see a half-translated settings page.
- **الحل:** Move all literals into messages/ar.json and messages/en.json under `settings.*` / `common.*` and use `t()`; same for ActivityTimeline's empty state ('لم تقم بأي نشاط بعد...', components/dashboard/ActivityTimeline.tsx:56) and its 'ar-SA' date formatting (line 78).
- **الحالة:** ⬜

### 95. Welcome heading renders a dangling Arabic comma while profile loads and in English locale

- **الملف:** `app/[locale]/(dashboard)/dashboard/page.tsx:38`
- **البُعد:** هيكل الداشبورد
- **المشكلة:** `{t('dashboard.welcome')}، {profile?.name || ''}` hardcodes the Arabic comma '،' outside the translation. Until useUser resolves (and for users with no name), the h1 reads 'أهلاً بك، ' with a trailing comma and nothing after it; in the English locale the Arabic comma appears mid-sentence ('Welcome، John').
- **الحل:** Use an ICU message with the name as a parameter — `welcome: "أهلاً بك، {name}"` / `"Welcome, {name}"` — and render `t('dashboard.welcome', { name: profile?.name ?? '' })` only once profile is loaded (or fall back to a name-less variant `welcomeGeneric`).
- **الحالة:** ⬜

### 96. Character counters missing on most limited textareas (present only in 3 studios)

- **الملف:** `components/studios/campaign/CampaignForm.tsx:65`
- **البُعد:** الاستوديوهات
- **المشكلة:** Creator (CreatorForm line 116), voiceover (line 106), and prompt-builder (line 67) show 'n/max' counters, but other inputs with the same silent maxLength truncation do not: campaign productDescription maxLength=2000 (line 70), photoshoot notes maxLength=500 (PhotoshootForm line 160), storyboard concept maxLength=1000 (page line 62), analysis description maxLength=2000 (page line 78), edit description maxLength=500 (page line 80). Users hitting the cap in those studios get no feedback about why typing stops.
- **الحل:** Add the same counter row used in CreatorForm ({value.length}/{max}, text-xs text-end text-[var(--color-text-muted)]) under each limited textarea — ideally by extracting a shared LimitedTextarea component since the textarea className string is already copy-pasted in 8 files.
- **الحالة:** ⬜

### 97. Six studios build inputs as plain divs with onClick buttons instead of forms — Enter never submits

- **الملف:** `app/[locale]/(dashboard)/plan/page.tsx:62`
- **البُعد:** الاستوديوهات
- **المشكلة:** Creator, photoshoot, and campaign wrap inputs in <form onSubmit> so Enter in a text field submits. Plan (line 62), analysis (line 64), storyboard (line 60), voiceover (line 98), edit (line 52), and prompt-builder (line 55) render bare <div className="space-y-4/5"> with a click-only Button, so pressing Enter after typing the business name does nothing, and there are no form semantics for assistive tech. Selection buttons in these pages also drop the aria-pressed attribute that CreatorForm/PhotoshootForm consistently set (e.g. plan goal chips line 69, storyboard style buttons line 69, analysis industry chips line 71, edit types line 75).
- **الحل:** Wrap the six inline input panels in <form onSubmit={(e)=>{e.preventDefault(); handleGenerate();}}> with type="submit" on the generate Button, and add aria-pressed to all toggle-style option buttons.
- **الحالة:** ⬜

### 98. Voiceover waveform bars use Math.random() in render — heights jump on every play/pause

- **الملف:** `app/[locale]/(dashboard)/voiceover/page.tsx:251`
- **البُعد:** الاستوديوهات
- **المشكلة:** The 20 decorative waveform bars compute style={{height: `${12 + Math.random()*24}px`}} inline during render (line 251). Every state change that re-renders the preview (clicking Play, Pause, audio ending) regenerates all 20 random heights, so the whole waveform visibly reshuffles each time the user toggles playback — it reads as a glitch rather than a waveform.
- **الحل:** Memoize the heights once per generated audio, e.g. const bars = useMemo(() => Array.from({length: 20}, () => 12 + Math.random()*24), [audioUrl]); and map over bars.
- **الحالة:** ⬜

### 99. Credit-cost display inconsistencies: hardcoded values, untranslated tooltip, and admin-overridable costs shown as constants

- **الملف:** `components/studios/creator/CreatorForm.tsx:237`
- **البُعد:** الاستوديوهات
- **المشكلة:** Small cost/UI drift across studios: edit page passes a literal <CreditCost cost={1} /> (edit page line 82) instead of CREDIT_COSTS.edit; PhotoshootForm duplicates the server's SHOT_COSTS table as its own hardcoded '{n} credits' English labels (PhotoshootForm lines 31-35, 146) instead of a translated string; CampaignForm shows static CREDIT_COSTS.campaign (line 174) while the campaign API charges getEffectiveCost(studioConfig,...) which admins can override — the displayed price can silently differ from the charged price; and the 'Surprise Me' shuffle button tooltip is hardcoded English (CreatorForm line 237).
- **الحل:** Use CREDIT_COSTS constants everywhere a cost is displayed, translate the '{n} credits' and 'Surprise Me' strings, and expose the effective (admin-configured) cost to the client (e.g. via a /api/credits/costs fetch or page props) so displayed cost always matches the charge.
- **الحالة:** ⬜

### 100. --radius token is dead and the radius scale is applied arbitrarily to the same tile pattern

- **الملف:** `app/globals.css:31`
- **البُعد:** نظام التصميم
- **المشكلة:** globals.css declares `--radius: 0.5rem` (line 31) but tailwind.config.ts has no borderRadius mapping, so no class ever consumes it — components hardcode radii instead, inconsistently for the same visual pattern: selectable card-tiles are `rounded-lg` in ModelSelector.tsx:43 and ResolutionSelector.tsx:35 but `rounded-xl` in PersonaSelector.tsx:51, PromptTemplateLibrary.tsx:89, ModelComparison.tsx:61 and coming-soon-banner.tsx:14; containers are `rounded-lg` (Card:8, Dialog:37) but controls are `rounded-md` (button, input, dropdown). Cards inside the same page visibly disagree on corner rounding.
- **الحل:** Wire the token in tailwind.config.ts per shadcn convention: `borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' }`, then normalize tiles: pick one radius for the 'selectable tile' pattern (rounded-lg) and apply it in PersonaSelector.tsx:51, PromptTemplateLibrary.tsx:89, ModelComparison.tsx:61 and coming-soon-banner.tsx:14.
- **الحالة:** ⬜

### 101. Badge carries focus:ring styles on a non-focusable div, using focus: instead of the system's focus-visible:

- **الملف:** `components/ui/badge.tsx:6`
- **البُعد:** نظام التصميم
- **المشكلة:** badgeVariants includes `focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2` but Badge renders a plain <div> that can never receive focus — dead CSS. It also uses the `focus:` prefix while Button/Input standardize on `focus-visible:` (dialog.tsx:43 close button has the same `focus:` drift). This creates two competing focus conventions in components/ui for anyone copying these primitives.
- **الحل:** Remove the focus classes from badge.tsx:6 (or convert them to `focus-visible:` and only expect them to apply when Badge wraps an interactive element), and change `focus:` to `focus-visible:` on the DialogClose button in dialog.tsx:43 to match Button/Input.
- **الحالة:** ⬜

### 102. slideInLeft/slideInRight variants use physical x offsets — hero entrance slides from the wrong side in the English locale

- **الملف:** `lib/animations.ts:19`
- **البُعد:** RTL
- **المشكلة:** slideInRight (x: 60) and slideInLeft (x: -60) are fixed physical offsets. components/landing/HeroSection.tsx uses slideInRight for the text column (lines 97-145) and slideInLeft for the visual column (line 155) — correct for the RTL default, but in the en (LTR) locale the layout mirrors while the animations do not: the left-hand text column enters moving leftwards from the right (against reading direction), and the right-hand visual enters from the left. The entrance motion reads backwards for English visitors.
- **الحل:** Make the variants direction-aware, e.g. export const slideInStart = (dir: 'ltr' | 'rtl'): Variants => ({ hidden: { x: dir === 'rtl' ? 60 : -60, opacity: 0 }, visible: { x: 0, opacity: 1, … } }) and pass the locale direction from the consuming component (useLocale/document.dir).
- **الحالة:** ⬜

### 103. Weekly challenge 'ابدأ' arrow points backwards in Arabic (double-flip)

- **الملف:** `components/dashboard/WeeklyChallenge.tsx:43`
- **البُعد:** RTL
- **المشكلة:** The dashboard challenge card CTA uses <ArrowLeft className="rtl:rotate-180"/>, which renders a right-pointing arrow in the Arabic RTL UI — the 'back' direction — next to a forward action.
- **الحل:** Replace with <ArrowRight className="h-3 w-3 rtl:rotate-180" />.
- **الحالة:** ⬜

### 104. 'Open in studio' ArrowRight lacks rtl:rotate-180 — points backwards in Arabic

- **الملف:** `app/[locale]/(dashboard)/prompt-builder/page.tsx:114`
- **البُعد:** RTL
- **المشكلة:** The icon-only button that sends a generated prompt to a studio renders <ArrowRight className="h-3 w-3"/> with no RTL flip. In the Arabic UI it points right (back direction), inconsistent with the rest of the app's flipped directional icons, and as an icon-only affordance the direction is its entire meaning. (It also has no accessible label.)
- **الحل:** Add the flip: <ArrowRight className="h-3 w-3 rtl:rotate-180" /> (and consider aria-label/title, e.g. 'افتح في الاستوديو').
- **الحالة:** ⬜

### 105. Toaster hardcodes dir="rtl" — English locale gets mirrored toasts

- **الملف:** `components/providers/ToastProvider.tsx:5`
- **البُعد:** RTL
- **المشكلة:** <Toaster … dir="rtl"/> is rendered from the locale-aware layout, but ignores the locale: on /en, toast layout, icon side and close-button placement are mirrored RTL around English text.
- **الحل:** Make it locale-aware: const locale = useLocale(); <Toaster position="top-center" richColors closeButton dir={locale === 'ar' ? 'rtl' : 'ltr'} /> (sonner also accepts dir="auto").
- **الحالة:** ⬜

### 106. Command palette hardcodes dir="rtl" (and Arabic-only labels) regardless of locale

- **الملف:** `components/shared/CommandPalette.tsx:86`
- **البُعد:** RTL
- **المشكلة:** <Command dir="rtl"> forces RTL layout of the ⌘K palette even in the English locale, and all group/command labels (lines 36-61) plus the input placeholder (line 88) are hardcoded Arabic, so English users get a mirrored, untranslated palette.
- **الحل:** Derive direction from the active locale (const locale = useLocale(); dir={locale === 'ar' ? 'rtl' : 'ltr'}) and move labels/placeholder into messages/ar.json + en.json via useTranslations.
- **الحالة:** ⬜

### 107. DialogFooter uses sm:space-x-2 without space-x-reverse — button spacing collapses in RTL

- **الملف:** `components/ui/dialog.tsx:57`
- **البُعد:** RTL
- **المشكلة:** Tailwind v3 space-x-* applies margin-left to following siblings, which does not flip with direction: in the RTL app, footer buttons would render touching each other with a stray margin at the far end. The component is currently only exported (no in-repo usage yet), but it is the shared primitive every future dialog footer will use, so it is a latent RTL defect in the design system.
- **الحل:** Replace 'sm:space-x-2' with 'sm:gap-2' (gap is direction-agnostic and the container is already flex): className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2', className)}.
- **الحالة:** ⬜

### 108. Focus rings use ring-offset-white — white halo around focused controls in dark mode

- **الملف:** `components/ui/button.tsx:7`
- **البُعد:** الوضع الداكن
- **المشكلة:** Button base classes include 'ring-offset-white' (line 7) and DialogClose in components/ui/dialog.tsx:43 also uses 'ring-offset-white'. When a user tabs to any button or the dialog close icon in dark mode, the focus ring is separated by a hardcoded white offset band that flashes against dark surfaces. Input.tsx:10 already does this correctly with 'ring-offset-[var(--color-surface)]'.
- **الحل:** Replace 'ring-offset-white' with 'ring-offset-[var(--color-surface)]' in button.tsx line 7 and dialog.tsx line 43 to match the Input component.
- **الحالة:** ⬜

### 109. SWOT and KPI grids fixed at 2 columns on mobile — ~140px-wide quadrants

- **الملف:** `app/[locale]/(dashboard)/analysis/page.tsx:106`
- **البُعد:** الموبايل
- **المشكلة:** `renderSwot` uses `grid grid-cols-2 gap-3` (line 106) and the KPIs tab also uses `grid grid-cols-2` (line 125) with no responsive prefix. Inside the stacked preview panel on a 360px phone each quadrant is ~150px wide with p-4 padding, so the text-xs Arabic bullet lists wrap to 1-2 words per line and the SWOT matrix becomes hard to read.
- **الحل:** Use `grid-cols-1 sm:grid-cols-2` for both grids (SWOT still reads correctly stacked S→W→O→T on phones); alternatively `min-[420px]:grid-cols-2` if the 2x2 matrix shape must be kept.
- **الحالة:** ⬜

### 110. Fixed text-5xl stat numbers in a 2-column mobile grid risk wrapping/overflow

- **الملف:** `components/landing/StatsSection.tsx:55`
- **البُعد:** الموبايل
- **المشكلة:** Stats render at a non-responsive `text-5xl` inside `grid grid-cols-2` (line 47). On 320–375px screens each cell is ~140–165px; the value '10 دقائق' (number + Arabic suffix) at 48px font exceeds that width and wraps awkwardly mid-value or collides with the neighboring column.
- **الحل:** Make the size responsive: `text-3xl sm:text-4xl lg:text-5xl`, and add `whitespace-nowrap` to the counter with the suffix on its own smaller line if needed.
- **الحالة:** ⬜

### 111. Per-image download button: icon-only, unlabeled, hover-only reveal

- **الملف:** `components/studios/creator/CreatorPreview.tsx:136`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** The overlay download button (lines 136-140) has no aria-label and is opacity-0 until group-hover, so keyboard users can't see it when focused and screen-reader users hear an unnamed button.
- **الحل:** Add aria-label (t('studio.download')) and focus-visible:opacity-100 to the button's class list.
- **الحالة:** ⬜

### 112. Favorite star toggle has no accessible name, no aria-pressed, color-only state

- **الملف:** `components/shared/PromptHistory.tsx:81`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** The star button (line 81) toggles favorite state indicated only by amber vs muted color/fill; no aria-label or aria-pressed. The adjacent copy button (line 82) is also icon-only and unlabeled.
- **الحل:** Add aria-label ('إضافة للمفضلة' via i18n) and aria-pressed={p.is_favorite} to the star; aria-label ('نسخ') to the copy button.
- **الحالة:** ⬜

### 113. aria-labels hardcoded in English in the Arabic-first app (and Arabic in NavBar)

- **الملف:** `components/layout/TopBar.tsx:57`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** TopBar icon buttons use English aria-labels ('Toggle menu' line 57, 'Toggle theme' line 83, 'Switch language' line 94), Sidebar uses English (lines 131, 138), while the landing NavBar hamburger uses Arabic ('القائمة', NavBar.tsx:66). Arabic screen-reader users hear English control names and vice versa; the pattern is inconsistent.
- **الحل:** Translate all aria-labels through t() (add nav.a11y.* keys in both message files) so they follow the active locale.
- **الحالة:** ⬜

### 114. Coming-soon banner concatenates Arabic and English into one bilingual string

- **الملف:** `components/ui/coming-soon-banner.tsx:21`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** Line 21 renders '🚧 {featureNameAr} — قريباً | {featureName} — Coming Soon' in both locales simultaneously instead of the active language, producing a cluttered mixed-direction line (RTL Arabic + LTR English separated by a pipe) on soon-pages like Video/Projects/Community.
- **الحل:** Use useLocale() to render only the active language ('🚧 {name} — قريباً' vs '🚧 {name} — Coming Soon'), with strings in the message files.
- **الحالة:** ⬜

### 115. Landing demo input has no label or accessible name

- **الملف:** `components/landing/InteractiveDemo.tsx:36`
- **البُعد:** وصولية/i18n/براند
- **المشكلة:** The 'try it yourself' prompt input (lines 36-41) relies on placeholder only — no <label>, no aria-label — so it is announced without a name and the placeholder disappears once the user types.
- **الحل:** Add aria-label (translated 'اكتب فكرتك' / 'Describe your idea') or a visually-hidden label element.
- **الحالة:** ⬜

---
