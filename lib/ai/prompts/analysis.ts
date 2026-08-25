import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';
import { industryName } from '@/lib/industries';
import { buildBrandContextBlock, type BrandContextPromptInput } from './brand-context';

interface AnalysisPromptInput {
  businessName: string;
  industry: string;
  description: string;
  competitors: string[];
  targetMarket: string;
  painPoints: string;
  stage?: string;
  /**
   * The locale the customer is READING the app in. Defaults to Arabic, which is
   * what this prompt used to hardcode — so an English-locale customer paid full
   * price for a deliverable they may not be able to read.
   */
  locale?: string;
  /**
   * The caller's brand kit business columns, reshaped for buildBrandContextBlock.
   * `null`/absent is the common case: analysis was the last studio to receive a
   * brand kit at all (P4.2, brandKitId is optional on the route), and every kit
   * created before migration 045 has all five business columns null regardless.
   */
  brandContext?: BrandContextPromptInput | null;
}

// v2.0 — matches system-prompts.md marketing_analysis_v1
export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const { businessName, industry, description, competitors, targetMarket, painPoints, stage, locale, brandContext } = input;
  // EVERY value interpolated below reaches the model, so every value below meets
  // the filter. Sanitizing only `description` was never the rule — it was the only
  // field anyone had got to. `competitors` is customer-supplied too and is joined
  // into one line, so it is filtered after the join.
  const outputLanguage = locale === 'en' ? 'English' : 'Arabic';
  const safeDesc = sanitizePrompt(description);
  const safeBusinessName = sanitizePrompt(businessName, 200);
  // sanitizePrompt must still RUN on the raw value — it is the only thing
  // standing between a blocked term in this field and the model. The RESOLVED
  // name below (via industryName()) is what reaches the persona/business lines;
  // this raw value never does.
  sanitizePrompt(industry, 100);
  const safeTargetMarket = sanitizePrompt(targetMarket, 500);
  // Same invented fact plan.ts carried: `Growth` whenever `stage` is absent, which
  // is ALWAYS, because nothing in the product collects it.
  const safeStage = stage ? sanitizePrompt(stage, 100) : '';
  const safePainPoints = sanitizePrompt(painPoints || 'Not specified', 1000);
  const safeCompetitorList = sanitizePrompt(
    competitors.filter(Boolean).join(', ') || 'Not specified',
    1000
  );

  // The page stores the SLUG (analysis/page.tsx:42) and renders the translated
  // label separately, so the raw value reached the persona line and produced
  // "20+ years of experience in the other industry". `other` degrades to a general
  // marketer rather than naming a category that does not exist.
  const resolvedIndustry = industryName(industry);
  const persona = resolvedIndustry
    ? `a world-class Chief Marketing Officer (CMO) with 20+ years of experience in the ${resolvedIndustry} industry`
    : 'a world-class Chief Marketing Officer (CMO) with 20+ years of cross-industry experience';

  let prompt = `You are ${persona}.`;

  prompt += `\n\nBusiness Under Analysis:`;
  prompt += `\n- Name: ${safeBusinessName}`;
  // Unresolved (an unrecognised slug, or free text a hostile PostgREST write to
  // brand_kits.industry — deliberately unconstrained, migration 045 — or a
  // pre-chip-UI historical generation restored via RecentWork could still
  // carry; see app/api/studios/analysis/route.ts's InputSchema comment) omits
  // the line entirely. It never falls back to the raw value.
  if (resolvedIndustry) prompt += `\n- Industry: ${resolvedIndustry}`;
  prompt += `\n- Description: ${safeDesc}`;
  if (safeStage) prompt += `\n- Current Stage: ${safeStage}`;
  prompt += `\n- Target Market: ${safeTargetMarket}`;
  prompt += `\n- Main Competitors: ${safeCompetitorList}`;
  prompt += `\n- Current Challenges: ${safePainPoints}`;

  // Placed after the business-information lines above and before the
  // deliverable/technical directive below — the same position creator, campaign
  // and (now) plan use.
  prompt += buildBrandContextBlock(brandContext ?? null);

  // EVERY key below is one the route's AnalysisSchema parses AND a surface renders.
  //
  // Removed 2026-08-24: `usp`, `gtm` and `pricing` (whole sections nothing displays
  // or exports), `messaging` on personas, and `pricing`/`digital_presence` on
  // competitors. The customer paid tokens for all of it and never saw any of it.
  //
  // `kpis` was the sharper defect: this asked for `target_30d`/`target_90d` while
  // the schema, the page and the PDF all read `target` and `timeframe` — so every
  // KPI card rendered a blank headline number. The three now agree.
  //
  // Do not add a key here without pointing at the code that prints it.
  prompt += `\n\nProvide a comprehensive marketing analysis. Return as valid JSON with these exact keys:`;
  prompt += `\n{`;
  prompt += `\n  "swot": { "strengths": ["4-5 items"], "weaknesses": ["4-5 items"], "opportunities": ["4-5 items"], "threats": ["4-5 items"] },`;
  prompt += `\n  "personas": [{ "name": "", "age": "", "role": "", "goals": "", "pain_points": "", "channels": "" }],`;
  prompt += `\n  "competitors": [{ "name": "", "strengths": "", "weaknesses": "", "market_share": "" }],`;
  prompt += `\n  "roadmap": { "day_30": ["5 actions"], "day_60": ["5 actions"], "day_90": ["5 actions"] },`;
  prompt += `\n  "kpis": [{ "metric": "", "target": "the headline number", "timeframe": "" }]`;
  prompt += `\n}`;

  prompt += `\n\nAll text content in ${outputLanguage}. Be specific, actionable, and tailored to the market context.`;
  prompt += `\nInclude local Gulf/MENA market insights and cultural nuances — the market is the Gulf whichever language the customer reads in.`;
  prompt += `\nReturn ONLY valid JSON.`;

  return prompt;
}

