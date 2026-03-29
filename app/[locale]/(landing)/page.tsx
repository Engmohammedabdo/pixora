'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS } from '@/lib/stripe/plans';
import { cn } from '@/lib/utils';
import {
  Sparkles, Image, Camera, LayoutGrid, Map, Film, BarChart3,
  Mic, Pencil, Lightbulb, ArrowLeft, Check, ChevronDown, Zap,
  Globe, Shield, Palette,
} from 'lucide-react';
import { useState } from 'react';

const STUDIOS = [
  { icon: Image, label: 'منشئ الصور', desc: 'صور تسويقية احترافية من وصف نصي', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' },
  { icon: Camera, label: 'تصوير المنتجات', desc: 'تصوير منتجات بـ 6 زوايا مختلفة', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' },
  { icon: LayoutGrid, label: 'مخطط الحملات', desc: 'حملة كاملة 9 منشورات بضغطة', color: 'bg-green-100 dark:bg-green-900/30 text-green-600' },
  { icon: Map, label: 'الخطة التسويقية', desc: 'خطة 30/60/90 يوم مع تقويم محتوى', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' },
  { icon: Film, label: 'ستوري بورد', desc: 'ستوري بورد فيديو 9 مشاهد', color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600' },
  { icon: BarChart3, label: 'التحليل التسويقي', desc: 'تحليل SWOT + شخصيات + منافسين', color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600' },
  { icon: Mic, label: 'التعليق الصوتي', desc: 'صوت احترافي بلهجتك المفضلة', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' },
  { icon: Pencil, label: 'تعديل الصور', desc: 'تعديل بالذكاء الاصطناعي', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600' },
  { icon: Lightbulb, label: 'مساعد البرومبت', desc: 'حوّل وصفك لبرومبت احترافي — مجاناً', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600' },
];

const FEATURES = [
  { icon: Sparkles, title: 'نماذج AI متعددة', desc: 'اختر بين Gemini وGPT وFlux حسب احتياجك' },
  { icon: Globe, title: 'عربي أولاً', desc: 'واجهة عربية كاملة مع دعم RTL من البداية' },
  { icon: Palette, title: 'هوية بصرية', desc: 'ألوانك وشعارك يُطبقون تلقائياً في كل توليد' },
  { icon: Shield, title: 'نظام كريدت شفاف', desc: 'ادفع على قد استخدامك — بدون مفاجآت' },
  { icon: Zap, title: 'سرعة فائقة', desc: 'نتائج في ثواني مع fallback تلقائي بين النماذج' },
  { icon: LayoutGrid, title: 'كل شي في مكان واحد', desc: '9 استوديوهات تغطي كل احتياجاتك التسويقية' },
];

const FAQS = [
  { q: 'كيف يشتغل نظام الكريدت؟', a: 'كل عملية تستهلك كريدت حسب نوعها. مثلاً: صورة 1080p = 1 كريدت، حملة كاملة = 12 كريدت. تبدأ مجاناً بـ 25 كريدت.' },
  { q: 'هل أقدر أجرب قبل ما أدفع؟', a: 'طبعاً! الخطة المجانية تعطيك 25 كريدت شهرياً — كافية تجرب كل الاستوديوهات.' },
  { q: 'إيش الفرق بين النماذج (Gemini, GPT, Flux)؟', a: 'Gemini = الأسرع، GPT = الأعلى جودة، Flux = الأكثر إبداعية. تقدر تختار حسب احتياجك.' },
  { q: 'هل الكريدت تنتهي؟', a: 'كريدت الاشتراك تتجدد شهرياً. كريدت الشحن (top-up) ما تنتهي لمدة 12 شهر.' },
  { q: 'هل أقدر ألغي اشتراكي؟', a: 'نعم، في أي وقت من صفحة الفواتير. ما فيه عقود أو التزامات.' },
];

export default function LandingPage(): React.ReactElement {
  const t = useTranslations();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b bg-[var(--color-surface)]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <span className="text-2xl font-bold text-primary-600 font-cairo">Pixora</span>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link href="/login">{t('auth.login')}</Link></Button>
            <Button size="sm" asChild><Link href="/signup">{t('auth.signup')}</Link></Button>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-50/50 to-transparent dark:from-primary-900/20" />
        <div className="relative max-w-5xl mx-auto px-4 py-20 sm:py-32 text-center">
          <Badge variant="secondary" className="mb-6 gap-1 px-4 py-1.5 text-sm">
            <Sparkles className="h-3.5 w-3.5" /> المنصة العربية الأولى للتسويق بالـ AI
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-cairo leading-tight mb-6">
            حوّل أي فكرة لحملة<br />
            <span className="text-primary-500">تسويقية احترافية</span> في دقائق
          </h1>
          <p className="text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-10">
            9 استوديوهات ذكاء اصطناعي. نماذج متعددة. واجهة عربية. نظام كريدت شفاف. كل اللي تحتاجه لتسويق احترافي.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="text-base px-8 gap-2" asChild>
              <Link href="/signup">
                ابدأ مجاناً — 25 كريدت
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8" asChild>
              <Link href="#studios">شوف الاستوديوهات</Link>
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-4">بدون بطاقة ائتمان — ابدأ بثواني</p>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="py-20 bg-[var(--color-surface)]">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold font-cairo text-center mb-4">ليش Pixora؟</h2>
          <p className="text-center text-[var(--color-text-secondary)] mb-12 max-w-2xl mx-auto">
            أدوات تسويق بالذكاء الاصطناعي مصممة للسوق العربي — مش مجرد ترجمة.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <Card key={i} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center mb-4">
                    <f.icon className="h-5 w-5 text-primary-500" />
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ STUDIOS ═══ */}
      <section id="studios" className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold font-cairo text-center mb-4">9 استوديوهات في منصة واحدة</h2>
          <p className="text-center text-[var(--color-text-secondary)] mb-12">من الفكرة للتنفيذ — كل شي تحتاجه</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {STUDIOS.map((s, i) => (
              <Card key={i} className="hover:shadow-md transition-shadow cursor-default">
                <CardContent className="p-5 flex items-start gap-4">
                  <div className={cn('p-2.5 rounded-lg flex-shrink-0', s.color)}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm mb-1">{s.label}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)]">{s.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section className="py-20 bg-[var(--color-surface)]">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold font-cairo text-center mb-4">أسعار شفافة — بدون مفاجآت</h2>
          <p className="text-center text-[var(--color-text-secondary)] mb-12">ابدأ مجاناً وترقّى على حسب احتياجك</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {Object.values(PLANS).map((plan) => {
              const isPopular = plan.id === 'pro';
              return (
                <Card key={plan.id} className={cn('relative flex flex-col', isPopular && 'border-primary-500 shadow-lg')}>
                  {isPopular && <Badge className="absolute -top-2.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 px-3">الأكثر شعبية</Badge>}
                  <CardContent className="p-5 flex flex-col flex-1">
                    <h3 className="font-semibold text-center">{plan.nameAr}</h3>
                    <div className="text-center my-3">
                      <span className="text-3xl font-bold">${plan.price}</span>
                      {plan.price > 0 && <span className="text-xs text-[var(--color-text-muted)]">/شهر</span>}
                    </div>
                    <p className="text-sm text-center text-primary-600 font-medium mb-4">{plan.credits.toLocaleString()} كريدت</p>
                    <ul className="space-y-1.5 flex-1 mb-4">
                      {plan.featuresAr.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <Check className="h-3.5 w-3.5 text-[var(--color-success)] mt-0.5 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button variant={isPopular ? 'default' : 'outline'} size="sm" className="w-full" asChild>
                      <Link href="/signup">{plan.price === 0 ? 'ابدأ مجاناً' : 'اشترك الآن'}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="py-20">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold font-cairo text-center mb-12">أسئلة شائعة</h2>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-4 text-start hover:bg-surface-2/50 transition-colors"
                >
                  <span className="font-medium text-sm">{faq.q}</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform flex-shrink-0 ms-2', openFaq === i && 'rotate-180')} />
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4 text-sm text-[var(--color-text-secondary)]">{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="py-20 bg-gradient-to-b from-primary-500 to-primary-700 text-white">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold font-cairo mb-4">جاهز تبدأ تسويقك بذكاء؟</h2>
          <p className="text-lg opacity-90 mb-8">25 كريدت مجاناً — بدون بطاقة ائتمان — ابدأ بثواني</p>
          <Button size="lg" variant="secondary" className="text-base px-10 gap-2" asChild>
            <Link href="/signup">
              أنشئ حسابك المجاني
              <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-[var(--color-surface)]">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--color-text-muted)]">
          <span className="font-bold text-primary-600 font-cairo">Pixora</span>
          <p>&copy; {new Date().getFullYear()} Pixora. جميع الحقوق محفوظة.</p>
        </div>
      </footer>
    </div>
  );
}
