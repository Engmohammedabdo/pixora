'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/hooks/useUser';
import { Settings } from 'lucide-react';

export default function SettingsPage(): React.ReactElement {
  const t = useTranslations('settings');
  const { profile } = useUser();

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold font-cairo">{t('title')}</h1>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" />{t('profile')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>{t('language')}:</strong> {profile?.locale === 'ar' ? t('arabic') : t('english')}</p>
          <p><strong>Email:</strong> {profile?.email || '-'}</p>
          <p><strong>Plan:</strong> {profile?.plan_id || 'free'}</p>
        </CardContent>
      </Card>
    </div>
  );
}
