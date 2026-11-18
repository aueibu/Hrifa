export interface Fraction {
  num: number;
  den: number;
}

export interface GamutPitch {
  /** Index in the active gamut (0..N-1), or -1 if an off-gamut exact pitch. */
  index: number;
  /** Cents folded into [0, repeatCents) when folding is 'folded', else unfolded cents. */
  cents: number;
  /** Folded cents in [0, repeatCents), always normalized for ring display and canonical keys. */
  foldedCents: number;
  /** True acoustic register cents before mod-R folding. */
  unfoldedCents: number;
  /** Exact positive rational ratio (folded into [1, R) when folded), or null if irrational. */
  ratio: Fraction | null;
  /** Exact positive rational ratio in its unfolded register, or null if irrational. */
  unfoldedRatio: Fraction | null;
  /** Display label for the current folding/quantize mode (e.g. '5/4', '4', '386.3 c'). */
  label: string;
  /** Display label in unfolded form (e.g. '9/4', '1403.9 c'). */
  unfoldedLabel: string;
  /** Signed cents error (snappedCents - exactFoldedCents) when quantize === 'snap-to-gamut', else 0. */
  snapErrorCents: number;
  /** Label of the exact pre-snap pitch when snapped to gamut. */
  idealLabel: string;
  /** True if linear-freq or subharmonic produced a non-positive frequency/period (<= 0). */
  singular?: boolean;
}

export type GamutFamily = 'edo' | 'ji' | 'cps' | 'non-octave' | 'custom';

export interface TuningGamut {
  id: string;
  name: string;
  family: GamutFamily;
  description: string;
  repeatCents: number;
  repeatRatio: Fraction | null;
  pitches: GamutPitch[];
  /** Present when the gamut is an equal division of the repeat. */
  edoSteps?: number;
}

export type TransformDomain = 'gamut-steps' | 'log-pitch' | 'linear-freq' | 'subharmonic';

export type RuleFamily =
  | 'single-focus'
  | 'dual-focus'
  | 'perspective'
  | 'bilateral'
  | 'multi-multiplier';

export type OffsetMode = 'positive' | 'signed' | 'unwrapped';
export type FoldingMode = 'folded' | 'unfolded';
export type QuantizeMode = 'exact' | 'snap-to-gamut';
export type IdentityMode = 'unordered-set' | 'ordered-tuple';
export type FocusPolicy = 'current-members' | 'seed-members' | 'all-gamut' | 'custom';
export type DualFocusConstraint = 'swap' | 'fix-both' | 'preserve-axis';

export interface TransformConfig {
  gamut: TuningGamut;
  domain: TransformDomain;
  rule: RuleFamily;
  multiplier: number;
  /** Bilateral rule: multiplier for non-negative signed offsets (d >= 0). */
  multiplierPlus: number;
  /** Bilateral rule: multiplier for negative signed offsets (d < 0). */
  multiplierMinus: number;
  /** Multi-multiplier rule: list of multipliers to evaluate/close over. */
  multipliers: number[];
  /** Dual-focus constraint mode ('swap' is edge reflection f1 + f2 - x). */
  dualConstraint: DualFocusConstraint;
  offsetMode: OffsetMode;
  folding: FoldingMode;
  quantize: QuantizeMode;
  identity: IdentityMode;
  focusPolicy: FocusPolicy;
  customFoci: number[];
}

export interface VoiceTransformStep {
  voiceIndex: number;
  source: GamutPitch;
  focusLabel: string;
  offsetDisplay: string;
  offsetValue: number;
  scaledDisplay: string;
  scaledValue: number;
  rawUnfolded: GamutPitch;
  result: GamutPitch;
  /** Signed shortest-arc or unwrapped cents change from source to result. */
  displacementCents: number;
  isFixed: boolean;
}

export interface TransformResult {
  operationId: string;
  operationLabel: string;
  formulaDisplay: string;
  focusIndices: number[];
  focusPitches: GamutPitch[];
  multiplierUsed: number;
  sourcePitches: GamutPitch[];
  /** One per input voice, in unfolded register. */
  unfoldedPitches: GamutPitch[];
  /** One per input voice, folded into [0, repeatCents) (and snapped if quantize === 'snap-to-gamut'). */
  foldedPitches: GamutPitch[];
  /** Final canonical pitch list (deduplicated & sorted in unordered-set mode, or voice-ordered in ordered-tuple mode). */
  outputPitches: GamutPitch[];
  canonicalKey: string;
  steps: VoiceTransformStep[];
  invariantCount: number;
  totalVoiceLeadingCents: number;
  maxSnapErrorCents: number;
  signedAvgSnapErrorCents: number;
  isSelfLoop: boolean;
  collapsedCardinality: boolean;
}

export interface ClosureNode {
  id: string;
  pitches: GamutPitch[];
  generation: number;
  discoveredOrder: number;
  isSeed: boolean;
  isFixedUnderAnyFocus: boolean;
  fixedFocusLabels: string[];
  sccId: number;
  parents: string[];
}

export interface ClosureEdge {
  id: string;
  source: string;
  target: string;
  operationId: string;
  operationLabel: string;
  focusIndices: number[];
  focusLabel: string;
  multiplier: number;
  isSelfLoop: boolean;
  result: TransformResult;
}

export interface StronglyConnectedOrbit {
  id: number;
  nodeIds: string[];
  isAttractor: boolean;
  hasCycle: boolean;
}

export interface ClosureLimits {
  maxNodes: number;
  maxEdges: number;
  maxGeneration: number;
}

export interface ClosureGraph {
  seedId: string;
  nodes: ClosureNode[];
  edges: ClosureEdge[];
  generations: string[][];
  sccs: StronglyConnectedOrbit[];
  saturated: boolean;
  saturationGeneration: number | null;
  terminationReason: 'saturated' | 'maxNodes' | 'maxEdges' | 'maxGeneration';
}

export interface DualFocusMapEntry {
  id: string;
  a: number;
  b: number;
  formula: string;
  isBijective: boolean;
  focusA: number;
  focusB: number;
  imageA: number;
  imageB: number;
  constraintMatched: DualFocusConstraint;
  fixedPoints: number[];
  cycles: number[][];
  mapping: { input: number; output: number }[];
  transformedSeed: GamutPitch[];
  inClosure: boolean;
}

export interface TrajectoryStep {
  index: number;
  pitches: GamutPitch[];
  canonicalKey: string;
  operationLabel: string;
  formulaDisplay: string;
  focusPitches: GamutPitch[];
  multiplierUsed: number;
  fromStepResult: TransformResult | null;
}
