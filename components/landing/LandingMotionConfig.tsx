'use client';

import { MotionConfig } from 'framer-motion';

/**
 * Honors the visitor's prefers-reduced-motion setting for all
 * framer-motion animations on the landing page.
 */
export function LandingMotionConfig({ children }: { children: React.ReactNode }): React.ReactElement {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
