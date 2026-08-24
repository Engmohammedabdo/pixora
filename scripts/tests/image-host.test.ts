/**
 * Proof that the reference-image host allowlist is a HOST rule, not a suffix rule.
 *
 *   npx tsx scripts/tests/image-host.test.ts
 *
 * WHY THIS IS A BUILD GATE
 *
 * This is pure string logic in front of a server-side fetch. The rule it replaces
 * was `hostname.endsWith(h)`, which any registrar could sell you a seat on:
 * `xplacehold.co`, `notreplicate.delivery` and
 * `xoaidalleapiprodscus.blob.core.windows.net` are all ordinary registrations that
 * end with an allowed name — the last one especially, because an Azure Blob
 * storage account name is the FIRST LABEL and is chosen by whoever opens the
 * account. A suffix rule looks correct in review and is wrong in production, so it
 * gets a test.
 */
import { isAllowedImageHost } from '../../lib/ai/allowed-hosts';

let failures = 0;
let checks = 0;

function allow(host: string): void {
  checks++;
  if (!isAllowedImageHost(host)) {
    failures++;
    console.log(`FAIL  expected ALLOWED: ${host}`);
  }
}

function refuse(host: string): void {
  checks++;
  if (isAllowedImageHost(host)) {
    failures++;
    console.log(`FAIL  expected REFUSED: ${host}`);
  }
}

// ---- Hosts we own or already trust for bytes. ----
allow('pyramedia.cloud');
allow('pixoradb.pyramedia.cloud');
allow('placehold.co');
allow('replicate.delivery');
allow('oaidalleapiprodscus.blob.core.windows.net');
allow('OAIDALLEAPIPRODSCUS.BLOB.CORE.WINDOWS.NET'); // new URL() lower-cases; restate it

// ---- Every join the suffix rule accepted. Each is a real, purchasable name. ----
refuse('xplacehold.co');
refuse('evilplacehold.co');
refuse('notreplicate.delivery');
refuse('xoaidalleapiprodscus.blob.core.windows.net');
refuse('evilpyramedia.cloud');

// ---- The case that proves this is a suffix rule and not a substring rule. ----
refuse('placehold.co.evil.com');
refuse('pyramedia.cloud.attacker.net');

// ---- Internal targets. An IP literal ends with none of the allowed names, so the
//      exact match refuses these by construction — asserted so it stays true.
refuse('localhost');
refuse('169.254.169.254');
refuse('127.0.0.1');
refuse('[::1]');
refuse('metadata.google.internal');

if (failures > 0) {
  console.log(`\n[image-host] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[image-host] ${checks} checks passed`);
