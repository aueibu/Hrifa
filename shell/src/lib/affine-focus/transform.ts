import {
  addFrac,
  canonicalPitchListKey,
  divFrac,
  formatCents,
  formatFraction,
  fractionToCents,
  fractionValue,
  gcd,
  invFrac,
  makeCentsPitch,
  makeRatioPitch,
  mod,
  mulFrac,
  numberToFraction,
  pitchIdentityKey,
  powFrac,
  sameFraction,
  signedMod,
  snapPitchToGamut,
  subFrac,
} from './tunings';
import type {
  Fraction,
  GamutPitch,
  TransformConfig,
  TransformResult,
  TuningGamut,
  VoiceTransformStep,
} from './types';

export function isBijectiveMultiplier(multiplier: number, modulus: number): boolean {
  if (!Number.isInteger(multiplier) || modulus < 2) {
    return false;
  }
  const norm = mod(multiplier, modulus);
  if (norm === 0) {
    return false;
  }
  return gcd(norm, modulus) === 1;
}

function nearestGamutPitch(p: GamutPitch, gamut: TuningGamut): GamutPitch {
  if (p.index >= 0 && p.index < gamut.pitches.length) {
    return gamut.pitches[p.index];
  }
  return snapPitchToGamut(p.foldedCents, gamut, 'folded');
}

function attachGamutIndexIfExact(p: GamutPitch, gamut: TuningGamut): GamutPitch {
  for (const gp of gamut.pitches) {
    if (p.ratio && gp.ratio && sameFraction(p.ratio, gp.ratio)) {
      return { ...p, index: gp.index };
    }
    if (!p.ratio && Math.abs(gp.foldedCents - p.foldedCents) < 0.01) {
      return { ...p, index: gp.index };
    }
  }
  return p;
}

function buildStepPitchFromGamut(
  rawStep: number,
  gamut: TuningGamut,
  folding: 'folded' | 'unfolded'
): { unfolded: GamutPitch; folded: GamutPitch } {
  const N = gamut.pitches.length;
  const R = gamut.repeatCents;
  const intStep = Math.round(rawStep);
  const foldedIdx = mod(intStep, N);
  const wraps = Math.floor(intStep / N);
  const basePitch = gamut.pitches[foldedIdx];

  const unfoldedCents = basePitch.foldedCents + wraps * R;
  let unfoldedRatio: Fraction | null = null;
  if (basePitch.ratio && gamut.repeatRatio) {
    const repPow = powFrac(gamut.repeatRatio, wraps);
    if (repPow) {
      unfoldedRatio = mulFrac(basePitch.ratio, repPow);
    }
  }

  const unfoldedLabel = unfoldedRatio
    ? formatFraction(unfoldedRatio)
    : wraps === 0
      ? basePitch.label
      : `${intStep} (${basePitch.label}${wraps > 0 ? `+${wraps}R` : `${wraps}R`})`;

  const folded: GamutPitch = {
    ...basePitch,
    unfoldedCents,
    unfoldedRatio,
    unfoldedLabel,
  };

  const unfolded: GamutPitch = {
    index: foldedIdx,
    cents: unfoldedCents,
    foldedCents: basePitch.foldedCents,
    unfoldedCents,
    ratio: unfoldedRatio,
    unfoldedRatio,
    label: unfoldedLabel,
    unfoldedLabel,
    snapErrorCents: 0,
    idealLabel: unfoldedLabel,
  };

  return {
    unfolded,
    folded: folding === 'folded' ? folded : unfolded,
  };
}

