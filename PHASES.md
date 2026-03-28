# PHASES.md — Pixora Development Roadmap

> 5 مراحل واضحة. كل مرحلة قابلة للـ demo المستقل.

---

## Phase 1: Foundation 🏗️
**المدة المقدّرة:** 2 أسابيع
**الهدف:** قاعدة صلبة — Auth + DB + Layout + Credit System

### ما ينبني
- Next.js 15 project setup كامل
- Supabase Auth (Email + Google OAuth)
- Database schema كامل (migrations)
- Sidebar layout مع RTL support
- Credits system (check + deduct)
- Brand Kit CRUD
- محفوظات للـ generations (Gallery)

### Demo Target
مستخدم يقدر: يسجل، يدخل، يشوف الـ sidebar، يضيف brand kit، يشوف رصيد الكريدت

---

## Phase 2: Core AI Studios 🎨
**المدة المقدّرة:** 2 أسابيع
**الهدف:** 3 استوديوهات رئيسية شغّالة

### Studios
1. **Creator** — توليد صور (Gemini + GPT + Flux)
2. **Photoshoot** — تصوير منتج احترافي
3. **Campaign Planner** — حملة 9 posts كاملة

### Demo Target
مستخدم يرفع صورة منتج → يختار الاستوديو → يولّد → يشوف النتيجة → يحمّلها

---

## Phase 3: Advanced Studios 📊
**المدة المقدّرة:** 2 أسابيع
**الهدف:** باقي الاستوديوهات

### Studios
1. **Plan** — خطة تسويقية
2. **Storyboard** — ستوري بورد فيديو
3. **Marketing Analysis** — تحليل شامل CMO-level
4. **Voice Over** — توليد صوت
5. **Edit** — تعديل صور
6. **Prompt Builder** — مساعد الـ prompts

### Demo Target
مستخدم يقدر يطلب تحليل تسويقي كامل ويحصل على PDF

---

## Phase 4: Monetization 💳
**المدة المقدّرة:** 1.5 أسبوع
**الهدف:** Stripe + Credits + Plans

### Features
1. Stripe subscriptions (5 plans)
2. One-time credit top-ups
3. Customer portal (إلغاء/ترقية)
4. Stripe webhooks (credit sync)
5. Credit balance UI + low credit warnings
6. Upgrade prompts عند نقص الكريدت
7. Invoice history

### Demo Target
مستخدم يشترك بـ Starter، يرى كريدت يُضاف، يشتري top-up

---

## Phase 5: Polish & Launch 🚀
**المدة المقدّرة:** 2 أسابيع
**الهدف:** Production-ready

### Features
1. **Analytics** — PostHog events + Sentry errors
2. **Team Collaboration** — invite members, shared credits
3. **Export** — PNG, JPG, PDF, ZIP batch
4. **Dark Mode** — complete
5. **i18n** — Arabic + English complete
6. **Video Studio** — basic (Replicate)
7. **White-label** (Business+)
8. **API Access** (Agency)
9. **Landing Page** — marketing site
10. **Performance** — Core Web Vitals green

### Demo Target
Full product demo — onboarding → brand kit → campaign → export → share
