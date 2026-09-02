import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { NavBar } from '@/components/landing/NavBar';
import { HeroSection } from '@/components/landing/HeroSection';
import { ValuePillars } from '@/components/landing/ValuePillars';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { KnowsYourBusiness } from '@/components/landing/KnowsYourBusiness';
import { InteractiveDemo } from '@/components/landing/InteractiveDemo';
import { StudiosShowcase } from '@/components/landing/StudiosShowcase';
import { ComparisonSection } from '@/components/landing/ComparisonSection';
import StatsSection from '@/components/landing/StatsSection';
import PricingSection from '@/components/landing/PricingSection';
import { SocialProof } from '@/components/landing/SocialProof';
import { FaqSection } from '@/components/landing/FaqSection';
import { FinalCta } from '@/components/landing/FinalCta';
import { Footer } from '@/components/landing/Footer';
import { LandingMotionConfig } from '@/components/landing/LandingMotionConfig';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildStructuredData } from '@/lib/seo/schema';
import { publicAlternates } from '@/lib/seo/alternates';

/**
 * ONLY `alternates`. The layout's site-wide canonical was deleted on 2026-09-02
 * so that inner pages stop claiming to be duplicates of this one — and that
 * deletion left THIS page, the URL a launch announcement points at, with no
 * canonical and no hreflang at all (measured on the built ar.html/en.html).
 * Title, description, openGraph and the file-based og:image are deliberately
 * NOT returned here: Next merges `openGraph` shallowly, so a page-level object
 * would replace the [locale] segment's — image included. Inheriting is the point.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: publicAlternates(locale, '') };
}

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
        {/* SHOW BEFORE TELL — moved here from sixth position, 2026-08-29.
            This page is bought for paid traffic arriving from an image ad, and
            the only question that click raises is "can it really make that?".
            The answer used to sit behind five screens of telling: pillars, three
            steps, business-context, and only then a real generated output.
            A cold visitor who came for the picture had to be persuaded to keep
            scrolling to reach the picture. Now the proof is the first thing
            after the promise, and everything below argues about a thing the
            reader has already seen work. */}
        <InteractiveDemo />
        <ValuePillars />
        <HowItWorks />
        {/* Directly after the three steps. The reader has just been told the
            whole product is three steps, so the immediate objection is "then how
            would it know anything about MY business?" — this answers it in the
            same scroll.
            NOTE: this comment used to end "and the examples below then prove it".
            They no longer sit below; InteractiveDemo moved above ValuePillars in
            the same change. The demo now SETS UP this section instead of
            confirming it, which is the weaker of the two orders for this one
            section and the deliberate price of showing proof early. */}
        <KnowsYourBusiness />
        <StudiosShowcase />
        {/* Placed after the studios and before pricing on purpose: the comparison
            only lands once the reader knows what the nine studios are, and it is
            what makes the price feel like a different category of purchase. */}
        <ComparisonSection />
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
