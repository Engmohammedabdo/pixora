'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Shield, Search, Menu } from 'lucide-react';
import { useState } from 'react';

const pageNames: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/analytics': 'Analytics',
  '/admin/users': 'Users',
  '/admin/generations': 'Generations',
  '/admin/transactions': 'Transactions',
  '/admin/studios': 'Studios',
  '/admin/models': 'AI Models',
  '/admin/prompts': 'Prompts',
  '/admin/health': 'System Health',
  '/admin/settings': 'Settings',
  '/admin/logs': 'Logs',
};

function getBreadcrumb(pathname: string): string {
  if (pageNames[pathname]) return pageNames[pathname];
  for (const [path, name] of Object.entries(pageNames)) {
    if (pathname.startsWith(path + '/')) return name;
  }
  return 'Admin';
}

interface AdminTopBarProps {
  onSearchClick?: () => void;
  onMenuClick?: () => void;
}

export default function AdminTopBar({ onSearchClick, onMenuClick }: AdminTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const currentPage = getBreadcrumb(pathname);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/admin/auth/logout', { method: 'POST' });
      router.push('/admin/login');
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] bg-slate-950/50 px-4 backdrop-blur-md sm:h-16 sm:px-6">
      {/* Left: hamburger + breadcrumb */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuClick}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-slate-500 sm:inline">Admin</span>
          <span className="hidden text-slate-700 sm:inline">/</span>
          <span className="font-semibold text-white">{currentPage}</span>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search button */}
        <button
          onClick={onSearchClick}
          className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-slate-500 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-slate-300 sm:px-3"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium md:inline-block">
            ⌘K
          </kbd>
        </button>

        <div className="hidden items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 ring-1 ring-indigo-500/20 sm:flex">
          <Shield className="h-3 w-3 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-400">Admin</span>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50 sm:px-3"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{loggingOut ? 'Logging out...' : 'Logout'}</span>
        </button>
      </div>
    </header>
  );
}
