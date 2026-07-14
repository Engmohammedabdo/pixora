'use client';

import { useTranslations } from 'next-intl';
import { useUser } from '@/hooks/useUser';
import { useUIStore } from '@/store/ui';
import { useCreditsStore } from '@/store/credits';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Menu, Coins, CreditCard, Globe, LogOut, Settings, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useLocale } from 'next-intl';
import { AnimatedNumber } from '@/components/shared/AnimatedNumber';

export function TopBar(): React.ReactElement {
  const t = useTranslations();
  const { user, profile, signOut } = useUser();
  const { toggleSidebar } = useUIStore();
  const { balance, loading: creditsLoading } = useCreditsStore();
  const pathname = usePathname();
  const router = useRouter();

  const initials = profile?.name
    ? profile.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const { theme, setTheme } = useTheme();

  // usePathname from i18n/routing strips the locale prefix, so read the
  // active locale from next-intl directly (pathname.startsWith('/en') is always false)
  const currentLocale = useLocale();
  const switchLocale = currentLocale === 'ar' ? 'en' : 'ar';

  const handleLocaleSwitch = (): void => {
    router.replace(pathname, { locale: switchLocale });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 sm:gap-4 border-b bg-surface px-4 sm:px-6">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={toggleSidebar}
        aria-label={t('nav.a11y.toggleMenu')}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Credits Badge */}
      <Link href="/billing" className="flex items-center gap-1.5">
        <Badge variant="secondary" className="gap-1 px-3 py-1">
          <Coins className="h-3.5 w-3.5 text-primary-500" />
          {creditsLoading ? (
            <Skeleton className="h-5 w-10" />
          ) : (
            <AnimatedNumber value={balance} className="font-semibold" />
          )}
        </Badge>
      </Link>

      {/* Theme Toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={t('nav.a11y.toggleTheme')}
      >
        <Sun className="h-4 w-4 hidden dark:block" />
        <Moon className="h-4 w-4 block dark:hidden" />
      </Button>

      {/* Language Switcher — hidden on small phones (also in user menu) */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleLocaleSwitch}
        aria-label={t('nav.a11y.switchLanguage')}
        className="hidden sm:inline-flex"
      >
        <Globe className="h-4 w-4" />
      </Button>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.name || ''} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{profile?.name || user?.email}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center gap-2 cursor-pointer">
              <Settings className="h-4 w-4" />
              {t('nav.settings')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/billing" className="flex items-center gap-2 cursor-pointer">
              <CreditCard className="h-4 w-4" />
              {t('nav.billing')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleLocaleSwitch}
            className="flex items-center gap-2 cursor-pointer sm:hidden"
          >
            <Globe className="h-4 w-4" />
            {currentLocale === 'ar' ? 'English' : 'العربية'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={signOut}
            className="flex items-center gap-2 cursor-pointer text-[var(--color-error)]"
          >
            <LogOut className="h-4 w-4" />
            {t('auth.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
