import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface PlanPromptInput {
  businessName: string;
  industry: string;
  goals: string[];
  targetMarket: string;
  budget: string;
  duration: number;
  stage?: string;
}

// v2.0 — matches system-prompts.md marketing_plan_v1
export function buildPlanPrompt(input: PlanPromptInput): string {
  const { businessName, industry, goals, targetMarket, budget, duration, stage } = input;

  let prompt = `You are a Senior Marketing Strategist with expertise in ${industry} businesses.`;

  prompt += `\n\nBusiness Information:`;
  prompt += `\n- Name: ${businessName}`;
  prompt += `\n- Industry: ${industry}`;
  prompt += `\n- Stage: ${stage || 'Growth'}`;
  prompt += `\n- Target Market: ${targetMarket}`;
  prompt += `\n- Monthly Budget: ${budget}`;
  prompt += `\n- Primary Goals: ${goals.join(', ')}`;

  prompt += `\n\nCreate a detailed ${duration}-day marketing plan. Return as valid JSON:`;
  prompt += `\n{`;
  prompt += `\n  "objectives": [{ "goal": "SMART objective", "kpi": "metric", "target": "specific number" }],`;
  prompt += `\n  "channels": [{ "name": "", "budget_pct": 0, "strategy": "detailed approach" }],`;
  prompt += `\n  "calendar": [{ "week": 1, "content": ["items"], "channel": "" }],`;
  prompt += `\n  "budget": { "total": "", "breakdown": [{ "item": "", "amount": "", "pct": 0 }] },`;
  prompt += `\n  "kpis": [{ "metric": "", "target": "", "tracking": "how to measure" }],`;
  prompt += `\n  "quick_wins": ["5-7 immediate actions for first 2 weeks"],`;
  prompt += `\n  "risks": [{ "risk": "", "probability": "High/Medium/Low", "mitigation": "" }]`;
  prompt += `\n}`;

  prompt += `\n\nAll text in Arabic. Be specific, actionable, and realistic for the given budget.`;
  prompt += `\nReturn ONLY valid JSON.`;

  return prompt;
}

export const PLAN_PROMPT_VERSION = getPromptVersion('marketing_plan');

export function getMockPlan(): Record<string, unknown> {
  return {
    objectives: [
      { goal: 'زيادة الوعي بالعلامة', kpi: 'الوصول الشهري', target: '50,000 شخص' },
      { goal: 'توليد عملاء محتملين', kpi: 'عدد الـ Leads', target: '200 lead' },
      { goal: 'زيادة المبيعات', kpi: 'الإيراد', target: '$5,000' },
    ],
    channels: [
      { name: 'Instagram', budget_pct: 35, strategy: 'محتوى يومي + ريلز أسبوعية + إعلانات' },
      { name: 'Google Ads', budget_pct: 30, strategy: 'إعلانات بحث + إعلانات عرض' },
      { name: 'TikTok', budget_pct: 20, strategy: 'فيديوهات قصيرة + تعاون مع مؤثرين' },
      { name: 'Email', budget_pct: 15, strategy: 'نشرة أسبوعية + أتمتة' },
    ],
    calendar: [
      { week: 1, content: ['إطلاق الحملة', 'منشور تعريفي', '3 ريلز'], channel: 'Instagram' },
      { week: 2, content: ['محتوى تعليمي', 'عرض خاص', 'بث مباشر'], channel: 'Instagram + TikTok' },
      { week: 3, content: ['شهادات عملاء', 'مقارنة منتجات', 'خلف الكواليس'], channel: 'Multi-channel' },
      { week: 4, content: ['تلخيص الشهر', 'عرض نهاية الشهر', 'استطلاع رأي'], channel: 'All channels' },
    ],
    budget: { total: '$2,000', breakdown: [{ item: 'إعلانات مدفوعة', amount: '$1,000', pct: 50 }, { item: 'محتوى وتصميم', amount: '$500', pct: 25 }, { item: 'مؤثرين', amount: '$300', pct: 15 }, { item: 'أدوات وبرامج', amount: '$200', pct: 10 }] },
    kpis: [
      { metric: 'معدل التفاعل', target: '5%+', tracking: 'أسبوعي' },
      { metric: 'تكلفة الـ Lead', target: 'أقل من $10', tracking: 'يومي' },
      { metric: 'معدل التحويل', target: '3%+', tracking: 'أسبوعي' },
      { metric: 'العائد على الإعلان', target: '3x ROAS', tracking: 'شهري' },
    ],
    quick_wins: [
      'إنشاء حسابات على جميع المنصات الاجتماعية وتوحيد الهوية البصرية',
      'نشر 5 منشورات تعريفية بالعلامة التجارية',
      'إطلاق عرض ترحيبي للعملاء الجدد بخصم 15%',
      'التواصل مع 10 مؤثرين محليين للتعاون',
      'إعداد حملة Google Ads للكلمات المفتاحية الأساسية',
      'إرسال نشرة بريدية تعريفية للقائمة الحالية',
    ],
    risks: [
      { risk: 'تجاوز الميزانية المخصصة للإعلانات', probability: 'Medium', mitigation: 'وضع حدود يومية صارمة ومراجعة الإنفاق أسبوعياً' },
      { risk: 'ضعف التفاعل على المحتوى', probability: 'Medium', mitigation: 'تجربة أنواع مختلفة من المحتوى وتحليل الأداء كل أسبوع' },
      { risk: 'تغير خوارزميات المنصات', probability: 'Low', mitigation: 'تنويع القنوات وعدم الاعتماد على منصة واحدة' },
      { risk: 'دخول منافس جديد بأسعار أقل', probability: 'High', mitigation: 'التركيز على القيمة المضافة وبناء ولاء العملاء' },
    ],
  };
}
