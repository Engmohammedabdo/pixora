'use client';

import { Command } from 'cmdk';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
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
  labelKey: string;
  href: string;
  icon: LucideIcon;
}

interface CommandGroup {
  groupKey: string;
  items: CommandItemDef[];
}

const COMMANDS: CommandGroup[] = [
  {
    groupKey: 'groups.studios',
    items: [
      { labelKey: 'items.creator', href: '/creator', icon: Image },
      { labelKey: 'items.photoshoot', href: '/photoshoot', icon: Camera },
      { labelKey: 'items.campaign', href: '/campaign', icon: LayoutGrid },
      { labelKey: 'items.plan', href: '/plan', icon: Map },
      { labelKey: 'items.storyboard', href: '/storyboard', icon: Film },
      { labelKey: 'items.analysis', href: '/analysis', icon: BarChart3 },
      { labelKey: 'items.voiceover', href: '/voiceover', icon: Mic },
      { labelKey: 'items.edit', href: '/edit', icon: Pencil },
      { labelKey: 'items.promptBuilder', href: '/prompt-builder', icon: Lightbulb },
    ],
  },
  {
    groupKey: 'groups.workspace',
    items: [
      { labelKey: 'items.dashboard', href: '/dashboard', icon: Home },
      { labelKey: 'items.brandKit', href: '/brand-kit', icon: Palette },
      { labelKey: 'items.assets', href: '/assets', icon: FolderOpen },
      { labelKey: 'items.settings', href: '/settings', icon: Settings },
      { labelKey: 'items.billing', href: '/billing', icon: CreditCard },
    ],
  },
];

export function CommandPalette(): React.ReactElement {
  const t = useTranslations('commandPalette');
  const locale = useLocale();
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
      <DialogContent className="p-0 sm:p-0 max-w-lg overflow-hidden">
        <Command className="rounded-lg" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          <Command.Input
            placeholder={t('placeholder')}
            className="h-12 text-sm w-full border-b px-4 outline-none bg-transparent"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-[var(--color-text-muted)]">
              {t('empty')}
            </Command.Empty>
            {COMMANDS.map((group) => (
              <Command.Group
                key={group.groupKey}
                heading={t(group.groupKey)}
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-[var(--color-text-muted)]"
              >
                {group.items.map((item) => (
                  <Command.Item
                    key={item.href}
                    onSelect={() => handleSelect(item.href)}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer rounded-md text-sm aria-selected:bg-surface-2"
                  >
                    <item.icon className="h-4 w-4 text-[var(--color-text-muted)]" />
                    <span>{t(item.labelKey)}</span>
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
