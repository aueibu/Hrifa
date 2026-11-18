import { canonicalPitchListKey, pitchIdentityKey, signedMod } from './tunings';
import type {
  FoldingMode,
  GamutPitch,
  IdentityMode,
  TraceConnectionMode,
  TraceRegisterMode,
  TrajectoryStep,
  TrajectoryVoiceTrace,
  TracedVoiceLine,
  TracedVoicePoint,
  TransformConfig,
  TransformResult,
} from './types';

export function createInitialTrajectory(
  seedPitches: readonly GamutPitch[],
  config: TransformConfig
): TrajectoryStep[] {
  return [
    {
      index: 0,
      pitches: [...seedPitches],
      canonicalKey: canonicalPitchListKey(seedPitches, config.identity, config.folding),
      operationLabel: 'Seed',
      formulaDisplay: 'S₀ (initial seed)',
      focusPitches: [],
      multiplierUsed: 1,
      fromStepResult: null,
    },
  ];
}

export function appendTrajectoryStep(
  trajectory: readonly TrajectoryStep[],
  result: TransformResult
): TrajectoryStep[] {
  const nextStep: TrajectoryStep = {
    index: trajectory.length,
    pitches: result.outputPitches,
    canonicalKey: result.canonicalKey,
    operationLabel: result.operationLabel,
    formulaDisplay: result.formulaDisplay,
    focusPitches: result.focusPitches,
    multiplierUsed: result.multiplierUsed,
    fromStepResult: result,
  };
  return [...trajectory, nextStep];
}

export function truncateTrajectoryAt(
  trajectory: readonly TrajectoryStep[],
  stepIndex: number
): TrajectoryStep[] {
  if (stepIndex < 0 || trajectory.length === 0) {
    return trajectory.slice(0, 1);
  }
  return trajectory.slice(0, stepIndex + 1);
}

function circularVoiceCost(
  prevPoint: TracedVoicePoint,
  target: GamutPitch,
  repeatCents: number,
  voiceIndex: number,
  targetIndex: number
): number {
  const dist = Math.abs(signedMod(target.foldedCents - prevPoint.cents, repeatCents));
  const samePitchClass =
    pitchIdentityKey(prevPoint.pitch, 'folded') === pitchIdentityKey(target, 'folded');
  // Small bonus ensures exact common tones always hold, and order tie-break prevents gratuitous crossings
  return dist - (samePitchClass ? 0.001 : 0) + Math.abs(voiceIndex - targetIndex) * 1e-6;
}

function matchSmoothest(
  prevPoints: readonly TracedVoicePoint[],
  targets: readonly GamutPitch[],
  repeatCents: number
): GamutPitch[] {
  const V = prevPoints.length;
  const M = targets.length;
  if (M === 0) {
    return prevPoints.map((p) => p.pitch);
  }
  if (M === 1) {
    return prevPoints.map(() => targets[0]);
  }

  // Exact minimum-cost bipartite matching for small chords (V <= 7, M <= 7)
  if (V === M && V <= 7) {
    const used = new Array<boolean>(M).fill(false);
    const current = new Array<number>(V).fill(0);
    let bestPerm = new Array<number>(V).fill(0);
    let bestCost = Infinity;

    const search = (vIdx: number, accCost: number) => {
      if (accCost >= bestCost) {
        return;
      }
      if (vIdx === V) {
        bestCost = accCost;
        bestPerm = current.slice();
        return;
      }
      for (let j = 0; j < M; j += 1) {
        if (!used[j]) {
          used[j] = true;
          current[vIdx] = j;
          search(
            vIdx + 1,
            accCost + circularVoiceCost(prevPoints[vIdx], targets[j], repeatCents, vIdx, j)
          );
          used[j] = false;
        }
      }
    };
    search(0, 0);
    return bestPerm.map((j) => targets[j]);
  }

  // General case (or cardinality change):
  // First pair unique targets to distinct voices greedily by lowest cost (common tones first)
  const pairs: { v: number; j: number; cost: number }[] = [];
  for (let v = 0; v < V; v += 1) {
    for (let j = 0; j < M; j += 1) {
      pairs.push({
        v,
        j,
        cost: circularVoiceCost(prevPoints[v], targets[j], repeatCents, v, j),
      });
    }
  }
  pairs.sort((a, b) => a.cost - b.cost);

  const assigned = new Array<GamutPitch | null>(V).fill(null);
  const usedTargets = new Set<number>();

  for (const pair of pairs) {
    if (assigned[pair.v] === null && !usedTargets.has(pair.j)) {
      assigned[pair.v] = targets[pair.j];
      usedTargets.add(pair.j);
    }
  }

  // Any remaining voices (when cardinality collapsed: M < V) converge onto their nearest target
  for (let v = 0; v < V; v += 1) {
    if (assigned[v] === null) {
      let bestTarget = targets[0];
      let bestCost = Infinity;
      for (let j = 0; j < M; j += 1) {
        const c = circularVoiceCost(prevPoints[v], targets[j], repeatCents, v, j);
        if (c < bestCost) {
          bestCost = c;
          bestTarget = targets[j];
        }
      }
      assigned[v] = bestTarget;
    }
  }

  return assigned.map((p, idx) => p ?? targets[idx % M]);
}

