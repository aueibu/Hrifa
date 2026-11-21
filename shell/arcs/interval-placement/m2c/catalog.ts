// M2c thin slice: the original "even spacing" catalog (the old `uniform` engine, unchanged) for the human to browse and
// hear, over a range of spans, scored with the new models. Not the library change; that follows the human's look.
// Run from shell/: npx esbuild arcs/interval-placement/m2c/catalog.ts --bundle --platform=node --format=esm --outfile=/tmp/c.mjs && node /tmp/c.mjs > catalog.json
import { placeIntervals } from '../../../src/lib/interval-placement/index';
import { scoreVoicing, midiToHz } from '../../../src/lib/consonance/index';

const BASE_MIDI = 36; // C2
const SETS = [
  [11, 7, 16],
  [7, 5, 11],
];
const WIDTHS = Array.from({ length: 42 - 6 + 1 }, (_, i) => 6 + i); // 6..42 steps

const out: unknown[] = [];
for (const set of SETS) {
  for (const W of WIDTHS) {
    const res = placeIntervals({
      intervals: set.map((s) => ({ cents: s * 100 })),
      window: { bottomHz: midiToHz(BASE_MIDI), widthSteps: W },
      distribution: 'uniform',
      stepCents: 100,
    });
    for (const v of res.voicings) {
      const steps = v.cents.map((c) => Math.round(c / 100));
      const fits = steps[0] >= 0 && steps[steps.length - 1] <= W;
      const s = scoreVoicing({ refHz: v.refHz, cents: v.cents }, { decompose: false });
      out.push({
        set: set.join(' '),
        width: W,
        orders: v.perms.map((p) => p.perm.map((c) => Math.round(c / 100)).join(' ')),
        spans: v.perms[0].endpoints.map(([lo, hi]) => ({ low: Math.round(lo / 100), size: Math.round((hi - lo) / 100) })),
        midi: steps.map((x) => x + BASE_MIDI),
        sharedMidi: v.collisions.map((c) => Math.round(c.cents / 100) + BASE_MIDI),
        fits,
        rough: s.interference.hutchinsonKnopoff.total,
        harmP: s.harmonicity.pitch.value,
        per: s.periodicity.value,
      });
    }
  }
}
console.log(JSON.stringify(out));
