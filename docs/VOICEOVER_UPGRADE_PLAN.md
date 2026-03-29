# خطة تطوير استوديو التعليق الصوتي — PyraSuite

> Created: 2026-03-29 | Status: Ready for Implementation

---

## 1. تحليل الوضع الحالي

### ما يشتغل فعلياً:
- ✅ OpenAI TTS (`tts-1` model) — يولّد صوت حقيقي
- ✅ 5 أصوات (male_pro→onyx, female_pro→nova, male_youth→echo, female_youth→shimmer, male_formal→fable)
- ✅ سرعة (0.75x / 1x / 1.25x) — تشتغل فعلياً
- ✅ تحميل MP3 — يشتغل
- ✅ Audio player — يشغّل الصوت

### ما لا يشتغل (cosmetic فقط):
- ❌ **اللهجة** — selector موجود لكن لا يؤثر على الصوت (OpenAI TTS لا يدعم لهجات عربية)
- ❌ **النبرة** — selector موجود لكن لا يؤثر (OpenAI TTS لا يدعم emotion control)
- ❌ **جودة الصوت** — مستوى واحد فقط (tts-1)
- ❌ **موسيقى خلفية** — غير موجودة
- ❌ **تحسين النص** — لا يحسّن النص قبل التوليد
- ❌ **SSML** — لا يدعم وقفات أو تشديد

---

## 2. تحليل المنافسين

### ElevenLabs
- **أصوات عربية:** 10+ أصوات عربية (ذكر/أنثى) + cloning
- **لهجات:** سعودي، مصري، خليجي، فصحى
- **جودة:** Turbo (سريع) / Standard / HD
- **Emotion:** يدعم 5+ نبرات عبر style tags
- **السعر:** $5/mo (30 min) → $22/mo (100 min) → $99/mo (500 min)
- **API:** REST API كامل مع streaming

### Play.ht
- **أصوات عربية:** 5+ أصوات
- **لهجات:** محدودة (فصحى + مصري)
- **جودة:** Standard / HD
- **السعر:** $31/mo (200K chars)

### Google Cloud TTS
- **أصوات عربية:** WaveNet (6 أصوات) + Standard (4)
- **لهجات:** ar-XA (فصحى فقط)
- **SSML:** كامل (وقفات، تشديد، سرعة)
- **السعر:** $4/million chars (Standard) / $16/million (WaveNet)

### OpenAI TTS (الحالي)
- **أصوات عربية:** 0 متخصصة (6 أصوات إنجليزية تنطق عربي)
- **لهجات:** لا يدعم
- **جودة:** tts-1 (عادي) / tts-1-hd (عالي)
- **السعر:** $15/million chars (tts-1) / $30/million (tts-1-hd)

### الخلاصة:
**ElevenLabs هو الأفضل للعربي** — أكثر أصوات، أفضل لهجات، emotion control. المستخدم عنده مفتاح ElevenLabs = الخيار المثالي.

---

## 3. هيكل المميزات حسب الاشتراك

### 🆓 Free (25 credits)
| الميزة | الحالة |
|--------|--------|
| أصوات | 2 فقط (رجل + امرأة — OpenAI basic) |
| مدة قصوى | 30 ثانية |
| جودة | Standard |
| لهجة | فصحى فقط |
| سرعة | 3 مستويات |
| نبرة | ❌ غير متاح |
| موسيقى خلفية | ❌ غير متاح |
| تحسين النص | ❌ غير متاح |
| Watermark صوتي | ✅ "PyraSuite" في البداية |
| التكلفة | 1 credit / 30s |

### ⭐ Starter ($12/mo)
| الميزة | الحالة |
|--------|--------|
| أصوات | 5 أصوات (كل أصوات OpenAI) |
| مدة قصوى | 60 ثانية |
| جودة | HD (tts-1-hd) |
| لهجة | فصحى + سعودي |
| سرعة | 5 مستويات (0.5x → 1.5x) |
| نبرة | ❌ غير متاح |
| موسيقى خلفية | ❌ غير متاح |
| تحسين النص | ✅ تحسين بسيط |
| Watermark | ❌ بدون |
| التكلفة | 1 credit / 30s |

### 🔥 Pro ($29/mo)
| الميزة | الحالة |
|--------|--------|
| أصوات | 10+ أصوات (OpenAI + ElevenLabs) |
| مدة قصوى | 120 ثانية |
| جودة | HD |
| لهجة | كل اللهجات (سعودي، مصري، إماراتي، خليجي، فصحى) |
| سرعة | 5 مستويات |
| نبرة | ✅ 4 نبرات (احترافي، ودود، حماسي، هادئ) |
| موسيقى خلفية | ✅ 5 خيارات |
| تحسين النص | ✅ تحسين كامل مع [وقفات] و*تشديد* |
| Watermark | ❌ بدون |
| التكلفة | 2 credits / 30s (لأن ElevenLabs أغلى) |

