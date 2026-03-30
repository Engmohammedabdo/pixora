'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Palette,
  CreditCard,
  SlidersHorizontal,
  Bot,
  FileText,
  Settings,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type NavSeparator = {
  type: 'separator';
};

type NavItem = NavLink | NavSeparator;

const navItems: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/generations', label: 'Generations', icon: Palette },
  { href: '/admin/transactions', label: 'Transactions', icon: CreditCard },
  { type: 'separator' },
  { href: '/admin/studios', label: 'Studios', icon: SlidersHorizontal },
  { href: '/admin/models', label: 'AI Models', icon: Bot },
  { href: '/admin/prompts', label: 'Prompts', icon: FileText },
  { type: 'separator' },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/logs', label: 'Logs', icon: ScrollText },
];

export default function AdminSidebar({ collapsed, onToggle }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex flex-col bg-slate-900 text-slate-300 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-slate-800 px-4">
        <Zap className="h-5 w-5 shrink-0 text-indigo-400" />
        {!collapsed && (
          <span className="text-sm font-semibold text-white">PyraSuite Admin</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navItems.map((item, index) => {
          if ('type' in item) {
            return (
              <div
                key={`sep-${index}`}
                className="mx-4 my-2 border-t border-slate-800"
              />
            );
          }

          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/admin/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mx-2 mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-s-[3px] border-indigo-500 bg-slate-800 text-white'
                  : 'border-s-[3px] border-transparent hover:bg-slate-800/50 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex h-10 items-center justify-center border-t border-slate-800 text-slate-400 transition-colors hover:text-white"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
