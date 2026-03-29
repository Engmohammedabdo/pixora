export interface PromptTemplate {
  id: string;
  category: string;
  categoryAr: string;
  name: string;
  nameAr: string;
  prompt: string;
  studio: string;
  style: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Food & Beverage
  {
    id: 'food-1',
    category: 'food',
    categoryAr: 'مأكولات ومشروبات',
    name: 'Coffee Product',
    nameAr: 'منتج قهوة',
    prompt:
      'Professional flat lay photography of premium coffee beans scattered on dark wood surface, espresso cup with crema, warm golden light, steam rising, cozy café aesthetic',
    studio: 'creator',
    style: 'photographic',
  },
  {
    id: 'food-2',
    category: 'food',
    categoryAr: 'مأكولات ومشروبات',
    name: 'Restaurant Dish',
    nameAr: 'طبق مطعم',
    prompt:
      'Elegant overhead shot of a gourmet dish on white ceramic plate, colorful garnish, fine dining presentation, soft natural lighting, bokeh background',
    studio: 'creator',
    style: 'photographic',
  },
  // Fashion
  {
    id: 'fashion-1',
    category: 'fashion',
    categoryAr: 'أزياء وموضة',
    name: 'Luxury Fashion',
    nameAr: 'أزياء فاخرة',
    prompt:
      'High-end fashion product photography, designer handbag on marble pedestal, dramatic side lighting, deep shadows, luxury editorial feel',
    studio: 'creator',
    style: 'photographic',
  },
  {
    id: 'fashion-2',
    category: 'fashion',
    categoryAr: 'أزياء وموضة',
    name: 'Streetwear',
    nameAr: 'أزياء شارع',
    prompt:
      'Urban streetwear brand photo, sneakers on concrete with graffiti background, neon reflections, night photography, bold dynamic composition',
    studio: 'creator',
    style: 'bold',
  },
  // Real Estate
  {
    id: 'realestate-1',
    category: 'realestate',
    categoryAr: 'عقارات',
    name: 'Luxury Villa',
    nameAr: 'فيلا فاخرة',
    prompt:
      'Stunning architectural photography of modern luxury villa exterior at golden hour, infinity pool reflection, manicured garden, Dubai skyline in distance',
    studio: 'creator',
    style: 'photographic',
  },
  // Healthcare
  {
    id: 'health-1',
    category: 'health',
    categoryAr: 'صحة وجمال',
    name: 'Skincare Product',
    nameAr: 'منتج عناية',
    prompt:
      'Clean minimalist skincare product photography, white dropper bottle among fresh green leaves and water droplets, soft pastel background, spa-like serenity',
    studio: 'creator',
    style: 'minimalist',
  },
  // Technology
  {
    id: 'tech-1',
    category: 'tech',
    categoryAr: 'تكنولوجيا',
    name: 'SaaS Dashboard',
    nameAr: 'لوحة تحكم',
    prompt:
      'Modern SaaS product mockup, floating dashboard UI on gradient background, clean glass morphism effects, data visualizations, professional tech aesthetic',
    studio: 'creator',
    style: 'minimalist',
  },
  // E-commerce
  {
    id: 'ecom-1',
    category: 'ecommerce',
    categoryAr: 'تجارة إلكترونية',
    name: 'Product Showcase',
    nameAr: 'عرض منتج',
    prompt:
      'Clean e-commerce product photography, item floating on solid color background with subtle shadow, professional studio lighting, multiple angle feel',
    studio: 'creator',
    style: 'photographic',
  },
];

export const TEMPLATE_CATEGORIES = [
  ...new Set(PROMPT_TEMPLATES.map((t) => t.category)),
];
