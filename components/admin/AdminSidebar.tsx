'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  TrendingUp,
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
  Hexagon,
} from 'lucide-react';

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
};

type NavSeparator = {
  type: 'separator';
  label?: string;
};

type NavItem = NavLink | NavSeparator;

const navItems: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/analytics', label: 'Analytics', icon: TrendingUp },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/generations', label: 'Generations', icon: Palette },
  { href: '/admin/transactions', label: 'Transactions', icon: CreditCard },
  { type: 'separator', label: 'God Mode' },
  { href: '/admin/studios', label: 'Studios', icon: SlidersHorizontal },
  { href: '/admin/models', label: 'AI Models', icon: Bot },
  { href: '/admin/prompts', label: 'Prompts', icon: FileText },
  { type: 'separator', label: 'System' },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/logs', label: 'Logs', icon: ScrollText },
];

export default function AdminSidebar({ collapsed, onToggle }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`group/sidebar relative flex flex-col border-e border-white/[0.06] bg-slate-950/80 backdrop-blur-xl transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 opacity-90" />
          <Hexagon className="relative h-5 w-5 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-white">PyraSuite</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-indigo-400">Admin</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navItems.map((item, index) => {
          if ('type' in item) {
            return (
              <div key={`sep-${index}`} className="mb-2 mt-5 first:mt-0">
                {!collapsed && item.label && (
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    {item.label}
                  </span>
                )}
                {collapsed && <div className="mx-auto my-2 w-6 border-t border-white/10" />}
              </div>
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
              className={`group relative mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-indigo-500/15 to-violet-500/10 text-white shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
              }`}
            >
              {isActive && (
                <div className="absolute -start-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-e-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
              )}
              <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-white/[0.06] p-3">
        <button
          onClick={onToggle}
          className="flex h-9 w-full items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
