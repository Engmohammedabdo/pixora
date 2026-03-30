'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Shield, Search } from 'lucide-react';
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
}

export default function AdminTopBar({ onSearchClick }: AdminTopBarProps) {
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
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-slate-950/50 px-6 backdrop-blur-md">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2.5 text-sm">
        <span className="text-slate-500">Admin</span>
        <span className="text-slate-700">/</span>
        <span className="font-semibold text-white">{currentPage}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search button */}
        <button
          onClick={onSearchClick}
          className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-slate-300"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 ring-1 ring-indigo-500/20">
          <Shield className="h-3 w-3 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-400">Admin</span>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          {loggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </header>
  );
}
