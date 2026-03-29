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
- ❌ **اللهجة** — selector موجود لكن لا يؤثر على الصوت
- ❌ **النبرة** — selector موجود لكن لا يؤثر
- ❌ **جودة الصوت** — مستوى واحد فقط (tts-1)
- ❌ **تحسين النص** — لا يحسّن النص قبل التوليد

---

## 2. تحليل المنافسين

| | ElevenLabs | Play.ht | Google TTS | OpenAI TTS |
|---|---|---|---|---|
| أصوات عربية | 10+ | 5+ | 6 WaveNet | 0 (إنجليزية تنطق عربي) |
| لهجات | سعودي، مصري، خليجي، فصحى | فصحى + مصري | فصحى فقط | لا يدعم |
| جودة | Turbo/Standard/HD | Standard/HD | Standard/WaveNet | tts-1/tts-1-hd |
| Emotion | ✅ 5+ نبرات | محدود | ❌ | ❌ |
| السعر | $5-99/mo | $31/mo | $4-16/M chars | $15-30/M chars |

**الخلاصة:** ElevenLabs هو الأفضل للعربي.

---

## 3. هيكل المميزات حسب الاشتراك

### 🆓 Free (25 credits)
| الميزة | الحالة |
|--------|--------|
| أصوات | 2 فقط (رجل + امرأة — OpenAI basic) |
| مدة قصوى | 30 ثانية |
| جودة | Standard (tts-1) |
| لهجة | فصحى فقط |
| سرعة | 3 مستويات (0.75x / 1x / 1.25x) |
| نبرة | ❌ غير متاح |
| تحسين النص | ❌ غير متاح |
| Watermark صوتي | ✅ |
| **التكلفة** | **1 credit / 15 ثانية** |

### ⭐ Starter ($12/mo)
| الميزة | الحالة |
|--------|--------|
| أصوات | 5 أصوات (كل أصوات OpenAI) |
| مدة قصوى | 60 ثانية |
| جودة | HD (tts-1-hd) |
| لهجة | فصحى + سعودي |
| سرعة | 5 مستويات (0.5x → 1.5x) |
| نبرة | ❌ غير متاح |
| تحسين النص | ✅ تحسين بسيط |
| Watermark | ❌ بدون |
| **التكلفة** | **1 credit / 15 ثانية** |

### 🔥 Pro ($29/mo)
| الميزة | الحالة |
|--------|--------|
| أصوات | 10+ أصوات (OpenAI + ElevenLabs عربية) |
| مدة قصوى | 120 ثانية |
| جودة | HD |
| لهجة | كل اللهجات (سعودي، مصري، إماراتي، خليجي، فصحى) |
| سرعة | 5 مستويات |
| نبرة | ✅ 4 نبرات (احترافي، ودود، حماسي، هادئ) |
| تحسين النص | ✅ تحسين كامل مع [وقفات] و*تشديد* |
| Watermark | ❌ بدون |
| **التكلفة** | **3 credits / 20 ثانية** |

### 🏢 Business ($59/mo)
| الميزة | الحالة |
|--------|--------|
| كل مميزات Pro | ✅ |
| مدة قصوى | 300 ثانية (5 دقائق) |
| أصوات مميزة | ✅ Premium ElevenLabs voices |
| أولوية | ✅ توليد أسرع |
| **التكلفة** | **3 credits / 20 ثانية** |

### 🏭 Agency ($149/mo)
| الميزة | الحالة |
|--------|--------|
| كل مميزات Business | ✅ |
| مدة قصوى | 600 ثانية (10 دقائق) |
| Batch generation | ✅ توليد دفعة واحدة |
| API Access | ✅ واجهة برمجية |
| **التكلفة** | **3 credits / 20 ثانية** |

---

## 4. هيكل تكلفة الكريدت

| الخطة | المحرك | التكلفة |
|-------|--------|---------|
| Free + Starter | OpenAI TTS | **1 credit / 15 ثانية** |
| Pro + Business + Agency | ElevenLabs | **3 credits / 20 ثانية** |
| + تحسين النص بالـ AI (Starter+) | — | +0.5 credit |

---

## 5. خطة التنفيذ التقنية

### Phase 1: تشغيل المميزات الموجودة (OpenAI improvements)

1. **تفعيل HD quality** — `tts-1-hd` للمشتركين Starter+
2. **تحسين النص قبل التوليد** — AI يعيد كتابة النص بالنبرة والأسلوب المطلوب
3. **تفعيل النبرة** — إعادة صياغة النص بالنبرة (احترافي/ودود/حماسي/هادئ) قبل TTS
4. **تفعيل اللهجة** — AI يحوّل النص للهجة المطلوبة قبل TTS
5. **تحديث تكلفة الكريدت** — Free/Starter: 1cr/15s

**ملفات تتغير:**
- `app/api/studios/voiceover/route.ts`
- `lib/ai/prompts/voiceover.ts`
- `lib/credits/costs.ts`

### Phase 2: إضافة ElevenLabs (Premium voices — Pro+)

1. **ElevenLabs client** — `lib/ai/elevenlabs.ts`
2. **TTS Router** — Free/Starter→OpenAI, Pro+→ElevenLabs
3. **أصوات عربية حقيقية** — من ElevenLabs API
4. **Emotion control** — `stability` + `similarity_boost` params
5. **تحديث تكلفة الكريدت** — Pro+: 3cr/20s

**ملفات جديدة:**
- `lib/ai/elevenlabs.ts`
- `lib/ai/tts-router.ts`

### Phase 3: تحديث الـ UI

1. **Voice selector** — تصنيف حسب الخطة + قفل 🔒
2. **Quality badge** — Standard / HD
3. **Duration limit** — حسب الخطة (30s/60s/120s/300s/600s)
4. **Credit cost dynamic** — يتغير حسب الخطة والمدة
5. **Lock icons** — على المميزات المدفوعة مع UpgradePrompt

**ملفات تتغير:**
- `app/[locale]/(dashboard)/voiceover/page.tsx`

---

## 6. Environment Variables

```bash
ELEVENLABS_API_KEY=your_key_here
```

---

## 7. أولوية التنفيذ

```
Phase 1 (يوم)   → OpenAI: لهجة + نبرة + HD + تحسين نص + تسعير جديد
Phase 2 (يومين) → ElevenLabs: integration + voice router + أصوات عربية
Phase 3 (يوم)   → UI: أقفال + quality + duration limits + dynamic credits
```

**المجموع: 4 أيام عمل**
