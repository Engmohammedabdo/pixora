import { PLATFORM_FRAMING, PLATFORM_IDS } from '../lib/ai/prompts/platform-framing';
import { FLUX_ASPECT_RATIOS, fluxSize } from '../lib/ai/replicate';

let custom = 0, enumPath = 0;
for (const id of PLATFORM_IDS) {
  const r = PLATFORM_FRAMING[id].aspectRatio;
  const out = fluxSize('2K', r);
  if (out.aspect_ratio === 'custom') custom++; else enumPath++;
  console.log(`platform ${id} ratio=${r} -> ${JSON.stringify(out)}`);
}
console.log(`PLATFORM LOOP: custom=${custom} enum=${enumPath}`);

for (const res of ['1080p','2K','4K']) {
  console.log(`4K-loop ${res} 4:5 -> ${JSON.stringify(fluxSize(res,'4:5'))}`);
}
for (const junk of ['', 'wide', '16-9', '0:0', '1:', ':1', '-1:2']) {
  console.log(`junk ${JSON.stringify(junk)} -> ${JSON.stringify(fluxSize('2K', junk))}`);
}
console.log('enum:', FLUX_ASPECT_RATIOS.join(','));
