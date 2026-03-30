'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@/hooks/useUser';
import { Copy, Check, Gift, Users, Share2 } from 'lucide-react';
import { ComingSoonBanner } from '@/components/ui/coming-soon-banner';

export default function ReferralsPage(): React.ReactElement {
  const { profile } = useUser();
  const [copied, setCopied] = useState(false);
  const profileRecord = profile as Record<string, unknown> | null;
  const referralCode = (profileRecord?.referral_code as string) || 'PYRA-' + (profile?.id?.slice(0, 6).toUpperCase() || 'XXXXX');
  const referralLink = `https://pyrasuite.pyramedia.cloud/ar/signup?ref=${referralCode}`;

  const handleCopy = async (): Promise<void> => {
    toast.info('برنامج الإحالة قريباً!'); return;
  };

  const handleWhatsApp = (): void => {
    toast.info('برنامج الإحالة قريباً!'); return;
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold font-cairo">برنامج الإحالة</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">ادعُ أصدقاءك واكسب كريدت مجاني</p>
      </div>

      <ComingSoonBanner featureName="Referrals" featureNameAr="الإحالات" description="Invite friends and earn credits" descriptionAr="ادعُ أصدقاءك واكسب كريدت" />

      {/* How it works */}
      <Card className="bg-gradient-to-br from-primary-50 to-accent-50/30 dark:from-primary-900/20 dark:to-accent-900/10 border-primary-200 dark:border-primary-800">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <Gift className="h-6 w-6 text-primary-500" />
            </div>
            <div>
              <h2 className="font-semibold">كيف يشتغل؟</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">3 خطوات بسيطة</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center mx-auto mb-2 text-sm font-bold">1</div>
              <p className="text-xs">شارك رابطك</p>
            </div>
            <div className="text-center">
              <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center mx-auto mb-2 text-sm font-bold">2</div>
              <p className="text-xs">صديقك يسجّل</p>
            </div>
            <div className="text-center">
              <div className="h-8 w-8 rounded-full bg-primary-500 text-white flex items-center justify-center mx-auto mb-2 text-sm font-bold">3</div>
              <p className="text-xs">كلكم تاخذون 25 كريدت!</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Referral Link */}
      <Card>
        <CardHeader><CardTitle className="text-base">رابط الإحالة الخاص بك</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={referralLink} readOnly dir="ltr" className="text-xs font-mono" />
            <Button onClick={handleCopy} variant="outline" size="icon" className="flex-shrink-0">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleWhatsApp} className="flex-1 gap-2 bg-green-600 hover:bg-green-700">
              <Share2 className="h-4 w-4" /> شارك عبر WhatsApp
            </Button>
            <Button onClick={handleCopy} variant="outline" className="flex-1 gap-2">
              <Copy className="h-4 w-4" /> نسخ الرابط
            </Button>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">كود الإحالة: <Badge variant="secondary">{referralCode}</Badge></p>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> إحصائيات الإحالة</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-2xl font-bold text-primary-600">0</p><p className="text-xs text-[var(--color-text-muted)]">دعوات مرسلة</p></div>
            <div><p className="text-2xl font-bold text-green-600">0</p><p className="text-xs text-[var(--color-text-muted)]">تسجيلات ناجحة</p></div>
            <div><p className="text-2xl font-bold text-amber-600">0</p><p className="text-xs text-[var(--color-text-muted)]">كريدت مكتسب</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
