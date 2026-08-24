/**
 * Proof that an inline reference image is bounded before it costs anything.
 *
 *   npx tsx scripts/tests/reference-image.test.ts
 *
 * The https path was capped at 20 MB and the data: path was not, so the inline
 * form was the way in that skipped the ceiling. The cap is asserted on the RAW
 * STRING, because that is what the request carries and what the schema can refuse
 * BEFORE the generations insert and before the credit reservation.
 */
import {
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGE_URL_CHARS,
  inputImageRef,
  readableImageUrl,
} from '../../lib/storage/reference-image';

let failures = 0;
let checks = 0;

function accepts(label: string, value: string): void {
  checks++;
  if (!readableImageUrl.safeParse(value).success) {
    failures++;
    console.log(`FAIL  expected ACCEPTED: ${label}`);
  }
}

function refuses(label: string, value: string): void {
  checks++;
  if (readableImageUrl.safeParse(value).success) {
    failures++;
    console.log(`FAIL  expected REFUSED: ${label}`);
  }
}

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ---- Shapes the server can actually read. ----
accepts('an https URL', 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/a.png');
accepts('a small inline png', `data:image/png;base64,${'A'.repeat(1000)}`);

// ---- Shapes it cannot read server-side. ----
refuses('a blob: URL', 'blob:https://pyrasuite.pyramedia.cloud/8f3c-1');
refuses('a plain http URL', 'http://pixoradb.pyramedia.cloud/a.png');
refuses('a relative path', '/uploads/a.png');
refuses('an empty string', '');
refuses('a non-image data URL', `data:text/html;base64,${'A'.repeat(100)}`);

// ---- The ceiling. ----
accepts(
  'an inline payload just under the cap',
  `data:image/png;base64,${'A'.repeat(MAX_REFERENCE_IMAGE_URL_CHARS - 30)}`
);
refuses(
  'an inline payload past the cap',
  `data:image/png;base64,${'A'.repeat(MAX_REFERENCE_IMAGE_URL_CHARS + 1)}`
);

// ---- The cap must correspond to 20 MB decoded, not to a magic number. ----
check(
  'the char cap decodes to at most MAX_REFERENCE_IMAGE_BYTES',
  Math.floor(((MAX_REFERENCE_IMAGE_URL_CHARS - 128) * 3) / 4) <= MAX_REFERENCE_IMAGE_BYTES,
  true
);

// ---- What reaches generations.input. ----
check(
  'an https URL is recorded as itself',
  inputImageRef('https://x.pyramedia.cloud/a.png'),
  'https://x.pyramedia.cloud/a.png'
);
{
  const ref = inputImageRef(`data:image/jpeg;base64,${'A'.repeat(4000)}`);
  checks++;
  if (ref.includes('AAAA') || !ref.includes('image/jpeg')) {
    failures++;
    console.log(`FAIL  an inline payload must be summarised, not stored — got ${ref.slice(0, 60)}`);
  }
}

if (failures > 0) {
  console.log(`\n[reference-image] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[reference-image] ${checks} checks passed`);
