import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function TermsPage(): React.ReactElement {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-primary-500" />
        <h1 className="text-2xl font-bold font-cairo">شروط الاستخدام</h1>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">آخر تحديث: مارس 2026</p>

      <Card>
        <CardHeader><CardTitle className="text-base">1. قبول الشروط</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>باستخدامك لمنصة Pixora، توافق على هذه الشروط والأحكام. إذا لم توافق، يرجى عدم استخدام الخدمة.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. الخدمة</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>Pixora منصة تسويق بالذكاء الاصطناعي تتيح لك إنشاء محتوى تسويقي متنوع باستخدام نماذج AI متعددة.</p>
          <p>نحتفظ بحق تعديل أو إيقاف أي ميزة مع إشعار مسبق.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">3. نظام الكريدت</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>كريدت الاشتراك تتجدد شهرياً ولا تُنقل بين الأشهر (ما لم يُذكر خلاف ذلك في خطتك).</p>
          <p>كريدت الشحن (top-up) صالحة لمدة 12 شهراً من تاريخ الشراء.</p>
          <p>الكريدت المستخدمة غير قابلة للاسترداد.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">4. المحتوى المُولّد</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>تحتفظ بملكية المحتوى الذي تنشئه. أنت مسؤول عن استخدامه بما يتوافق مع القوانين المعمول بها.</p>
          <p>يُحظر استخدام المنصة لإنشاء محتوى مخالف أو مضلل أو ينتهك حقوق الملكية الفكرية للآخرين.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">5. الاشتراكات والمدفوعات</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>المدفوعات تُعالج بواسطة Stripe. بالاشتراك، تُفوض بتحصيل المبلغ المحدد شهرياً.</p>
          <p>يمكنك إلغاء اشتراكك في أي وقت. يسري الإلغاء في نهاية فترة الفوترة الحالية.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">6. حدود الاستخدام</CardTitle></CardHeader>
        <CardContent className="text-sm leading-relaxed space-y-2">
          <p>يُحظر إساءة استخدام المنصة أو محاولة التحايل على نظام الكريدت.</p>
          <p>نحتفظ بحق تعليق أو إنهاء الحسابات التي تنتهك هذه الشروط.</p>
        </CardContent>
      </Card>
    </div>
  );
}
