'use client';

import { useTranslations } from 'next-intl';
import { useUser } from '@/hooks/useUser';
import { Link } from '@/i18n/routing';
import { motion } from 'framer-motion';
import { staggerContainer, fadeInUp } from '@/lib/animations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditsWidget } from '@/components/layout/CreditsWidget';
import { ActivityTimeline } from '@/components/dashboard/ActivityTimeline';
import { ProfileCompletion } from '@/components/dashboard/ProfileCompletion';
import { UsageStats } from '@/components/dashboard/UsageStats';
import {
  Image as ImageIcon,
  Camera,
  LayoutGrid,
  Map,
  BarChart3,
  Mic,
  Film,
  Pencil,
  Lightbulb,
} from 'lucide-react';

const quickActions = [
  { href: '/creator', labelKey: 'creator', icon: ImageIcon, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300' },
  { href: '/photoshoot', labelKey: 'photoshoot', icon: Camera, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
  { href: '/campaign', labelKey: 'campaign', icon: LayoutGrid, color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300' },
  { href: '/plan', labelKey: 'plan', icon: Map, color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
  { href: '/analysis', labelKey: 'analysis', icon: BarChart3, color: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300' },
  { href: '/voiceover', labelKey: 'voiceover', icon: Mic, color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300' },
  { href: '/storyboard', labelKey: 'storyboard', icon: Film, color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { href: '/edit', labelKey: 'edit', icon: Pencil, color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300' },
  { href: '/prompt-builder', labelKey: 'promptBuilder', icon: Lightbulb, color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300' },
] as const;

export default function DashboardPage(): React.ReactElement {
  const t = useTranslations();
  const { profile } = useUser();

  return (
    <div className="p-6 space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold font-cairo">
          {profile?.name
            ? t('dashboard.welcomeUser', { name: profile.name })
            : t('dashboard.welcome')}
        </h1>
        <p className="text-[var(--color-text-secondary)] mt-1">
          {t('dashboard.welcomeMessage')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-4">{t('dashboard.quickActions')}</h2>
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {quickActions.map((action) => (
                <motion.div key={action.href} variants={fadeInUp}>
                  <Link href={action.href}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className={`shrink-0 p-2 rounded-lg ${action.color}`}>
                          <action.icon className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium min-w-0">
                          {t(`nav.${action.labelKey}`)}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <UsageStats />
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <ProfileCompletion />
          <div>
            <h2 className="text-lg font-semibold mb-4">{t('credits.balance')}</h2>
            <CreditsWidget />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dashboard.recentGenerations')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
