import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';

export default function PrivacyPage(): React.ReactElement {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary-500" />
        <h1 className="text-2xl font-bold font-cairo">سياسة الخصوصية</h1>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">آخر تحديث: مارس 2026</p>

      <Card>
        <CardHeader><CardTitle className="text-base">1. المعلومات التي نجمعها</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>نجمع المعلومات التي تقدمها لنا مباشرة عند إنشاء حساب، بما في ذلك اسمك وبريدك الإلكتروني.</p>
          <p>نجمع أيضاً بيانات الاستخدام تلقائياً مثل الصفحات التي تزورها والاستوديوهات التي تستخدمها.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. كيف نستخدم معلوماتك</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>نستخدم معلوماتك لتقديم خدماتنا وتحسينها، ومعالجة المدفوعات، والتواصل معك بشأن حسابك.</p>
          <p>لا نبيع معلوماتك الشخصية لأطراف ثالثة.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">3. المحتوى المُولّد</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>المحتوى الذي تنشئه باستخدام Pixora (صور، نصوص، حملات) يعود ملكيته لك بالكامل.</p>
          <p>نحتفظ بنسخ من المحتوى المُولّد لتقديم الخدمة فقط ولا نستخدمه لأي غرض آخر.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">4. أمان البيانات</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>نستخدم تشفير SSL/TLS لحماية بياناتك أثناء النقل. جميع البيانات مُخزنة في بنية تحتية آمنة مع Row Level Security.</p>
          <p>مدفوعاتك تُعالج بواسطة Stripe ولا نُخزن بيانات بطاقتك الائتمانية على خوادمنا.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">5. حقوقك</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>يمكنك الوصول لبياناتك أو تعديلها أو حذف حسابك في أي وقت من صفحة الإعدادات.</p>
          <p>للاستفسارات المتعلقة بالخصوصية، تواصل معنا عبر البريد الإلكتروني.</p>
        </CardContent>
      </Card>
    </div>
  );
}
