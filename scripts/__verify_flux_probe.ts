import { fluxSize, FLUX_ASPECT_RATIOS } from '../lib/ai/replicate';
import { PLATFORM_FRAMING, PLATFORM_IDS } from '../lib/ai/prompts/platform-framing';

for (const id of PLATFORM_IDS) {
  const r = PLATFORM_FRAMING[id].aspectRatio;
  const a = JSON.stringify(fluxSize('1080p', r));
  const b = JSON.stringify(fluxSize('2K', r));
  const c = JSON.stringify(fluxSize('4K', r));
  console.log(`${id.padEnd(10)} ratio=${r.padEnd(5)} 1080p=${a} 2K=${b} 4K=${c} identical=${a===b && b===c}`);
}
console.log('--- edit ratios ---');
for (const r of ['1:1','2:3']) {
  console.log(r, JSON.stringify(fluxSize('4K', r)));
}
console.log('--- custom branch, a ratio NOT in the enum ---');
for (const r of ['21:9','7:5','1:2']) {
  console.log(r, '1080p', JSON.stringify(fluxSize('1080p', r)), '4K', JSON.stringify(fluxSize('4K', r)));
}
console.log('--- undefined ---');
console.log(JSON.stringify(fluxSize('4K', undefined)));
console.log('ENUM', FLUX_ASPECT_RATIOS.join(','));
