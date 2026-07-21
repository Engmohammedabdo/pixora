import { setRequestLocale } from 'next-intl/server';
import { NavBar } from '@/components/landing/NavBar';
import { HeroSection } from '@/components/landing/HeroSection';
import { ValuePillars } from '@/components/landing/ValuePillars';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { InteractiveDemo } from '@/components/landing/InteractiveDemo';
import { StudiosShowcase } from '@/components/landing/StudiosShowcase';
import StatsSection from '@/components/landing/StatsSection';
import PricingSection from '@/components/landing/PricingSection';
import { SocialProof } from '@/components/landing/SocialProof';
import { FaqSection } from '@/components/landing/FaqSection';
import { FinalCta } from '@/components/landing/FinalCta';
import { Footer } from '@/components/landing/Footer';
import { LandingMotionConfig } from '@/components/landing/LandingMotionConfig';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildStructuredData } from '@/lib/seo/schema';

// Public, logged-out-and-logged-in-identical marketing page (verified: NavBar
// and every section here are 'use client' components with no auth/session
// branching, and middleware.ts's isPublicPath() short-circuits before the
// Supabase auth check ever runs for this route) — safe to cache. 1 hour keeps
// the origin-render savings (the actual win) while still propagating copy
// edits same-day; a redeploy invalidates the cache immediately regardless.
export const revalidate = 3600;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const structuredData = buildStructuredData(locale);

  return (
    <LandingMotionConfig>
      <div className="min-h-screen bg-[var(--color-bg)]">
        <JsonLd data={structuredData} />
        <NavBar />
        <HeroSection />
        <ValuePillars />
        <HowItWorks />
        <InteractiveDemo />
        <StudiosShowcase />
        <StatsSection />
        <PricingSection />
        <SocialProof />
        <FaqSection />
        <FinalCta />
        <Footer />
      </div>
    </LandingMotionConfig>
  );
}
