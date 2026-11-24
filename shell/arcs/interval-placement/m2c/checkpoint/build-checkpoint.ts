// M2c human checkpoint: the catalog data for the listening page, built with the library (src/lib/interval-placement,
// buildCatalog with the default ranking), for the two sets the human named: 11 7 16 and 5 11 15, both spacing rules,
// every window width 6-48 from C2. One row per (set, rule, width, pitch set); the page merges a width range by pitch
// set and ranks it with rank.js, which this script checks against buildCatalog on every preset and the whole range.
// Run from shell/:
//   npx esbuild arcs/interval-placement/m2c/checkpoint/build-checkpoint.ts --bundle --platform=node --format=esm --outfile=<tmp>/cp.mjs
//   node <tmp>/cp.mjs <out.json>
import { writeFileSync } from 'node:fs';
import {
  buildCatalog,
  spacingCenters,
  spacingPreset,
  type CatalogEntry,
  type SpacingRule,
} from '../../../../src/lib/interval-placement/index';
import { midiToHz } from '../../../../src/lib/consonance/index';
// @ts-expect-error plain JS helper shared with the page
import { rankEntries, mergeRange } from './rank.js';

const BASE = 36; // C2
const SETS = [
  [11, 7, 16],
  [5, 11, 15],
];
const RULES: SpacingRule[] = ['equal', 'shared'];
const WMIN = 6;
const WMAX = 48;
const WEIGHTS = { rough: -1, harmP: 1 }; // = DEFAULT_CATALOG_WEIGHTS (interference -1, periodicity 0, harmonicityPitch +1)
const steps = (c: number) => Math.round(c / 100);

const catalog = (set: number[], rule: SpacingRule, from: number, to: number) =>
  buildCatalog({
    intervals: set.map((d) => ({ cents: d * 100 })),
    bottomHz: midiToHz(BASE),
    spacing: { fromSteps: from, toSteps: to },
    rule,
    stepCents: 100,
  });

function row(set: number[], rule: SpacingRule, W: number, e: CatalogEntry) {
  const first = e.occurrences[0];
  const sizes = first.perm.map(steps);
  const centers = spacingCenters(rule, sizes, W);
  return {
    set: set.join(' '),
    rule,
    width: W,
    id: e.cents.map(steps).join(','),
    midi: e.cents.map((c) => steps(c) + BASE),
    sharedMidi: e.collisions.map((c) => steps(c.cents) + BASE),
    spans: first.endpoints.map(([lo], i) => ({ low: steps(lo), size: sizes[i], center: centers[i] })),
    occ: e.occurrences.map((o) => ({ w: o.widthSteps, order: o.perm.map(steps).join(' '), ties: o.ties })),
    rough: e.flat.interference,
    harmP: e.flat.harmonicityPitch,
    harmPc: e.flat.harmonicityPc,
    per: e.flat.periodicity,
  };
}

const rows: ReturnType<typeof row>[] = [];
const summaries: unknown[] = [];
for (const set of SETS) {
  for (const rule of RULES) {
    for (let W = WMIN; W <= WMAX; W++) {
      const r = catalog(set, rule, W, W);
      summaries.push({
        summary: true,
        set: set.join(' '),
        rule,
        width: W,
        orderings: r.orderings.total,
        cannotFit: r.cannotFit.reduce((s, c) => s + c.orderings, 0),
      });
      for (const e of r.entries) rows.push(row(set, rule, W, e));
    }
  }
}

// Check: the page's merge + rank equals the library's buildCatalog ranking on each preset and on the whole range.
let checks = 0;
for (const set of SETS) {
  for (const rule of RULES) {
    const ranges = [...(['close', 'open', 'wide', 'vast'] as const).map((p) => spacingPreset(p)), { fromSteps: WMIN, toSteps: WMAX }];
    for (const { fromSteps: a, toSteps: b } of ranges) {
      const lib = catalog(set, rule, a, b).entries;
      const mine = rankEntries(
        mergeRange(
          rows.filter((x) => x.set === set.join(' ') && x.rule === rule),
          a,
          b
        ),
        WEIGHTS
      );
      if (lib.length !== mine.length) throw new Error(`count ${set} ${rule} ${a}-${b}: lib ${lib.length} page ${mine.length}`);
      lib.forEach((e, i) => {
        const id = e.cents.map(steps).join(',');
        if (Math.abs(e.mix - mine[i].mix) > 1e-9) throw new Error(`mix ${set} ${rule} ${a}-${b} #${i}: ${e.mix} vs ${mine[i].mix}`);
        // a different id at the same rank is only allowed for an exact tie in the mix
        if (id !== mine[i].id && Math.abs(lib[i].mix - (lib[i + 1]?.mix ?? Infinity)) > 1e-12 && Math.abs(lib[i].mix - (lib[i - 1]?.mix ?? Infinity)) > 1e-12)
          throw new Error(`order ${set} ${rule} ${a}-${b} #${i}: ${id} vs ${mine[i].id}`);
      });
      checks++;
    }
  }
}
const out = process.argv[2];
writeFileSync(out, JSON.stringify([...summaries, ...rows]));
console.log(`rows ${rows.length}, summaries ${summaries.length}, ranking checks ${checks} passed -> ${out}`);
