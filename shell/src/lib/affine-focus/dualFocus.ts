import { isBijectiveMultiplier } from './transform';
import { canonicalPitchListKey, mod, pitchIdentityKey } from './tunings';
import type {
  ClosureGraph,
  DualFocusConstraint,
  DualFocusMapEntry,
  GamutPitch,
  TransformConfig,
} from './types';

function computeCycles(N: number, mapFn: (x: number) => number): number[][] {
  const visited = new Set<number>();
  const cycles: number[][] = [];
  for (let start = 0; start < N; start += 1) {
    if (visited.has(start)) {
      continue;
    }
    const cycle: number[] = [];
    let cur = start;
    const localSeen = new Set<number>();
    while (!localSeen.has(cur)) {
      localSeen.add(cur);
      cycle.push(cur);
      cur = mapFn(cur);
    }
    if (cur === start) {
      for (const x of cycle) {
        visited.add(x);
      }
      cycles.push(cycle);
    }
  }
  return cycles;
}

export function searchDualFocusMaps(
  focusAIndex: number,
  focusBIndex: number,
  seedPitches: readonly GamutPitch[],
  config: TransformConfig,
  closureGraph: ClosureGraph | null = null,
  bijectiveOnly = false
): DualFocusMapEntry[] {
  const { gamut, dualConstraint } = config;
  const N = gamut.pitches.length;
  const fA = mod(focusAIndex, N);
  const fB = mod(focusBIndex, N);

  const closureKeys = new Set<string>(closureGraph ? closureGraph.nodes.map((n) => n.id) : []);
  const results: DualFocusMapEntry[] = [];

  for (let a = 0; a < N; a += 1) {
    const bijective = isBijectiveMultiplier(a, N);
    if (bijectiveOnly && !bijective) {
      continue;
    }
    for (let b = 0; b < N; b += 1) {
      const imgA = mod(a * fA + b, N);
      const imgB = mod(a * fB + b, N);

      const fixesBoth = imgA === fA && imgB === fB;
      const swapsPair = imgA === fB && imgB === fA;

      let matches = false;
      if (dualConstraint === 'fix-both') {
        matches = fixesBoth;
      } else if (dualConstraint === 'swap') {
        matches = swapsPair;
      } else {
        matches = fixesBoth || swapsPair;
      }

      if (!matches) {
        continue;
      }

      const mapFn = (x: number) => mod(a * x + b, N);
      const mapping = Array.from({ length: N }, (_, i) => ({
        input: i,
        output: mapFn(i),
      }));
      const fixedPoints = mapping.filter((m) => m.input === m.output).map((m) => m.input);
      const cycles = bijective ? computeCycles(N, mapFn) : [];

      const rawMapped = seedPitches.map((p) => {
        const idx = p.index >= 0 ? p.index : 0;
        return gamut.pitches[mapFn(idx)];
      });

      let transformedSeed = rawMapped;
      if (config.identity === 'unordered-set') {
        const sorted = [...rawMapped].sort((x, y) => x.foldedCents - y.foldedCents);
        const seen = new Set<string>();
        transformedSeed = [];
        for (const p of sorted) {
          const k = pitchIdentityKey(p, 'folded');
          if (!seen.has(k)) {
            seen.add(k);
            transformedSeed.push(p);
          }
        }
      }

      const key = canonicalPitchListKey(transformedSeed, config.identity, 'folded');
      const formula = `g(x) = ${a}x + ${b} (mod ${N})`;

      results.push({
        id: `a${a}_b${b}`,
        a,
        b,
        formula,
        isBijective: bijective,
        focusA: fA,
        focusB: fB,
        imageA: imgA,
        imageB: imgB,
        constraintMatched: swapsPair && !fixesBoth ? 'swap' : ('fix-both' as DualFocusConstraint),
        fixedPoints,
        cycles,
        mapping,
        transformedSeed,
        inClosure: closureKeys.has(key),
      });
    }
  }

  return results;
}
