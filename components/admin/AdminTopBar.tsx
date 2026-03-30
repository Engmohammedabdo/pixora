'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useState } from 'react';

const pageNames: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/users': 'Users',
  '/admin/generations': 'Generations',
  '/admin/transactions': 'Transactions',
  '/admin/studios': 'Studios',
  '/admin/models': 'AI Models',
  '/admin/prompts': 'Prompts',
  '/admin/settings': 'Settings',
  '/admin/logs': 'Logs',
};

function getBreadcrumb(pathname: string): string {
  // Exact match
  if (pageNames[pathname]) return pageNames[pathname];

  // Check prefix matches (e.g. /admin/users/[id])
  for (const [path, name] of Object.entries(pageNames)) {
    if (pathname.startsWith(path + '/')) return name;
  }

  return 'Admin';
}

export default function AdminTopBar() {
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-400">Admin</span>
        <span className="text-slate-300">/</span>
        <span className="font-medium text-slate-900">{currentPage}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
          Admin
        </span>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          {loggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </header>
  );
}
