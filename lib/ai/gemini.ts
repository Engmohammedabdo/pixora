import type { AIModel } from '@/types/studios';
import { isAllowedImageHost } from './allowed-hosts';
import { MAX_REFERENCE_IMAGE_BYTES } from '@/lib/storage/reference-image';
import { isValidApiKey } from './utils';
import { MODELS, geminiImageSize } from './models';
import { PROVIDER_TIMEOUTS, ProviderPermanentError, fetchWithTimeout } from './http';
import { mockFromSchema } from './mock-from-schema';

interface GenerateImageOptions {
  prompt: string;
  resolution: string;
  referenceImageUrl?: string;
}

interface GenerateTextOptions {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * An OpenAPI-3.0-subset schema. When present the request ASKS the model for JSON
   * of this shape instead of hoping that prose written at temperature 0.7 happens
   * to contain a parseable object. The regex scrape at each call site stays in
   * place on purpose, so a model or endpoint that ignores this degrades to the
   * previous behaviour rather than failing.
   */
  responseSchema?: Record<string, unknown>;
}

interface AIResult {
  url?: string;
  text?: string;
  model: AIModel;
  mock: boolean;
}

const MOCK_IMAGE_URLS = [
  'https://placehold.co/1080x1080/6366F1/FFFFFF?text=PyraSuite+Generated',
  'https://placehold.co/1080x1080/06B6D4/FFFFFF?text=PyraSuite+AI',
  'https://placehold.co/1080x1080/F59E0B/FFFFFF?text=PyraSuite+Studio',
  'https://placehold.co/1080x1080/10B981/FFFFFF?text=PyraSuite+Creative',
];

function getMockImageUrl(): string {
  return MOCK_IMAGE_URLS[Math.floor(Math.random() * MOCK_IMAGE_URLS.length)];
}

/**
 * Fetch a user-supplied reference image for multimodal generation.
 *
 * The URL originates from user input, so this is an SSRF sink: without a host
 * allowlist the server could be made to fetch internal addresses (cloud metadata
 * endpoints, localhost services) and the bytes would be handed to the model.
 * Mirrors the protections already applied in lib/image/watermark.ts.
 */

/**
 * In-flight requests for the same reference image, keyed by URL.
 *
 * photoshoot fans out up to SIX shots in one Promise.all and hands every one of
 * them the SAME customer photo, so the same file — capped at 20 MB — was
 * downloaded and base64-encoded once per shot. Retries multiplied it further.
 *
 * Deduped only while IN FLIGHT, deliberately: the entry is deleted as soon as it
 * settles, so the six parallel shots share one fetch and nothing holds 20 MB of
 * image bytes in module scope afterwards.
 */
const referenceImageInFlight = new Map<string, Promise<{ mimeType: string; base64: string }>>();

function fetchReferenceImage(imageUrl: string): Promise<{ mimeType: string; base64: string }> {
  const existing = referenceImageInFlight.get(imageUrl);
  if (existing) return existing;

  const pending = fetchReferenceImageUncached(imageUrl).finally(() => {
    referenceImageInFlight.delete(imageUrl);
  });
  referenceImageInFlight.set(imageUrl, pending);
  return pending;
}