function realizeContinuousPitch(
  unfoldedCents: number,
  unfoldedRatio: Fraction | null,
  config: TransformConfig,
  singular = false
): { unfolded: GamutPitch; folded: GamutPitch } {
  const { gamut, folding, quantize } = config;
  const R = gamut.repeatCents;

  if (singular) {
    const unison = gamut.pitches[0];
    const sPitch: GamutPitch = {
      ...unison,
      label: `≤0 (${unison.label})`,
      unfoldedLabel: `≤0 (${unison.label})`,
      singular: true,
    };
    return { unfolded: sPitch, folded: sPitch };
  }

  let exactUnfolded: GamutPitch;
  let exactFolded: GamutPitch;

  if (unfoldedRatio && unfoldedRatio.num > 0 && unfoldedRatio.den > 0) {
    exactUnfolded = attachGamutIndexIfExact(
      makeRatioPitch(unfoldedRatio, R, gamut.repeatRatio, -1, false),
      gamut
    );
    exactFolded = attachGamutIndexIfExact(
      makeRatioPitch(unfoldedRatio, R, gamut.repeatRatio, -1, true),
      gamut
    );
  } else {
    exactUnfolded = attachGamutIndexIfExact(makeCentsPitch(unfoldedCents, R, -1, false), gamut);
    exactFolded = attachGamutIndexIfExact(makeCentsPitch(unfoldedCents, R, -1, true), gamut);
  }

  if (quantize === 'snap-to-gamut') {
    const snappedFolded = snapPitchToGamut(unfoldedCents, gamut, 'folded', exactFolded.label);
    const snappedUnfolded = snapPitchToGamut(unfoldedCents, gamut, 'unfolded', exactUnfolded.label);
    return {
      unfolded: snappedUnfolded,
      folded: folding === 'folded' ? snappedFolded : snappedUnfolded,
    };
  }

  return {
    unfolded: exactUnfolded,
    folded: folding === 'folded' ? exactFolded : exactUnfolded,
  };
}