function matchTransformMap(
  prevPoints: readonly TracedVoicePoint[],
  step: TrajectoryStep,
  identity: IdentityMode,
  transformFolding: FoldingMode,
  repeatCents: number
): { pitch: GamutPitch; rawDeltaCents?: number }[] {
  const sr = step.fromStepResult;
  if (!sr || sr.steps.length === 0) {
    return prevPoints.map((p, i) => ({
      pitch: step.pitches[i] ?? step.pitches[0] ?? p.pitch,
    }));
  }

  if (identity === 'ordered-tuple' && sr.steps.length === prevPoints.length) {
    return sr.steps.map((s) => ({
      pitch: s.result,
      rawDeltaCents:
        transformFolding === 'unfolded'
          ? s.rawUnfolded.unfoldedCents - s.source.unfoldedCents
          : undefined,
    }));
  }

  return prevPoints.map((prevPt) => {
    const prevKey = pitchIdentityKey(prevPt.pitch, 'folded');
    let match = sr.steps.find((s) => pitchIdentityKey(s.source, 'folded') === prevKey);
    if (!match) {
      let bestDist = Infinity;
      for (const s of sr.steps) {
        const d = Math.abs(signedMod(s.source.foldedCents - prevPt.pitch.foldedCents, repeatCents));
        if (d < bestDist) {
          bestDist = d;
          match = s;
        }
      }
    }
    if (!match) {
      return { pitch: step.pitches[0] ?? prevPt.pitch };
    }
    return {
      pitch: match.result,
      rawDeltaCents:
        transformFolding === 'unfolded'
          ? match.rawUnfolded.unfoldedCents - match.source.unfoldedCents
          : undefined,
    };
  });
}

/**
 * Traces individual voices across a walked trajectory chain under the chosen
 * connection rule ('map' vs 'smoothest') and register rule ('accumulate' vs 'fold').
 */
export function traceTrajectoryVoices(
  trajectory: readonly TrajectoryStep[],
  repeatCents: number,
  connectionMode: TraceConnectionMode,
  registerMode: TraceRegisterMode,
  identity: IdentityMode = 'unordered-set',
  transformFolding: FoldingMode = 'folded'
): TrajectoryVoiceTrace {
  if (trajectory.length === 0 || trajectory[0].pitches.length === 0) {
    return {
      connectionMode,
      registerMode,
      voices: [],
      stepCents: [],
      minCents: 0,
      maxCents: repeatCents,
    };
  }

  const R = repeatCents > 0 ? repeatCents : 1200;
  const seedPitches = trajectory[0].pitches;
  const V = seedPitches.length;

  const focusKeysPerStep: Set<string>[] = trajectory.map((_, t) => {
    const next = trajectory[t + 1];
    const foci = next?.fromStepResult?.focusPitches ?? [];
    return new Set(foci.map((fp) => pitchIdentityKey(fp, 'folded')));
  });

  const voicePoints: TracedVoicePoint[][] = seedPitches.map((p) => {
    const initCents =
      registerMode === 'fold'
        ? p.foldedCents
        : transformFolding === 'unfolded'
          ? p.unfoldedCents
          : p.foldedCents;
    return [
      {
        stepIndex: 0,
        pitch: p,
        cents: initCents,
        isFocusForNext: focusKeysPerStep[0].has(pitchIdentityKey(p, 'folded')),
      },
    ];
  });

  for (let t = 1; t < trajectory.length; t += 1) {
    const step = trajectory[t];
    const prevPoints = voicePoints.map((pts) => pts[t - 1]);

    if (connectionMode === 'map') {
      const mapped = matchTransformMap(prevPoints, step, identity, transformFolding, R);
      for (let v = 0; v < V; v += 1) {
        const prevPt = prevPoints[v];
        const { pitch: targetPitch, rawDeltaCents } = mapped[v];
        let nextCents: number;
        if (registerMode === 'fold') {
          nextCents = targetPitch.foldedCents;
        } else if (rawDeltaCents !== undefined) {
          nextCents = prevPt.cents + rawDeltaCents;
        } else {
          nextCents = prevPt.cents + signedMod(targetPitch.foldedCents - prevPt.cents, R);
        }
        voicePoints[v].push({
          stepIndex: t,
          pitch: targetPitch,
          cents: nextCents,
          isFocusForNext: focusKeysPerStep[t].has(pitchIdentityKey(targetPitch, 'folded')),
        });
      }
    } else {
      const matched = matchSmoothest(prevPoints, step.pitches, R);
      for (let v = 0; v < V; v += 1) {
        const prevPt = prevPoints[v];
        const targetPitch = matched[v];
        const nextCents =
          registerMode === 'fold'
            ? targetPitch.foldedCents
            : prevPt.cents + signedMod(targetPitch.foldedCents - prevPt.cents, R);
        voicePoints[v].push({
          stepIndex: t,
          pitch: targetPitch,
          cents: nextCents,
          isFocusForNext: focusKeysPerStep[t].has(pitchIdentityKey(targetPitch, 'folded')),
        });
      }
    }
  }

  const voices: TracedVoiceLine[] = voicePoints.map((points, voiceId) => ({
    voiceId,
    points,
  }));

  const stepCents: number[][] = trajectory.map((_, t) => {
    const raw = voices.map((v) => v.points[t].cents).sort((a, b) => a - b);
    const deduped: number[] = [];
    for (const c of raw) {
      if (deduped.length === 0 || Math.abs(c - deduped[deduped.length - 1]) > 0.05) {
        deduped.push(c);
      }
    }
    return deduped;
  });

  let minCents = 0;
  let maxCents = R;
  for (const v of voices) {
    for (const pt of v.points) {
      if (pt.cents < minCents) {
        minCents = pt.cents;
      }
      if (pt.cents > maxCents) {
        maxCents = pt.cents;
      }
    }
  }

  return {
    connectionMode,
    registerMode,
    voices,
    stepCents,
    minCents,
    maxCents,
  };
}
