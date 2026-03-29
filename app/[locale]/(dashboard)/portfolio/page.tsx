'use client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/useUser';
import { Globe, Lock, Image, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function PortfolioPage(): React.ReactElement {
  const { profile } = useUser();

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold font-cairo flex items-center gap-2"><Globe className="h-6 w-6 text-primary-500" /> معرض أعمالي</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">أنشئ صفحة عامة لعرض أعمالك المُنشأة بالذكاء الاصطناعي</p>
      </div>

      <Card className="bg-gradient-to-br from-primary-50/50 to-accent-50/30 dark:from-primary-900/20 dark:to-accent-900/10">
        <CardContent className="p-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mx-auto">
            <Image className="h-8 w-8 text-primary-500" />
          </div>
          <h2 className="text-xl font-bold font-cairo">معرضك الشخصي قريباً!</h2>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-md mx-auto">
            قريباً ستتمكن من إنشاء صفحة عامة تعرض فيها أفضل أعمالك المُنشأة بـ PyraSuite. شاركها مع عملائك وأضفها لسيرتك الذاتية.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" /> قريباً</Badge>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            رابطك سيكون: pyrasuite.pyramedia.cloud/portfolio/{profile?.id?.slice(0, 8) || 'username'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
