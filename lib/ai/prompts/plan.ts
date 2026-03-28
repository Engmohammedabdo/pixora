interface PlanPromptInput {
  businessName: string;
  industry: string;
  goals: string[];
  targetMarket: string;
  budget: string;
  duration: number;
}

// v1.0
export function buildPlanPrompt(input: PlanPromptInput): string {
  return `Act as a senior marketing strategist. Create a ${input.duration}-day marketing plan.
Business: ${input.businessName}
Industry: ${input.industry}
Goals: ${input.goals.join(', ')}
Target Market: ${input.targetMarket}
Monthly Budget: ${input.budget}

Return valid JSON:
{
  "objectives": [{ "goal": string, "kpi": string, "target": string }],
  "channels": [{ "name": string, "budget_pct": number, "strategy": string }],
  "calendar": [{ "week": number, "content": string[], "channel": string }],
  "budget": { "total": string, "breakdown": [{ "item": string, "amount": string, "pct": number }] },
  "kpis": [{ "metric": string, "target": string, "tracking": string }]
}
All text in Arabic. Return ONLY valid JSON.`;
}

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
  };
}