async function fetchReferenceImageUncached(imageUrl: string): Promise<{ mimeType: string; base64: string }> {
  if (imageUrl.startsWith('data:')) {
    const [header, data] = imageUrl.split(',');
    if (!data) throw new Error('invalid data URL');
    // The https path below is capped at MAX_REFERENCE_IMAGE_BYTES and this one was
    // not, so the inline form was the way in that skipped the ceiling. base64
    // decodes to 3 bytes per 4 characters, so this bounds the payload WITHOUT
    // allocating it — checking Buffer.byteLength after decoding would mean doing the
    // very allocation this guard exists to prevent.
    if (Math.floor((data.length * 3) / 4) > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error('image too large');
    }
    return { mimeType: header.slice(5).split(';')[0] || 'image/png', base64: data };
  }

  const url = new URL(imageUrl);
  if (url.protocol !== 'https:') throw new Error('only HTTPS URLs allowed');
  // The allowlist lives in lib/ai/allowed-hosts.ts and is matched by exact host or
  // proper subdomain. This site used to match by bare SUFFIX, which any registrable
  // domain ending in an allowed name could join — xplacehold.co, notreplicate.delivery
  // and xoaidalleapiprodscus.blob.core.windows.net all passed.
  if (!isAllowedImageHost(url.hostname)) {
    throw new Error(`host not allowed: ${url.hostname}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(imageUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);

    const declared = parseInt(res.headers.get('content-length') || '0', 10);
    if (declared > MAX_REFERENCE_IMAGE_BYTES) throw new Error('image too large');

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_REFERENCE_IMAGE_BYTES) throw new Error('image too large');

    return {
      mimeType: res.headers.get('content-type') || 'image/png',
      base64: buf.toString('base64'),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateImage(options: GenerateImageOptions): Promise<AIResult> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!isValidApiKey(apiKey)) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { url: getMockImageUrl(), model: 'gemini', mock: true };
  }

  // Build multimodal parts (text + optional reference image)
  const requestParts: Array<Record<string, unknown>> = [{ text: options.prompt }];
  if (options.referenceImageUrl) {
    try {
      const { mimeType, base64 } = await fetchReferenceImage(options.referenceImageUrl);
      requestParts.push({ inlineData: { mimeType, data: base64 } });
    } catch (e) {
      // The photoshoot and edit studios are meaningless without the user's image:
      // generating "something else" would silently bill for the wrong result.
      throw new Error(`Reference image could not be loaded: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  const imageSize = geminiImageSize(options.resolution);

  // 4K/2K are billed at a premium, so the request must actually ask for them.
  // Previously `options.resolution` was accepted and never sent, so every plan
  // received a 1K image while 4K was charged at 4x.
  const model = imageSize === '4K' ? MODELS.geminiImagePro : MODELS.geminiImage;

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: requestParts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { imageSize },
        },
      }),
    },
    PROVIDER_TIMEOUTS.image,
    'gemini'
  );

  if (!response.ok) {
    // Classified, so the retry policy can tell a 503 (worth another attempt) from
    // a 401 (a rotated key — three attempts is three paid failures).
    throw new ProviderPermanentError(`Gemini image API error: ${response.status}`, response.status);
  }

  const data = await response.json();
  const responseParts = data.candidates?.[0]?.content?.parts;

  const imagePart = responseParts?.find((p: Record<string, unknown>) => p.inlineData);
  const inlineData = imagePart?.inlineData as { data: string; mimeType: string } | undefined;
  if (inlineData) {
    const base64 = inlineData.data;
    const mimeType = inlineData.mimeType;
    return {
      url: `data:${mimeType};base64,${base64}`,
      model: 'gemini',
      mock: false,
    };
  }

  throw new Error('No image generated by Gemini');
}

export async function generateText(options: GenerateTextOptions): Promise<AIResult> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  if (!isValidApiKey(apiKey)) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Built from the schema the CALLER asked for. This used to be
    // `getMockCampaignText()` unconditionally, so a plan request came back as
    // campaign JSON and `POST /api/studios/plan` returned 500
    // generation_parse_failed on every call with no key configured — which is
    // the normal state of a fresh clone. Four of the five text studios were
    // unusable locally and the symptom blamed the parser.
    // A caller with no schema keeps the old campaign fixture: campaign is the
    // one studio it was ever correct for.
    return {
      text: options.responseSchema ? mockFromSchema(options.responseSchema) : getMockCampaignText(),
      model: 'gemini',
      mock: true,
    };
  }

  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.geminiText}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: options.prompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens || 4096,
          // `??`, not `||`: a deliberate temperature of 0 — which is what a
          // schema-constrained request wants — was coerced back to 0.7.
          temperature: options.temperature ?? 0.7,
          ...(options.responseSchema
            ? { responseMimeType: 'application/json', responseSchema: options.responseSchema }
            : {}),
        },
      }),
    },
    PROVIDER_TIMEOUTS.text,
    'gemini'
  );

  if (!response.ok) {
    throw new ProviderPermanentError(`Gemini text API error: ${response.status}`, response.status);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No text generated by Gemini');
  }

  return { text, model: 'gemini', mock: false };
}

