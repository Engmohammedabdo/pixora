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

  // This builder imported sanitizePrompt and never called it, so `plan` was the
  // one paid studio with NO prompt filter in front of the model — and the
  // PromptBlockedError arm in app/api/studios/plan/route.ts was unreachable
  // code, meaning the 400 + `term` response the UI renders could never appear
  // for a plan user. An unused import is exactly why tsc and eslint stayed
  // green over it, so scripts/tests/safety.test.ts now drives this builder.
  //
  // EVERY field below is free text the customer typed and every one of them is
  // interpolated into the prompt, so every one is sanitized — not just the
  // "main" one. The caps mirror the route's own Zod maxima
  // (app/api/studios/plan/route.ts InputSchema) so the builder holds the limit
  // itself rather than trusting whoever calls it.
  const safeBusinessName = sanitizePrompt(businessName, 200);
  const safeIndustry = sanitizePrompt(industry, 100);
  const safeStage = stage ? sanitizePrompt(stage, 100) : '';
  const safeTargetMarket = sanitizePrompt(targetMarket, 500);
  const safeBudget = sanitizePrompt(budget, 200);
  // Per goal, not over the joined string: the schema caps each goal at 200
  // chars and allows ten of them, so sanitizing after the join would apply one
  // 200-char cap to the whole list and silently drop the later goals.
  const safeGoals = goals.map((g) => sanitizePrompt(g, 200));

  const weeks = Math.max(1, Math.round(duration / 7));

  let prompt = `You are a Senior Marketing Strategist with expertise in ${safeIndustry} businesses.`;

  prompt += `\n\nBusiness Information:`;
  prompt += `\n- Name: ${safeBusinessName}`;
  prompt += `\n- Industry: ${safeIndustry}`;
  // Only when the caller actually has one. This used to emit `Growth` whenever
  // `stage` was absent — which is ALWAYS, because nothing in the product collects
  // it — so every plan ever generated was steered by an invented fact.
  if (safeStage) prompt += `\n- Stage: ${safeStage}`;
  prompt += `\n- Target Market: ${safeTargetMarket}`;
  prompt += `\n- Monthly Budget: ${safeBudget}`;
  prompt += `\n- Primary Goals: ${safeGoals.join(', ')}`;

  prompt += `\n\nCreate a detailed ${duration}-day marketing plan. Return as valid JSON:`;
  prompt += `\n{`;
  prompt += `\n  "objectives": [{ "goal": "SMART objective", "kpi": "metric", "target": "specific number" }],`;
  prompt += `\n  "channels": [{ "name": "", "budget_pct": 0, "strategy": "detailed approach" }],`;
  prompt += `\n  "calendar": [{ "week": 1, "content": ["items"], "channel": "" }],`;
  prompt += `\n  "budget": { "total": "", "breakdown": [{ "item": "", "amount": "", "pct": 0 }] },`;
  prompt += `\n  "kpis": [{ "metric": "", "target": "", "tracking": "how to measure" }]`;
  prompt += `\n}`;

  // The customer picks 30/60/90 days, and it reached the prose above and nothing
  // else — so the model returned a calendar of whatever length it felt like.
  prompt += `\n\nThe calendar must have exactly ${weeks} entries, one per week, numbered 1..${weeks}, covering the full ${duration} days.`;

  // `quick_wins` and `risks` were removed 2026-08-24: no screen renders them and no
  // export reads them, so the customer paid tokens for output that was parsed,
  // stored and discarded. Do not add a field here without pointing at the code
  // that prints it.

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
