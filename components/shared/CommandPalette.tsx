'use client';

import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Image,
  Camera,
  LayoutGrid,
  Map,
  Film,
  BarChart3,
  Mic,
  Pencil,
  Lightbulb,
  Home,
  Palette,
  FolderOpen,
  Settings,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CommandItemDef {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface CommandGroup {
  group: string;
  items: CommandItemDef[];
}

const COMMANDS: CommandGroup[] = [
  {
    group: 'الاستوديوهات',
    items: [
      { label: 'منشئ الصور', href: '/creator', icon: Image },
      { label: 'تصوير المنتجات', href: '/photoshoot', icon: Camera },
      { label: 'مخطط الحملات', href: '/campaign', icon: LayoutGrid },
      { label: 'الخطة التسويقية', href: '/plan', icon: Map },
      { label: 'ستوري بورد', href: '/storyboard', icon: Film },
      { label: 'التحليل التسويقي', href: '/analysis', icon: BarChart3 },
      { label: 'التعليق الصوتي', href: '/voiceover', icon: Mic },
      { label: 'تعديل الصور', href: '/edit', icon: Pencil },
      { label: 'مساعد البرومبت', href: '/prompt-builder', icon: Lightbulb },
    ],
  },
  {
    group: 'مساحة العمل',
    items: [
      { label: 'الرئيسية', href: '/dashboard', icon: Home },
      { label: 'الهوية البصرية', href: '/brand-kit', icon: Palette },
      { label: 'ملفاتي', href: '/assets', icon: FolderOpen },
      { label: 'الإعدادات', href: '/settings', icon: Settings },
      { label: 'الفواتير', href: '/billing', icon: CreditCard },
    ],
  },
];

export function CommandPalette(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleSelect = (href: string): void => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-lg overflow-hidden">
        <Command className="rounded-lg" dir="rtl">
          <Command.Input
            placeholder="ابحث عن استوديو أو صفحة..."
            className="h-12 text-sm w-full border-b px-4 outline-none bg-transparent"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-[var(--color-text-muted)]">
              لا توجد نتائج
            </Command.Empty>
            {COMMANDS.map((group) => (
              <Command.Group
                key={group.group}
                heading={group.group}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--color-text-muted)]"
              >
                {group.items.map((item) => (
                  <Command.Item
                    key={item.href}
                    onSelect={() => handleSelect(item.href)}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer rounded-md text-sm aria-selected:bg-surface-2"
                  >
                    <item.icon className="h-4 w-4 text-[var(--color-text-muted)]" />
                    <span>{item.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
