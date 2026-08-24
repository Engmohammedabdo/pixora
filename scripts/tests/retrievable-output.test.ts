/**
 * Proof that a retrievable output can never be a multi-megabyte response.
 *
 *   npx tsx scripts/tests/retrievable-output.test.ts
 *
 * The detail route refuses the image studios because their `output` holds
 * 904 kB - 2.8 MB of base64. Campaign is being ADDED to the retrievable set, and
 * its output carries an imageUrl per post that lib/storage/persist-image.ts fills
 * with a base64 data: URL on four degradation paths. stripInlineImages() is the
 * guard that makes the addition safe.
 *
 * The rule is stated on the VALUE, not on the key name `imageUrl` — a blacklist of
 * key names is the same shape of mistake as migration 038 v1's blacklist on OLD,
 * which a NULL hop walked straight through.
 */
import {
  MAX_RETRIEVABLE_OUTPUT_BYTES,
  RETRIEVABLE_STUDIOS,
  isRetrievableStudio,
  stripInlineImages,
} from '../../lib/studios/text-output';

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ---- The set. ----
check('campaign is retrievable', isRetrievableStudio('campaign'), true);
check('plan is retrievable', isRetrievableStudio('plan'), true);
check('analysis is retrievable', isRetrievableStudio('analysis'), true);
check('storyboard is retrievable', isRetrievableStudio('storyboard'), true);
check('creator is NOT retrievable', isRetrievableStudio('creator'), false);
check('photoshoot is NOT retrievable', isRetrievableStudio('photoshoot'), false);
check('edit is NOT retrievable', isRetrievableStudio('edit'), false);
check('voiceover is NOT retrievable', isRetrievableStudio('voiceover'), false);
check('an unknown studio is NOT retrievable', isRetrievableStudio('nope'), false);
check('the set has exactly four members', RETRIEVABLE_STUDIOS.length, 4);

// ---- The stripper, stated on the value. ----
{
  const out = stripInlineImages({
    posts: [{ caption: 'مرحبا', imageUrl: 'data:image/png;base64,AAAA' }],
  }) as { posts: { caption: string; imageUrl: string | null }[] };
  check('an inline image becomes null', out.posts[0].imageUrl, null);
  check('the caption survives', out.posts[0].caption, 'مرحبا');
}
{
  const url = 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/generated/a.png';
  const out = stripInlineImages({ posts: [{ imageUrl: url }] }) as { posts: { imageUrl: string }[] };
  check('an https image survives', out.posts[0].imageUrl, url);
}
{
  // The key name must be irrelevant — a future studio may call it something else.
  const out = stripInlineImages({
    thumb: 'data:image/jpeg;base64,BBBB',
    nested: { deep: ['data:image/png;base64,CC'] },
  }) as { thumb: string | null; nested: { deep: (string | null)[] } };
  check('a differently-named inline image is stripped', out.thumb, null);
  check('an inline image nested in an array is stripped', out.nested.deep[0], null);
}
{
  check('null survives', stripInlineImages(null), null);
  check('a number survives', stripInlineImages(42), 42);
  check('a boolean survives', stripInlineImages(true), true);
}

// ---- The second, independent ceiling. ----
check('the byte ceiling is 256 kB', MAX_RETRIEVABLE_OUTPUT_BYTES, 256 * 1024);
{
  // A stripped campaign of nine posts must sit far under the ceiling.
  const posts = Array.from({ length: 9 }, () => ({
    scenario: 'x'.repeat(400),
    caption: 'ن'.repeat(400),
    tov: 'y'.repeat(120),
    schedule: 'z'.repeat(80),
    hashtags: '#a '.repeat(30),
    imageUrl: `data:image/png;base64,${'A'.repeat(50_000)}`,
  }));
  const stripped = JSON.stringify(stripInlineImages({ posts }));
  checks++;
  if (Buffer.byteLength(stripped, 'utf8') >= MAX_RETRIEVABLE_OUTPUT_BYTES) {
    failures++;
    console.log('FAIL  a stripped nine-post campaign must fit well under the ceiling');
  }
  // And the unstripped version must NOT — otherwise the guard proves nothing.
  checks++;
  if (Buffer.byteLength(JSON.stringify({ posts }), 'utf8') < MAX_RETRIEVABLE_OUTPUT_BYTES) {
    failures++;
    console.log('FAIL  the unstripped fixture must exceed the ceiling, or this test proves nothing');
  }
}

if (failures > 0) {
  console.log(`\n[retrievable-output] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[retrievable-output] ${checks} checks passed`);
