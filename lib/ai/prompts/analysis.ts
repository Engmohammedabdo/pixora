interface AnalysisPromptInput {
  businessName: string;
  industry: string;
  description: string;
  competitors: string[];
  targetMarket: string;
  painPoints: string;
}

// v1.0
export function buildAnalysisPrompt(input: AnalysisPromptInput): string {
  const competitorList = input.competitors.filter(Boolean).join(', ') || 'Not specified';

  return `Act as a world-class CMO with 20+ years in the ${input.industry} market.
Business: ${input.businessName}
Industry: ${input.industry}
Description: ${input.description}
Competitors: ${competitorList}
Target Market: ${input.targetMarket}
Pain Points: ${input.painPoints}

Provide comprehensive marketing analysis. Return as valid JSON with these keys:
1. "swot": { "strengths": string[], "weaknesses": string[], "opportunities": string[], "threats": string[] }
2. "personas": [{ "name": string, "age": string, "role": string, "goals": string, "pain_points": string, "channels": string }] (3 personas)
3. "competitors": [{ "name": string, "strengths": string, "weaknesses": string, "market_share": string }]
4. "usp": { "statement": string, "positioning": string, "differentiators": string[] }
5. "gtm": { "strategy": string, "channels": string[], "tactics": string[] }
6. "pricing": { "recommendation": string, "model": string, "tiers": string[] }
7. "roadmap": { "day_30": string[], "day_60": string[], "day_90": string[] }
8. "kpis": [{ "metric": string, "target": string, "timeframe": string }]

All text content in Arabic. Return ONLY valid JSON.`;
}

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
