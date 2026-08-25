/**
 * Where `POST /api/brand-kits/extract` finds the n8n webhook it calls.
 *
 * Pulled out of the route so the "either var missing -> refuse immediately"
 * rule is a pure function: no request, no Supabase client, nothing that
 * requires a live server to exercise. That is what lets
 * scripts/tests/brand-extract.test.ts assert the `extract_unavailable` branch
 * with no network and no database — it calls this function directly with
 * process.env mutated, not the route handler.
 */
export interface N8nBrandDnaConfig {
  url: string;
  secret: string;
}

/**
 * Returns null if EITHER variable is absent. The route on a null result
 * returns `extract_unavailable` without attempting the call — onboarding
 * falls back to the typed form instantly instead of waiting on a request
 * that was never going to work.
 */
export function getN8nBrandDnaConfig(): N8nBrandDnaConfig | null {
  const url = process.env.N8N_BRAND_DNA_WEBHOOK_URL;
  const secret = process.env.N8N_BRAND_DNA_SECRET;
  if (!url || !secret) return null;
  return { url, secret };
}
