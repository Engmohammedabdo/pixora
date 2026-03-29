'use client';

import { useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { LowCreditsBanner } from '@/components/shared/LowCreditsBanner';
import { useUser } from '@/hooks/useUser';
import { useCreditsStore } from '@/store/credits';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps): React.ReactElement {
  const { profile } = useUser();
  const setBalance = useCreditsStore((s) => s.setBalance);

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
        <main className="flex-1 bg-[var(--color-bg)]">
          {children}
        </main>
      </div>
    </div>
  );
}
