'use client';

import { Command } from 'cmdk';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Users,
  Palette,
  CreditCard,
  ScrollText,
  LayoutDashboard,
  TrendingUp,
  Settings,
  Activity,
  SlidersHorizontal,
  Bot,
  FileText,
} from 'lucide-react';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  href: string;
}

interface SearchResults {
  users: SearchResult[];
  generations: SearchResult[];
  transactions: SearchResult[];
  logs: SearchResult[];
}

const quickActions = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Analytics', href: '/admin/analytics', icon: TrendingUp },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Generations', href: '/admin/generations', icon: Palette },
  { label: 'Transactions', href: '/admin/transactions', icon: CreditCard },
  { label: 'Studios', href: '/admin/studios', icon: SlidersHorizontal },
  { label: 'AI Models', href: '/admin/models', icon: Bot },
  { label: 'Prompts', href: '/admin/prompts', icon: FileText },
  { label: 'System Health', href: '/admin/health', icon: Activity },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
  { label: 'Logs', href: '/admin/logs', icon: ScrollText },
  { label: 'User Segments', href: '/admin/users/segments', icon: Users },
];

const groupIcons: Record<string, typeof Users> = {
  users: Users,
  generations: Palette,
  transactions: CreditCard,
  logs: ScrollText,
};

const groupLabels: Record<string, string> = {
  users: 'Users',
  generations: 'Generations',
  transactions: 'Transactions',
  logs: 'Admin Logs',
};

interface AdminCommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function AdminCommandPalette({ open, onClose }: AdminCommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success) setResults(data.data);
    } catch { /* ignore */ }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length >= 2) {
      debounceRef.current = setTimeout(() => search(query), 250);
    } else {
      setResults(null);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
    }
  }, [open]);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  const hasResults = results && (results.users.length > 0 || results.generations.length > 0 || results.transactions.length > 0 || results.logs.length > 0);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative mx-auto mt-[15vh] w-full max-w-[560px] px-4">
        <Command
          className="overflow-hidden rounded-2xl border border-white/[0.1] bg-slate-900/95 shadow-2xl backdrop-blur-xl"
          shouldFilter={false}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-white/[0.06] px-4">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search users, generations, or type a command..."
              className="h-12 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <kbd className="hidden rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-500 sm:inline-block">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            {/* Loading */}
            {searching && (
              <div className="px-3 py-6 text-center text-xs text-slate-500">Searching...</div>
            )}

            {/* No results */}
            {query.length >= 2 && !searching && !hasResults && (
              <Command.Empty className="px-3 py-6 text-center text-xs text-slate-500">
                No results found for &ldquo;{query}&rdquo;
              </Command.Empty>
            )}

            {/* Search results */}
            {hasResults && results && (
              <>
                {(Object.keys(groupLabels) as (keyof SearchResults)[]).map(group => {
                  const items = results[group];
                  if (items.length === 0) return null;
                  const Icon = groupIcons[group];

                  return (
                    <Command.Group
                      key={group}
                      heading={
                        <div className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                          <Icon className="h-3 w-3" />
                          {groupLabels[group]}
                        </div>
                      }
                    >
                      {items.map(item => (
                        <Command.Item
                          key={item.id}
                          value={item.title}
                          onSelect={() => navigate(item.href)}
                          className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors data-[selected=true]:bg-white/[0.06]"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-200 truncate">{item.title}</p>
                            <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                          </div>
                          {item.badge && (
                            <span className="shrink-0 rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 ring-1 ring-indigo-500/20">
                              {item.badge}
                            </span>
                          )}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  );
                })}
              </>
            )}

            {/* Quick actions (shown when no search query) */}
            {query.length < 2 && !searching && (
              <Command.Group
                heading={
                  <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    Quick Navigation
                  </div>
                }
              >
                {quickActions.map(action => {
                  const Icon = action.icon;
                  return (
                    <Command.Item
                      key={action.href}
                      value={action.label}
                      onSelect={() => navigate(action.href)}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors data-[selected=true]:bg-white/[0.06]"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="text-slate-300">{action.label}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-2">
            <div className="flex items-center gap-3 text-[10px] text-slate-600">
              <span><kbd className="rounded border border-white/10 px-1 font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="rounded border border-white/10 px-1 font-mono">↵</kbd> select</span>
              <span><kbd className="rounded border border-white/10 px-1 font-mono">esc</kbd> close</span>
            </div>
            <span className="text-[10px] text-slate-600">PyraSuite Admin</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
