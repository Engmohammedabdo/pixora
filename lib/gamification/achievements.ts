export interface Achievement {
  type: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  icon: string; // emoji
}

export const ACHIEVEMENTS: Achievement[] = [
  { type: 'first_generation', nameAr: 'أول إبداع', nameEn: 'First Creation', descriptionAr: 'أنشأت أول محتوى', icon: '🎨' },
  { type: 'brand_builder', nameAr: 'باني العلامة', nameEn: 'Brand Builder', descriptionAr: 'أنشأت أول هوية بصرية', icon: '🎯' },
  { type: 'campaign_master', nameAr: 'خبير الحملات', nameEn: 'Campaign Master', descriptionAr: 'أنشأت 3 حملات', icon: '📋' },
  { type: 'explorer', nameAr: 'المستكشف', nameEn: 'Explorer', descriptionAr: 'جربت كل الاستوديوهات', icon: '🧭' },
  { type: 'power_user', nameAr: 'مستخدم متميز', nameEn: 'Power User', descriptionAr: 'أنشأت 50 محتوى', icon: '⚡' },
  { type: 'night_owl', nameAr: 'بومة الليل', nameEn: 'Night Owl', descriptionAr: 'أنشأت محتوى بعد منتصف الليل', icon: '🦉' },
  { type: 'streak_7', nameAr: 'أسبوع متواصل', nameEn: '7-Day Streak', descriptionAr: '7 أيام استخدام متواصل', icon: '🔥' },
  { type: 'streak_30', nameAr: 'شهر متواصل', nameEn: '30-Day Streak', descriptionAr: '30 يوم استخدام متواصل', icon: '💎' },
  { type: 'social_sharer', nameAr: 'المشارك', nameEn: 'Social Sharer', descriptionAr: 'شاركت محتوى لأول مرة', icon: '📤' },
  { type: 'prompt_pro', nameAr: 'محترف البرومبت', nameEn: 'Prompt Pro', descriptionAr: 'استخدمت مساعد البرومبت 10 مرات', icon: '💡' },
];

export function getAchievement(type: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.type === type);
}