### 🏢 Business ($59/mo)
| الميزة | الحالة |
|--------|--------|
| كل مميزات Pro | ✅ |
| مدة قصوى | 300 ثانية (5 دقائق) |
| Voice Cloning | ✅ استنساخ صوت مخصص |
| أصوات مميزة | ✅ Premium ElevenLabs voices |
| أولوية | ✅ توليد أسرع |
| التكلفة | 2 credits / 30s |

### 🏭 Agency ($149/mo)
| الميزة | الحالة |
|--------|--------|
| كل مميزات Business | ✅ |
| مدة قصوى | 600 ثانية (10 دقائق) |
| Batch generation | ✅ توليد دفعة واحدة |
| API Access | ✅ واجهة برمجية |
| التكلفة | 2 credits / 30s |

---

## 4. هيكل تكلفة الكريدت

| الميزة | التكلفة |
|--------|---------|
| Standard quality (OpenAI tts-1) | 1 credit / 30s |
| HD quality (OpenAI tts-1-hd) | 1.5 credits / 30s |
| ElevenLabs voices | 2 credits / 30s |
| + موسيقى خلفية | +0.5 credit |
| + تحسين النص بالـ AI | +0.5 credit |
| Voice Cloning session | 5 credits (مرة واحدة) |

---

## 5. خطة التنفيذ التقنية

### Phase 1: تشغيل المميزات الموجودة (OpenAI improvements)
**المدة:** يوم واحد

1. **تفعيل HD quality** — استخدام `tts-1-hd` model للمشتركين
2. **تحسين النص قبل التوليد** — استخدام `buildVoiceOverPrompt()` الموجود
3. **تفعيل النبرة** — إضافة instructions للنص قبل TTS
4. **تفعيل اللهجة** — إعادة كتابة النص بلهجة محددة عبر AI prompt

**ملفات تتغير:**
- `app/api/studios/voiceover/route.ts` — إضافة script enhancement + quality tier
- `lib/ai/prompts/voiceover.ts` — تحسين الـ prompt builder

### Phase 2: إضافة ElevenLabs (Premium voices)
**المدة:** يومين

1. **إنشاء ElevenLabs client** — `lib/ai/elevenlabs.ts`
2. **Voice router** — Free/Starter = OpenAI, Pro+ = ElevenLabs
3. **أصوات عربية** — تحميل قائمة الأصوات من ElevenLabs API
4. **Emotion control** — ElevenLabs يدعم `stability` + `similarity_boost` params

**ملفات جديدة:**
- `lib/ai/elevenlabs.ts` — ElevenLabs API client
- `lib/ai/tts-router.ts` — routes between OpenAI and ElevenLabs based on plan

**ملفات تتغير:**
- `app/api/studios/voiceover/route.ts` — use TTS router
- `.env.local.example` — add `ELEVENLABS_API_KEY`

### Phase 3: تحديث الـ UI
**المدة:** يوم واحد

1. **Voice selector** — تصنيف الأصوات حسب الخطة (مع قفل 🔒 على المتميزة)
2. **Quality selector** — Standard / HD مع badge كريدت
3. **اللهجة تشتغل فعلياً** — يكتب بالفصحى → AI يحوّل للهجة → TTS يقرأ
4. **النبرة تشتغل فعلياً** — AI يعيد كتابة النص بالنبرة المطلوبة
5. **Duration limit** — حسب الخطة (30s/60s/120s/300s/600s)
6. **Lock icons** — على المميزات اللي تحتاج ترقية

**ملفات تتغير:**
- `app/[locale]/(dashboard)/voiceover/page.tsx` — UI redesign

### Phase 4: موسيقى خلفية
**المدة:** يوم واحد

1. **5 background tracks** — ملفات MP3 جاهزة في `/public/audio/`
2. **Audio mixing** — دمج الصوت مع الموسيقى server-side (ffmpeg أو Web Audio API)
3. **Volume control** — مستوى صوت الموسيقى (25%/50%/75%)

### Phase 5: Voice Cloning (Business+)
**المدة:** يومين

1. **Upload voice sample** — 30 ثانية صوت المستخدم
2. **ElevenLabs voice cloning API** — `POST /v1/voices/add`
3. **Custom voice في القائمة** — يظهر ضمن أصوات المستخدم

---

## 6. Environment Variables المطلوبة

```bash
# إضافة في .env.local و Coolify
ELEVENLABS_API_KEY=your_key_here
```

---

## 7. أولوية التنفيذ

```
Phase 1 (يوم) → تشغيل اللهجة + النبرة + HD + تحسين النص
Phase 2 (يومين) → ElevenLabs integration + voice router
Phase 3 (يوم) → UI update مع plan-based locks
Phase 4 (يوم) → موسيقى خلفية
Phase 5 (يومين) → Voice Cloning (اختياري)
```

**المجموع: 5-7 أيام عمل**
