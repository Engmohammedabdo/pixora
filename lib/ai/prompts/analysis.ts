import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface AnalysisPromptInput {
  businessName: string;
  industry: string;
  description: string;
  competitors: string[];
  targetMarket: string;
  painPoints: string;
  stage?: string;
}

// v2.0 — matches system-prompts.md marketing_analysis_v1
export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const { businessName, industry, description, competitors, targetMarket, painPoints, stage } = input;
  const safeDesc = sanitizePrompt(description);
  const competitorList = competitors.filter(Boolean).join(', ') || 'Not specified';

  let prompt = `You are a world-class Chief Marketing Officer (CMO) with 20+ years of experience in the ${industry} industry.`;

  prompt += `\n\nBusiness Under Analysis:`;
  prompt += `\n- Name: ${businessName}`;
  prompt += `\n- Industry: ${industry}`;
  prompt += `\n- Description: ${safeDesc}`;
  prompt += `\n- Current Stage: ${stage || 'Growth'}`;
  prompt += `\n- Target Market: ${targetMarket}`;
  prompt += `\n- Main Competitors: ${competitorList}`;
  prompt += `\n- Current Challenges: ${painPoints || 'Not specified'}`;

  prompt += `\n\nProvide a comprehensive marketing analysis. Return as valid JSON with these exact keys:`;
  prompt += `\n{`;
  prompt += `\n  "swot": { "strengths": ["4-5 items"], "weaknesses": ["4-5 items"], "opportunities": ["4-5 items"], "threats": ["4-5 items"] },`;
  prompt += `\n  "personas": [{ "name": "", "age": "", "role": "", "goals": "", "pain_points": "", "channels": "", "messaging": "" }],`;
  prompt += `\n  "competitors": [{ "name": "", "strengths": "", "weaknesses": "", "market_share": "", "pricing": "", "digital_presence": "" }],`;
  prompt += `\n  "usp": { "statement": "One powerful sentence", "positioning": "", "differentiators": ["3 items"], "taglines": ["3 Arabic taglines"] },`;
  prompt += `\n  "gtm": { "strategy": "", "primary_channel": "", "channels": [""], "tactics": [""], "partnerships": [""] },`;
  prompt += `\n  "pricing": { "recommendation": "", "model": "", "tiers": [""], "justification": "" },`;
  prompt += `\n  "roadmap": { "day_30": ["5 actions"], "day_60": ["5 actions"], "day_90": ["5 actions"] },`;
  prompt += `\n  "kpis": [{ "metric": "", "target_30d": "", "target_90d": "", "tracking": "" }]`;
  prompt += `\n}`;

  prompt += `\n\nAll text content in Arabic. Be specific, actionable, and tailored to the market context.`;
  prompt += `\nInclude local market insights and cultural nuances.`;
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
