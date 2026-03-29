import { NavBar } from '@/components/landing/NavBar';
import { HeroSection } from '@/components/landing/HeroSection';
import { ValuePillars } from '@/components/landing/ValuePillars';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { StudiosShowcase } from '@/components/landing/StudiosShowcase';
import StatsSection from '@/components/landing/StatsSection';
import PricingSection from '@/components/landing/PricingSection';
import { SocialProof } from '@/components/landing/SocialProof';
import { FaqSection } from '@/components/landing/FaqSection';
import { FinalCta } from '@/components/landing/FinalCta';
import { Footer } from '@/components/landing/Footer';

export default function LandingPage(): React.ReactElement {
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <NavBar />
      <HeroSection />
      <ValuePillars />
      <HowItWorks />
      <StudiosShowcase />
      <StatsSection />
      <PricingSection />
      <SocialProof />
      <FaqSection />
      <FinalCta />
      <Footer />
    </div>
  );
}
