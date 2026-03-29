'use client';
import { usePathname } from '@/i18n/routing';
import { Link } from '@/i18n/routing';
import { Home, Image, LayoutGrid, ImageIcon, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui';

const NAV_ITEMS = [
  { href: '/dashboard', icon: Home, label: 'الرئيسية' },
  { href: '/creator', icon: Image, label: 'منشئ' },
  { href: '/campaign', icon: LayoutGrid, label: 'حملات' },
  { href: '/assets', icon: ImageIcon, label: 'ملفاتي' },
];

export function BottomNav(): React.ReactElement {
  const pathname = usePathname();
  const { toggleSidebar } = useUIStore();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-[var(--color-surface)] border-t lg:hidden">
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className={cn('flex flex-col items-center gap-0.5 px-3 py-1', isActive ? 'text-primary-500' : 'text-[var(--color-text-muted)]')}>
              <item.icon className="h-5 w-5" />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
        <button onClick={toggleSidebar} className="flex flex-col items-center gap-0.5 px-3 py-1 text-[var(--color-text-muted)]">
          <Menu className="h-5 w-5" />
          <span className="text-[10px]">المزيد</span>
        </button>
      </div>
    </nav>
  );
}
