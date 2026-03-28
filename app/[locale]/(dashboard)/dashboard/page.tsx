'use client';

import { useTranslations } from 'next-intl';
import { useUser } from '@/hooks/useUser';
import { Link } from '@/i18n/routing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditsWidget } from '@/components/layout/CreditsWidget';
import {
  Image,
  Camera,
  LayoutGrid,
  Map,
  BarChart3,
  Mic,
} from 'lucide-react';

const quickActions = [
  { href: '/creator', labelKey: 'creator', icon: Image, color: 'bg-purple-100 text-purple-600' },
  { href: '/photoshoot', labelKey: 'photoshoot', icon: Camera, color: 'bg-blue-100 text-blue-600' },
  { href: '/campaign', labelKey: 'campaign', icon: LayoutGrid, color: 'bg-green-100 text-green-600' },
  { href: '/plan', labelKey: 'plan', icon: Map, color: 'bg-amber-100 text-amber-600' },
  { href: '/analysis', labelKey: 'analysis', icon: BarChart3, color: 'bg-rose-100 text-rose-600' },
  { href: '/voiceover', labelKey: 'voiceover', icon: Mic, color: 'bg-cyan-100 text-cyan-600' },
] as const;

export default function DashboardPage(): React.ReactElement {
  const t = useTranslations();
  const { profile } = useUser();

  return (
    <div className="p-6 space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold font-cairo">
          {t('dashboard.welcome')}، {profile?.name || ''}
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          {t('dashboard.welcomeMessage')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">{t('dashboard.quickActions')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className={`p-2 rounded-lg ${action.color}`}>
                      <action.icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium">
                      {t(`nav.${action.labelKey}`)}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Credits Widget */}
        <div>
          <h2 className="text-lg font-semibold mb-4">{t('credits.balance')}</h2>
          <CreditsWidget />

          {/* Recent Generations */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">{t('dashboard.recentGenerations')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--color-text-muted)]">
                {t('dashboard.noGenerations')}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
