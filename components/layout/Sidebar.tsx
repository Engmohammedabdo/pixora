'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui';
import { useCreditsStore } from '@/store/credits';
import { useUser } from '@/hooks/useUser';
import { getPlan } from '@/lib/stripe/plans';
import {
  Home,
  Image,
  Camera,
  LayoutGrid,
  Map,
  Film,
  BarChart3,
  Mic,
  Pencil,
  Lightbulb,
  Video,
  FolderOpen,
  ImageIcon,
  Palette,
  Users,
  Settings,
  CreditCard,
  X,
  Coins,
  ChevronLeft,
  ChevronRight,
  Gift,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
  soon?: boolean;
}

const studioItems: NavItem[] = [
  { href: '/creator', labelKey: 'creator', icon: <Image className="h-4 w-4" /> },
  { href: '/photoshoot', labelKey: 'photoshoot', icon: <Camera className="h-4 w-4" /> },
  { href: '/campaign', labelKey: 'campaign', icon: <LayoutGrid className="h-4 w-4" /> },
  { href: '/plan', labelKey: 'plan', icon: <Map className="h-4 w-4" /> },
  { href: '/storyboard', labelKey: 'storyboard', icon: <Film className="h-4 w-4" /> },
  { href: '/analysis', labelKey: 'analysis', icon: <BarChart3 className="h-4 w-4" /> },
  { href: '/voiceover', labelKey: 'voiceover', icon: <Mic className="h-4 w-4" /> },
  { href: '/edit', labelKey: 'edit', icon: <Pencil className="h-4 w-4" /> },
  { href: '/prompt-builder', labelKey: 'promptBuilder', icon: <Lightbulb className="h-4 w-4" /> },
  { href: '/video', labelKey: 'video', icon: <Video className="h-4 w-4" />, soon: true },
];

const workspaceItems: NavItem[] = [
  { href: '/projects', labelKey: 'projects', icon: <FolderOpen className="h-4 w-4" />, soon: true },
  { href: '/assets', labelKey: 'assets', icon: <ImageIcon className="h-4 w-4" /> },
  { href: '/brand-kit', labelKey: 'brandKit', icon: <Palette className="h-4 w-4" /> },
  { href: '/community', labelKey: 'community' as 'projects', icon: <Users className="h-4 w-4" />, soon: true },
  { href: '/referrals', labelKey: 'referrals' as 'projects', icon: <Gift className="h-4 w-4" />, soon: true },
];

const accountItems: NavItem[] = [
  { href: '/team', labelKey: 'team', icon: <Users className="h-4 w-4" />, soon: true },
  { href: '/settings', labelKey: 'settings', icon: <Settings className="h-4 w-4" /> },
  { href: '/billing', labelKey: 'billing', icon: <CreditCard className="h-4 w-4" /> },
];

export function Sidebar(): React.ReactElement {
  const t = useTranslations('nav');
  const tCredits = useTranslations('credits');
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, toggleCollapsed } = useUIStore();
  const { balance } = useCreditsStore();
  const { profile } = useUser();
  const planCredits = getPlan(profile?.plan_id || 'free').credits;

  const renderNavItem = (item: NavItem): React.ReactElement => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSidebarOpen(false)}
        title={sidebarCollapsed ? t(item.labelKey) : undefined}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          sidebarCollapsed && 'justify-center px-2',
          isActive
            ? 'bg-primary-50 text-primary-600 font-medium'
            : 'text-[var(--color-text-secondary)] hover:bg-surface-2 hover:text-[var(--color-text-primary)]',
          item.soon && 'opacity-50 pointer-events-none'
        )}
      >
        {item.icon}
        {!sidebarCollapsed && <span className="flex-1">{t(item.labelKey)}</span>}
        {!sidebarCollapsed && item.soon && (
          <span className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded-full">
            {t('soon')}
          </span>
        )}
      </Link>
    );
  };

  const renderSection = (title: string, items: NavItem[]): React.ReactElement => (
    <div className="space-y-1">
      {!sidebarCollapsed && (
        <p className="px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          {title}
        </p>
      )}
      {items.map(renderNavItem)}
    </div>
  );

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="text-xl font-bold text-primary-600 font-cairo">
          {sidebarCollapsed ? 'P' : 'PyraSuite'}
        </Link>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1 rounded-md hover:bg-surface-2"
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          onClick={toggleCollapsed}
          className="hidden lg:flex p-1 rounded-md hover:bg-surface-2"
          aria-label="Toggle sidebar"
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4 rtl:rotate-180" /> : <ChevronLeft className="h-4 w-4 rtl:rotate-180" />}
        </button>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
        {/* Home */}
        <div>
          {renderNavItem({ href: '/dashboard', labelKey: 'home', icon: <Home className="h-4 w-4" /> })}
        </div>

        {renderSection(t('studios'), studioItems)}
        {renderSection(t('workspace'), workspaceItems)}
        {renderSection(t('account'), accountItems)}
      </nav>

      {/* Credits Widget at Bottom */}
      <div className="border-t p-4 space-y-2">
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-1" title={tCredits('balance')}>
            <Coins className="h-4 w-4 text-primary-500" />
            <span className="text-xs font-bold text-primary-600">{balance}</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-primary-500" />
                <span className="font-medium">{tCredits('balance')}</span>
              </div>
              <span className="font-bold text-primary-600">{balance}</span>
            </div>
            <Progress value={Math.min((balance / planCredits) * 100, 100)} className="h-2" />
            <Link
              href="/billing"
              className="block text-center text-xs text-primary-500 hover:underline"
            >
              {tCredits('add')}
            </Link>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-50 w-64 bg-surface border-e transition-transform duration-300 lg:hidden',
          sidebarOpen ? 'translate-x-0 rtl:-translate-x-0' : '-translate-x-full rtl:translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className={cn('hidden lg:flex lg:flex-col lg:border-e lg:bg-surface h-screen sticky top-0 transition-all duration-200', sidebarCollapsed ? 'lg:w-16' : 'lg:w-64')}>
        {sidebarContent}
      </aside>
    </>
  );
}