function deduplicateAndSort(
  pitches: readonly GamutPitch[],
  folding: 'folded' | 'unfolded'
): GamutPitch[] {
  const sorted = [...pitches].sort((a, b) =>
    folding === 'folded' ? a.foldedCents - b.foldedCents : a.unfoldedCents - b.unfoldedCents
  );
  const seen = new Set<string>();
  const out: GamutPitch[] = [];
  for (const p of sorted) {
    const k = pitchIdentityKey(p, folding);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

function transformSingleVoice(
  x: GamutPitch,
  voiceIndex: number,
  focusPitches: readonly GamutPitch[],
  config: TransformConfig,
  a: number
): {
  step: VoiceTransformStep;
  unfolded: GamutPitch;
  folded: GamutPitch;
} {
  const { gamut, domain, rule, offsetMode, folding, multiplierPlus, multiplierMinus } = config;
  const N = gamut.pitches.length;
  const R = gamut.repeatCents;
  const f1 = focusPitches[0] ?? gamut.pitches[0];
  const f2 = focusPitches[1] ?? f1;
  const isDual = rule === 'dual-focus' && focusPitches.length >= 2;
  const isPerspective = rule === 'perspective';
  const isBilateral = rule === 'bilateral';
  const focusLabel = isDual ? `{${f1.label}, ${f2.label}}` : f1.label;

  // 1. GAMUT-STEPS DOMAIN
  if (domain === 'gamut-steps') {
    const xGp = nearestGamutPitch(x, gamut);
    const f1Gp = nearestGamutPitch(f1, gamut);
    const f2Gp = nearestGamutPitch(f2, gamut);
    const i = xGp.index;
    const k1 = f1Gp.index;
    const k2 = f2Gp.index;

    let offsetVal: number;
    let mult = a;
    let rawStep: number;

    if (isDual) {
      // Edge reflection / dual-focus rule in Z_N: (k1 + k2) - i
      offsetVal = i - k1;
      mult = -1;
      rawStep = k1 + k2 - i;
    } else if (isBilateral) {
      offsetVal = offsetMode === 'unwrapped' ? i - k1 : signedMod(i - k1, N);
      mult = offsetVal >= 0 ? multiplierPlus : multiplierMinus;
      rawStep = k1 + mult * offsetVal;
    } else {
      if (offsetMode === 'signed') {
        offsetVal = signedMod(i - k1, N);
      } else if (offsetMode === 'positive' && folding === 'folded') {
        offsetVal = mod(i - k1, N);
      } else {
        offsetVal = i - k1;
      }
      const scaled = mult * offsetVal;
      rawStep = isPerspective ? scaled : k1 + scaled;
    }

    const scaledVal = isDual ? k2 - i : mult * offsetVal;
    const { unfolded, folded } = buildStepPitchFromGamut(rawStep, gamut, folding);
    const result = folding === 'folded' ? folded : unfolded;
    const disp =
      folding === 'folded'
        ? signedMod(result.foldedCents - x.foldedCents, R)
        : result.unfoldedCents - x.unfoldedCents;
    const isFixed = pitchIdentityKey(result, folding) === pitchIdentityKey(x, folding);

    return {
      unfolded,
      folded,
      step: {
        voiceIndex,
        source: x,
        focusLabel,
        offsetDisplay: `${offsetVal} st`,
        offsetValue: offsetVal,
        scaledDisplay: `${scaledVal} st`,
        scaledValue: scaledVal,
        rawUnfolded: unfolded,
        result,
        displacementCents: disp,
        isFixed,
      },
    };
  }

  // 2. LOG-PITCH DOMAIN (Perceptual Cents / Ratio^a)
  if (domain === 'log-pitch') {
    const cx = offsetMode === 'unwrapped' ? x.unfoldedCents : x.foldedCents;
    const cf1 = offsetMode === 'unwrapped' ? f1.unfoldedCents : f1.foldedCents;
    const cf2 = offsetMode === 'unwrapped' ? f2.unfoldedCents : f2.foldedCents;

    let offsetCents: number;
    let mult = a;
    let rawCents: number;
    let exactUnfoldedRatio: Fraction | null = null;

    if (isDual) {
      offsetCents = cx - cf1;
      mult = -1;
      rawCents = cf1 + cf2 - cx;
      if (x.ratio && f1.ratio && f2.ratio) {
        const prod = mulFrac(f1.ratio, f2.ratio);
        if (prod) {
          exactUnfoldedRatio = divFrac(prod, x.ratio);
        }
      }
    } else if (isBilateral) {
      offsetCents = offsetMode === 'unwrapped' ? cx - cf1 : signedMod(cx - cf1, R);
      mult = offsetCents >= -1e-9 ? multiplierPlus : multiplierMinus;
      rawCents = cf1 + mult * offsetCents;
      if (x.ratio && f1.ratio && Number.isInteger(mult)) {
        const rel = divFrac(x.ratio, f1.ratio);
        if (rel) {
          const powered = powFrac(rel, mult);
          if (powered) {
            exactUnfoldedRatio = mulFrac(f1.ratio, powered);
          }
        }
      }
    } else {
      if (offsetMode === 'signed') {
        offsetCents = signedMod(cx - cf1, R);
      } else if (offsetMode === 'positive') {
        offsetCents = cx - cf1;
      } else {
        offsetCents = cx - cf1;
      }
      const scaledCents = mult * offsetCents;
      rawCents = isPerspective ? scaledCents : cf1 + scaledCents;

      const rx = offsetMode === 'unwrapped' ? (x.unfoldedRatio ?? x.ratio) : x.ratio;
      const rf = offsetMode === 'unwrapped' ? (f1.unfoldedRatio ?? f1.ratio) : f1.ratio;
      if (rx && rf && Number.isInteger(mult)) {
        const rel = divFrac(rx, rf);
        if (rel) {
          const powered = powFrac(rel, mult);
          if (powered) {
            exactUnfoldedRatio = isPerspective ? powered : mulFrac(rf, powered);
          }
        }
      }
    }

    const scaledCents = isDual ? cf2 - cx : mult * offsetCents;
    const { unfolded, folded } = realizeContinuousPitch(rawCents, exactUnfoldedRatio, config);
    const result = folding === 'folded' ? folded : unfolded;
    const disp =
      folding === 'folded'
        ? signedMod(result.foldedCents - x.foldedCents, R)
        : result.unfoldedCents - x.unfoldedCents;
    const isFixed = pitchIdentityKey(result, folding) === pitchIdentityKey(x, folding);

    return {
      unfolded,
      folded,
      step: {
        voiceIndex,
        source: x,
        focusLabel,
        offsetDisplay: formatCents(offsetCents),
        offsetValue: offsetCents,
        scaledDisplay: formatCents(scaledCents),
        scaledValue: scaledCents,
        rawUnfolded: unfolded,
        result,
        displacementCents: disp,
        isFixed,
      },
    };
  }

  // 3. LINEAR-FREQ DOMAIN (Hz / Otonal Ratio Difference: r' = r_f + a(r_x - r_f))
  if (domain === 'linear-freq') {
    const rxFrac = offsetMode === 'unwrapped' ? (x.unfoldedRatio ?? x.ratio) : x.ratio;
    const rf1Frac = offsetMode === 'unwrapped' ? (f1.unfoldedRatio ?? f1.ratio) : f1.ratio;
    const rf2Frac = offsetMode === 'unwrapped' ? (f2.unfoldedRatio ?? f2.ratio) : f2.ratio;

    const rxVal = rxFrac ? fractionValue(rxFrac) : 2 ** (x.foldedCents / 1200);
    const rf1Val = rf1Frac ? fractionValue(rf1Frac) : 2 ** (f1.foldedCents / 1200);
    const rf2Val = rf2Frac ? fractionValue(rf2Frac) : 2 ** (f2.foldedCents / 1200);

    const diffVal = rxVal - rf1Val;
    const mult = isDual
      ? -1
      : isBilateral
        ? diffVal >= -1e-9
          ? multiplierPlus
          : multiplierMinus
        : a;
    const aFrac = numberToFraction(mult);

    let rawRatioVal: number;
    let exactRatio: Fraction | null = null;
    let offsetDisp = diffVal.toFixed(3);
    let scaledDisp = (mult * diffVal).toFixed(3);

    if (isDual) {
      rawRatioVal = rf1Val + rf2Val - rxVal;
      if (rxFrac && rf1Frac && rf2Frac) {
        const sumF = addFrac(rf1Frac, rf2Frac);
        const diff = subFrac(rxFrac, rf1Frac);
        if (diff) {
          offsetDisp = formatFraction(diff);
        }
        if (sumF) {
          exactRatio = subFrac(sumF, rxFrac);
        }
      }
    } else {
      const baseVal = isPerspective ? 1 : rf1Val;
      const baseFrac: Fraction | null = isPerspective ? { num: 1, den: 1 } : rf1Frac;
      rawRatioVal = baseVal + mult * diffVal;

      if (rxFrac && rf1Frac && aFrac && baseFrac) {
        const diffF = subFrac(rxFrac, rf1Frac);
        if (diffF) {
          offsetDisp = formatFraction(diffF);
          const scaledF = mulFrac(aFrac, diffF);
          if (scaledF) {
            scaledDisp = formatFraction(scaledF);
            exactRatio = addFrac(baseFrac, scaledF);
          }
        }
      }
    }

    const singular = rawRatioVal <= 1e-9 || (exactRatio !== null && exactRatio.num <= 0);
    const rawCents = singular ? 0 : 1200 * Math.log2(rawRatioVal);
    const { unfolded, folded } = realizeContinuousPitch(
      rawCents,
      singular ? null : exactRatio,
      config,
      singular
    );
    const result = folding === 'folded' ? folded : unfolded;
    const disp =
      folding === 'folded'
        ? signedMod(result.foldedCents - x.foldedCents, R)
        : result.unfoldedCents - x.unfoldedCents;
    const isFixed = pitchIdentityKey(result, folding) === pitchIdentityKey(x, folding);

    return {
      unfolded,
      folded,
      step: {
        voiceIndex,
        source: x,
        focusLabel,
        offsetDisplay: `${offsetDisp} Hz₀`,
        offsetValue: diffVal,
        scaledDisplay: `${scaledDisp} Hz₀`,
        scaledValue: mult * diffVal,
        rawUnfolded: unfolded,
        result,
        displacementCents: disp,
        isFixed,
      },
    };
  }

  // 4. SUBHARMONIC DOMAIN (1/Hz / Utonal Period Difference: 1/r' = 1/r_f + a(1/r_x - 1/r_f))
  const rxFrac = offsetMode === 'unwrapped' ? (x.unfoldedRatio ?? x.ratio) : x.ratio;
  const rf1Frac = offsetMode === 'unwrapped' ? (f1.unfoldedRatio ?? f1.ratio) : f1.ratio;
  const rf2Frac = offsetMode === 'unwrapped' ? (f2.unfoldedRatio ?? f2.ratio) : f2.ratio;

  const uxFrac = rxFrac ? invFrac(rxFrac) : null;
  const uf1Frac = rf1Frac ? invFrac(rf1Frac) : null;
  const uf2Frac = rf2Frac ? invFrac(rf2Frac) : null;

  const uxVal = uxFrac ? fractionValue(uxFrac) : 2 ** (-x.foldedCents / 1200);
  const uf1Val = uf1Frac ? fractionValue(uf1Frac) : 2 ** (-f1.foldedCents / 1200);
  const uf2Val = uf2Frac ? fractionValue(uf2Frac) : 2 ** (-f2.foldedCents / 1200);

  const diffU = uxVal - uf1Val;
  // Pitch above focus has smaller period (diffU <= 0)
  const mult = isDual ? -1 : isBilateral ? (diffU <= 1e-9 ? multiplierPlus : multiplierMinus) : a;
  const aFrac = numberToFraction(mult);

  let rawUVal: number;
  let exactRatio: Fraction | null = null;
  let offsetDisp = diffU.toFixed(3);
  let scaledDisp = (mult * diffU).toFixed(3);

  if (isDual) {
    rawUVal = uf1Val + uf2Val - uxVal;
    if (uxFrac && uf1Frac && uf2Frac) {
      const sumF = addFrac(uf1Frac, uf2Frac);
      const diffF = subFrac(uxFrac, uf1Frac);
      if (diffF) {
        offsetDisp = formatFraction(diffF);
      }
      if (sumF) {
        const resU = subFrac(sumF, uxFrac);
        if (resU && resU.num > 0) {
          exactRatio = invFrac(resU);
        }
      }
    }
  } else {
    const baseUVal = isPerspective ? 1 : uf1Val;
    const baseUFrac: Fraction | null = isPerspective ? { num: 1, den: 1 } : uf1Frac;
    rawUVal = baseUVal + mult * diffU;

    if (uxFrac && uf1Frac && aFrac && baseUFrac) {
      const diffF = subFrac(uxFrac, uf1Frac);
      if (diffF) {
        offsetDisp = formatFraction(diffF);
        const scaledF = mulFrac(aFrac, diffF);
        if (scaledF) {
          scaledDisp = formatFraction(scaledF);
          const resU = addFrac(baseUFrac, scaledF);
          if (resU && resU.num > 0) {
            exactRatio = invFrac(resU);
          }
        }
      }
    }
  }

  const singular = rawUVal <= 1e-9;
  const rawCents = singular ? 0 : 1200 * Math.log2(1 / rawUVal);
  if (exactRatio && !singular) {
    // Recompute exact cents from exactRatio
  }
  const { unfolded, folded } = realizeContinuousPitch(
    exactRatio ? fractionToCents(exactRatio) : rawCents,
    singular ? null : exactRatio,
    config,
    singular
  );
  const result = folding === 'folded' ? folded : unfolded;
  const disp =
    folding === 'folded'
      ? signedMod(result.foldedCents - x.foldedCents, R)
      : result.unfoldedCents - x.unfoldedCents;
  const isFixed = pitchIdentityKey(result, folding) === pitchIdentityKey(x, folding);

  return {
    unfolded,
    folded,
    step: {
      voiceIndex,
      source: x,
      focusLabel,
      offsetDisplay: `${offsetDisp} T₀`,
      offsetValue: diffU,
      scaledDisplay: `${scaledDisp} T₀`,
      scaledValue: mult * diffU,
      rawUnfolded: unfolded,
      result,
      displacementCents: disp,
      isFixed,
    },
  };
}

export function formatRuleFormula(
  focusPitches: readonly GamutPitch[],
  config: TransformConfig,
  a: number
): string {
  const f1 = focusPitches[0]?.label ?? '0';
  const f2 = focusPitches[1]?.label ?? f1;
  const modPart =
    config.folding === 'folded'
      ? config.domain === 'gamut-steps'
        ? ` (mod ${config.gamut.pitches.length})`
        : ` (mod ${config.gamut.repeatRatio ? formatFraction(config.gamut.repeatRatio) : formatCents(config.gamut.repeatCents)})`
      : '';

  if (config.rule === 'dual-focus' && focusPitches.length >= 2) {
    return `T_{${f1},${f2}}(x) = (${f1} + ${f2}) − x${modPart}`;
  }
  if (config.rule === 'perspective') {
    return `P_{${f1},${a}}(x) = ${a}·(x − ${f1})${modPart}`;
  }
  if (config.rule === 'bilateral') {
    return `B_{${f1},(${config.multiplierPlus},${config.multiplierMinus})}(x) = ${f1} + a±·(x − ${f1})${modPart}`;
  }
  if (config.domain === 'log-pitch' && focusPitches[0]?.ratio) {
    return `T_{${f1},${a}}(r) = ${f1} · (r / ${f1})^${a}${modPart}`;
  }
  if (config.domain === 'linear-freq') {
    return `T_{${f1},${a}}(ν) = ${f1} + ${a}·(ν − ${f1})${modPart}`;
  }
  if (config.domain === 'subharmonic') {
    return `T_{${f1},${a}}(1/ν) = [1/${f1} + ${a}·(1/ν − 1/${f1})]⁻¹${modPart}`;
  }
  return `T_{${f1},${a}}(x) = ${f1} + ${a}·(x − ${f1})${modPart}`;
}

export function applyFocusTransform(
  sourcePitches: readonly GamutPitch[],
  focusPitches: readonly GamutPitch[],
  config: TransformConfig,
  multiplierOverride?: number
): TransformResult {
  const a = multiplierOverride ?? config.multiplier;
  const voiceResults = sourcePitches.map((x, idx) =>
    transformSingleVoice(x, idx, focusPitches, config, a)
  );

  const unfoldedPitches = voiceResults.map((v) => v.unfolded);
  const foldedPitches = voiceResults.map((v) => v.folded);
  const steps = voiceResults.map((v) => v.step);

  const activeVoicePitches = config.folding === 'folded' ? foldedPitches : unfoldedPitches;
  const outputPitches =
    config.identity === 'ordered-tuple'
      ? activeVoicePitches
      : deduplicateAndSort(activeVoicePitches, config.folding);

  const sourceKey = canonicalPitchListKey(sourcePitches, config.identity, config.folding);
  const canonicalKey = canonicalPitchListKey(outputPitches, config.identity, config.folding);

  const invariantCount = steps.filter((s) => s.isFixed).length;
  const totalVoiceLeadingCents = steps.reduce((sum, s) => sum + Math.abs(s.displacementCents), 0);

  const snapErrors = activeVoicePitches.map((p) => p.snapErrorCents);
  const maxSnapErrorCents = snapErrors.reduce(
    (worst, err) => (Math.abs(err) > Math.abs(worst) ? err : worst),
    0
  );
  const signedAvgSnapErrorCents =
    snapErrors.length > 0 ? snapErrors.reduce((s, e) => s + e, 0) / snapErrors.length : 0;

  const focusIndices = focusPitches.map((fp) => fp.index);
  const fLabel =
    config.rule === 'dual-focus' && focusPitches.length >= 2
      ? `f={${focusPitches[0].label}, ${focusPitches[1].label}}`
      : `f=${focusPitches[0]?.label ?? '0'}`;
  const mLabel =
    config.rule === 'bilateral'
      ? `a=(${config.multiplierPlus},${config.multiplierMinus})`
      : config.rule === 'dual-focus'
        ? 'swap'
        : `a=${a}`;

  const operationId = `${focusPitches.map((fp) => fp.label).join('+')}|${mLabel}`;
  const operationLabel = `${fLabel} · ${mLabel}`;

  const uniqueOutputCount = deduplicateAndSort(activeVoicePitches, config.folding).length;
  const uniqueSourceCount = deduplicateAndSort(sourcePitches, config.folding).length;

  return {
    operationId,
    operationLabel,
    formulaDisplay: formatRuleFormula(focusPitches, config, a),
    focusIndices,
    focusPitches: [...focusPitches],
    multiplierUsed: a,
    sourcePitches: [...sourcePitches],
    unfoldedPitches,
    foldedPitches,
    outputPitches,
    canonicalKey,
    steps,
    invariantCount,
    totalVoiceLeadingCents,
    maxSnapErrorCents,
    signedAvgSnapErrorCents,
    isSelfLoop: canonicalKey === sourceKey,
    collapsedCardinality: uniqueOutputCount < uniqueSourceCount,
  };
}

export function resolveFocusCandidates(
  sourcePitches: readonly GamutPitch[],
  seedPitches: readonly GamutPitch[],
  config: TransformConfig
): GamutPitch[][] {
  const { gamut, rule, focusPolicy, customFoci } = config;
  let baseFoci: GamutPitch[];

  if (focusPolicy === 'current-members') {
    baseFoci = deduplicateAndSort(sourcePitches, 'folded');
  } else if (focusPolicy === 'seed-members') {
    baseFoci = deduplicateAndSort(seedPitches, 'folded');
  } else if (focusPolicy === 'custom') {
    const validIndices = [...new Set(customFoci.map((i) => mod(i, gamut.pitches.length)))];
    baseFoci =
      validIndices.length > 0
        ? validIndices.map((i) => gamut.pitches[i])
        : deduplicateAndSort(sourcePitches, 'folded');
  } else {
    baseFoci = gamut.pitches;
  }

  if (baseFoci.length === 0) {
    baseFoci = [gamut.pitches[0]];
  }

  if (rule === 'dual-focus') {
    const pairs: GamutPitch[][] = [];
    for (let i = 0; i < baseFoci.length; i += 1) {
      for (let j = i + 1; j < baseFoci.length; j += 1) {
        pairs.push([baseFoci[i], baseFoci[j]]);
      }
    }
    return pairs.length > 0 ? pairs : [[baseFoci[0], baseFoci[0]]];
  }

  return baseFoci.map((f) => [f]);
}

export function computeImmediateFamily(
  sourcePitches: readonly GamutPitch[],
  seedPitches: readonly GamutPitch[],
  config: TransformConfig
): TransformResult[] {
  const focusGroups = resolveFocusCandidates(sourcePitches, seedPitches, config);
  const multipliers =
    config.rule === 'multi-multiplier' && config.multipliers.length > 0
      ? config.multipliers
      : [config.multiplier];

  const results: TransformResult[] = [];
  for (const m of multipliers) {
    for (const fGroup of focusGroups) {
      results.push(applyFocusTransform(sourcePitches, fGroup, config, m));
    }
  }
  return results;
}
