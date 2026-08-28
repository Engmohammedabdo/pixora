/**
 * One place that knows the Meta Pixel id. Imported by BOTH the browser tag
 * (components/analytics/MetaPixel.tsx) and the server-side Conversions API
 * sender (lib/analytics/meta-capi.ts), so the two can never drift onto
 * different pixels — the failure would be browser events in one Events Manager
 * property and server purchases in another, each half looking mysteriously
 * incomplete.
 *
 * A separate file rather than a line in config.ts, deliberately: config.ts
 * reads GA4_API_SECRET, and this module is imported into a client component.
 * Next would not leak the secret's VALUE into the bundle (only NEXT_PUBLIC_*
 * vars are inlined client-side), but a client import of a module that touches
 * a server secret is exactly the kind of ambiguity that gets "fixed" wrongly
 * later. This file is client-safe by construction.
 *
 * The id itself is public — it ships in the page source of every site running
 * a pixel — so a hardcoded fallback is safe, and mirrors how GoogleAnalytics
 * falls back to the hardcoded GA4 property.
 */
export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID || '945169027980538';