export const ANALYSIS_PROMPT_VERSION = getPromptVersion('marketing_analysis');

export function getMockAnalysis(): Record<string, unknown> {
  return {
    swot: {
      strengths: ['منتج عالي الجودة', 'فريق متخصص', 'سمعة قوية في السوق', 'خدمة عملاء ممتازة'],
      weaknesses: ['ميزانية تسويقية محدودة', 'حضور ضعيف على السوشال ميديا', 'عدم وجود تطبيق موبايل'],
      opportunities: ['نمو السوق الرقمي', 'زيادة الطلب على المنتجات المحلية', 'شراكات استراتيجية محتملة'],
      threats: ['منافسة شديدة', 'تغير سلوك المستهلك', 'ارتفاع تكاليف الإعلان'],
    },
    personas: [
      { name: 'سارة', age: '28-35', role: 'مديرة تسويق', goals: 'تحسين ROI للحملات', pain_points: 'وقت محدود، ميزانية ضيقة', channels: 'Instagram, LinkedIn' },
      { name: 'خالد', age: '25-32', role: 'صاحب مشروع صغير', goals: 'زيادة المبيعات', pain_points: 'لا يملك فريق تسويق', channels: 'Instagram, TikTok' },
      { name: 'نورة', age: '22-28', role: 'فريلانسر', goals: 'بناء علامة شخصية', pain_points: 'منافسة عالية', channels: 'Twitter, Instagram' },
    ],
    competitors: [
      { name: 'المنافس الأول', strengths: 'حصة سوقية كبيرة', weaknesses: 'خدمة عملاء ضعيفة', market_share: '30%' },
      { name: 'المنافس الثاني', strengths: 'أسعار تنافسية', weaknesses: 'جودة أقل', market_share: '20%' },
      { name: 'المنافس الثالث', strengths: 'ابتكار مستمر', weaknesses: 'تواجد محدود', market_share: '15%' },
    ],
    usp: { statement: 'الحل العربي الأول للتسويق بالذكاء الاصطناعي', positioning: 'منصة متكاملة بأسعار معقولة', differentiators: ['دعم العربية', 'نماذج AI متعددة', 'نظام كريدت مرن'] },
    gtm: { strategy: 'استراتيجية دخول تدريجية مع التركيز على المحتوى', channels: ['Instagram', 'LinkedIn', 'YouTube', 'Google Ads'], tactics: ['محتوى تعليمي', 'تجربة مجانية', 'شراكات مع مؤثرين'] },
    pricing: { recommendation: 'تسعير متدرج يبدأ من مجاني', model: 'Freemium + Credits', tiers: ['مجاني: 25 كريدت', 'مبتدئ: $12/شهر', 'احترافي: $29/شهر'] },
    roadmap: {
      day_30: ['إطلاق الحملة على السوشال ميديا', 'نشر 12 محتوى تعليمي', 'بناء قائمة بريدية 500 مشترك'],
      day_60: ['إطلاق برنامج الشراكات', 'حملة Google Ads', 'الوصول لـ 1000 مستخدم'],
      day_90: ['تحسين معدل التحويل', 'إطلاق ميزات جديدة', 'الوصول لـ $3000 MRR'],
    },
    kpis: [
      { metric: 'المستخدمون النشطون شهرياً', target: '2,000', timeframe: '3 أشهر' },
      { metric: 'معدل التحويل', target: '5%', timeframe: '3 أشهر' },
      { metric: 'الإيراد الشهري', target: '$3,000', timeframe: '3 أشهر' },
      { metric: 'تكلفة اكتساب العميل', target: '$15', timeframe: 'شهرياً' },
    ],
  };
}
