'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { LowCreditsBanner } from '@/components/shared/LowCreditsBanner';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useUser } from '@/hooks/useUser';
import { useCreditsStore } from '@/store/credits';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps): React.ReactElement {
  const { profile } = useUser();
  const setBalance = useCreditsStore((s) => s.setBalance);
  useKeyboardShortcuts();

  useEffect(() => {
    if (profile) {
      setBalance(profile.credits_balance + (profile.purchased_credits || 0));
    }
  }, [profile, setBalance]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <TopBar />
        <LowCreditsBanner />
        <CommandPalette />
        <main className="flex-1 bg-[var(--color-bg)] pb-14 lg:pb-0">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
            {children}
          </motion.div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