function getMockCampaignText(): string {
  return JSON.stringify([
    {
      scenario: 'Professional flat lay of product on marble surface with soft natural lighting, brand colors accent',
      caption: 'اكتشف الجديد من منتجاتنا المميزة ✨ جودة عالية وأسعار منافسة',
      tov: 'الجودة اللي تستاهلها',
      schedule: 'Sunday 10:00 AM',
      hashtags: '#منتجات #جودة #تسوق #عروض #السعودية #اونلاين #متجر #تخفيضات #جديد #حصري',
    },
    {
      scenario: 'Close-up detail shot highlighting product texture and craftsmanship, warm studio lighting',
      caption: 'التفاصيل تصنع الفرق 🎯 منتجاتنا مصممة بعناية لتلبي احتياجاتك',
      tov: 'التفاصيل تفرق معنا',
      schedule: 'Tuesday 2:00 PM',
      hashtags: '#تفاصيل #تصميم #جودة_عالية #منتجات #براند #السعودية #تسوق #اهتمام #دقة #احتراف',
    },
    {
      scenario: 'Lifestyle shot with person using product in modern home setting, natural daylight',
      caption: 'حياتك تستاهل الأفضل 🏠 منتجاتنا جزء من يومك',
      tov: 'عيش اللحظة بأفضلها',
      schedule: 'Wednesday 6:00 PM',
      hashtags: '#لايف_ستايل #حياة #يومي #منتجات #بيت #راحة #جودة #تسوق #اونلاين #السعودية',
    },
    {
      scenario: 'Before and after comparison showing product impact, split screen composition',
      caption: 'الفرق واضح! 💫 جرّب بنفسك وشوف النتيجة',
      tov: 'النتيجة تتكلم',
      schedule: 'Thursday 12:00 PM',
      hashtags: '#قبل_وبعد #نتائج #تجربة #منتجات #فرق #جودة #السعودية #تسوق #مميز #حصري',
    },
    {
      scenario: 'Customer testimonial style photo with happy person and product, warm tones',
      caption: 'آراء عملائنا هي فخرنا 🌟 شكراً لثقتكم الدائمة',
      tov: 'ثقتكم تهمنا',
      schedule: 'Saturday 11:00 AM',
      hashtags: '#عملاء #آراء #ثقة #تقييم #منتجات #خدمة #السعودية #شكر #تسوق #جودة',
    },
    {
      scenario: 'Product arranged with complementary items creating a curated collection feel',
      caption: 'مجموعة متكاملة تناسب ذوقك 🎨 اختر اللي يعجبك',
      tov: 'كل شي في مكان واحد',
      schedule: 'Sunday 4:00 PM',
      hashtags: '#مجموعة #كولكشن #تنسيق #ذوق #منتجات #تسوق #السعودية #اختيار #ستايل #جديد',
    },
    {
      scenario: 'Behind the scenes of product creation/packaging, authentic brand story feel',
      caption: 'من وراء الكواليس 🎬 نصنع لكم الأفضل بكل حب واهتمام',
      tov: 'صناعة بحب',
      schedule: 'Monday 3:00 PM',
      hashtags: '#كواليس #صناعة #اهتمام #براند #قصتنا #السعودية #منتجات #حب #عمل #احتراف',
    },
    {
      scenario: 'Special offer announcement with product spotlight, bold brand colors, dynamic composition',
      caption: 'عرض خاص ولفترة محدودة! 🔥 لا تفوّت الفرصة واطلب الحين',
      tov: 'العرض ما يتفوّت',
      schedule: 'Wednesday 10:00 AM',
      hashtags: '#عروض #خصم #تخفيضات #فرصة #محدود #تسوق #السعودية #اونلاين #اطلب #حصري',
    },
    {
      scenario: 'Aspirational hero shot of product in premium setting, cinematic lighting and composition',
      caption: 'لأنك تستاهل التميز ⭐ اكتشف تجربة استثنائية مع منتجاتنا',
      tov: 'تميّزك يبدأ هنا',
      schedule: 'Friday 1:00 PM',
      hashtags: '#تميز #فخامة #استثنائي #منتجات #براند #السعودية #تسوق #جودة #حصري #الأفضل',
    },
  ]);
}
