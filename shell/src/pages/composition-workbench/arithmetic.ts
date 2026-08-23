import { positiveModulo } from './alignment';
import type { PitchAllocation } from './melodicization';
import { applyModulo, type ModuloTreatment } from './moduloTreatment';
import { packet, type DataItem, type DataDomain, type DataPacket, type Provenance } from './model';
import type { PitchClassItemValue, PitchItemValue } from './pitch';
import { pitchLabel } from './routeTreatments';

export type ArithmeticOperator =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'floorDivide'
  | 'power'
  | 'exp';

export const arithmeticOperatorLabels: Record<ArithmeticOperator, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  floorDivide: '//',
  power: '^',
  exp: 'eˣ',
};

// Defaults verified against the OM 7.6 reference docs' own [default = …] argument values
// (om+.html, om-.html, omX.html, omI.html, omII.html, om^.html, om-e.html).
export const arithmeticOperatorDefaults: Record<ArithmeticOperator, { a: number; b: number }> = {
  add: { a: 0, b: 0 },
  subtract: { a: 0, b: 0 },
  multiply: { a: 0, b: 0 },
  divide: { a: 1, b: 1 },
  floorDivide: { a: 1, b: 1 },
  power: { a: 1, b: 1 },
  exp: { a: 1, b: 0 },
};

export interface ArithmeticResult {
  packet: DataPacket;
  errors: string[];
  messages: string[];
}

// Domains whose per-item value is a bracketed group of numbers (a chord/simultaneity) rather
// than a single number. Verified against OM 7.6's own kernel.lisp: om+'s list+list method is
// `(mapcar (lambda (x y) (om+ x y)) arg1 arg2)` — a CLOS generic function recursing through
// nested lists automatically, with no special "list mode" required. A pitch group's bracketed
// pitches are exactly that kind of nested list, so arithmetic recurses one level into them the
// same way OM's own recursion would.
const groupedDomains = new Set<DataDomain>(['pitch', 'pitchClass']);

function isGroupedDomain(domain: DataDomain) {
  return groupedDomains.has(domain);
}

function emptyResult(errors: string[]): ArithmeticResult {
  return { packet: packet('list', 'integer', [], errors), errors, messages: [] };
}

function applyOperator(operator: ArithmeticOperator, a: number, b: number): { value: number; warning?: string } {
  switch (operator) {
    case 'add':
      return { value: a + b };
    case 'subtract':
      return { value: a - b };
    case 'multiply':
      return { value: a * b };
    case 'divide':
      return b === 0 ? { value: a / b, warning: 'divided by zero' } : { value: a / b };
    case 'floorDivide':
      return b === 0
        ? { value: Math.floor(a / b), warning: 'divided by zero' }
        : { value: Math.floor(a / b) };
    case 'power':
      return { value: Math.pow(a, b) };
    case 'exp':
      return { value: Math.exp(a) };
  }
}

function pairIndices(
  lengthA: number,
  lengthB: number,
  strategy: PitchAllocation
): { aIndex: number; bIndex: number }[] {
  if (lengthA === lengthB) {
    return Array.from({ length: lengthA }, (_, index) => ({ aIndex: index, bIndex: index }));
  }
  if (lengthA === 1 || lengthB === 1) {
    const length = Math.max(lengthA, lengthB);
    return Array.from({ length }, (_, index) => ({
      aIndex: lengthA === 1 ? 0 : index,
      bIndex: lengthB === 1 ? 0 : index,
    }));
  }
  if (strategy === 'cycle') {
    return Array.from({ length: lengthA }, (_, index) => ({
      aIndex: index,
      bIndex: index % lengthB,
    }));
  }
  if (strategy === 'cycle-rhythm') {
    return Array.from({ length: lengthB }, (_, index) => ({
      aIndex: index % lengthA,
      bIndex: index,
    }));
  }
  if (strategy === 'zip') {
    const length = Math.min(lengthA, lengthB);
    return Array.from({ length }, (_, index) => ({ aIndex: index, bIndex: index }));
  }
  const pairs: { aIndex: number; bIndex: number }[] = [];
  for (let aIndex = 0; aIndex < lengthA; aIndex += 1) {
    for (let bIndex = 0; bIndex < lengthB; bIndex += 1) {
      pairs.push({ aIndex, bIndex });
    }
  }
  return pairs;
}

// --- Structured (grouped-domain) combination -------------------------------------------
//
// Mirrors OM's own recursive dispatch: a leaf number combines directly; a leaf against a
// group broadcasts over every pitch in the group; two groups pair up by `strategy` just like
// two top-level lists do. This only ever needs one level of nesting today (a pitch group
// itself never contains sub-groups), but is written recursively so it stays correct if a
// deeper structure is ever introduced.
export type NumericTree = number | NumericTree[];

function combineTrees(
  operator: ArithmeticOperator,
  a: NumericTree,
  b: NumericTree,
  strategy: PitchAllocation
): { tree: NumericTree; warnings: string[] } {
  if (typeof a === 'number' && typeof b === 'number') {
    const { value, warning } = applyOperator(operator, a, b);
    return { tree: value, warnings: warning ? [warning] : [] };
  }
  if (typeof a === 'number') {
    const results = (b as NumericTree[]).map((item) => combineTrees(operator, a, item, strategy));
    return { tree: results.map((r) => r.tree), warnings: results.flatMap((r) => r.warnings) };
  }
  if (typeof b === 'number') {
    const results = (a as NumericTree[]).map((item) => combineTrees(operator, item, b, strategy));
    return { tree: results.map((r) => r.tree), warnings: results.flatMap((r) => r.warnings) };
  }
  const arrA = a as NumericTree[];
  const arrB = b as NumericTree[];
  const pairs = pairIndices(arrA.length, arrB.length, strategy);
  const results = pairs.map(({ aIndex, bIndex }) => combineTrees(operator, arrA[aIndex], arrB[bIndex], strategy));
  return { tree: results.map((r) => r.tree), warnings: results.flatMap((r) => r.warnings) };
}

function mapTree(tree: NumericTree, fn: (value: number) => number): NumericTree {
  return typeof tree === 'number' ? fn(tree) : tree.map((item) => mapTree(item, fn));
}

// Exposed so the UI can show exactly the raw numbers an operation actually used — the same
// decomposition computeArithmetic itself runs, not a separate/re-derived display value that
// could silently drift from what's really being combined. Every domain's item value, pitch and
// pitchClass included, is already `number | number[]` by construction (no wrapper to unwrap);
// this only falls back to `Number(value)` for a genuinely unexpected shape. No domain parameter
// is needed any more — decomposition no longer depends on which domain produced the value.
export function rawNumericTree(value: unknown): NumericTree {
  if (typeof value === 'number') {
    return value;
  }
  if (Array.isArray(value)) {
    return value as NumericTree;
  }
  return Number(value);
}

export function formatNumericTree(tree: NumericTree): string {
  return typeof tree === 'number' ? String(tree) : `[${tree.map(formatNumericTree).join(', ')}]`;
}

const pitchClassNames = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

function flattenTree(tree: NumericTree, out: number[] = []): number[] {
  if (typeof tree === 'number') {
    out.push(tree);
  } else {
    tree.forEach((item) => flattenTree(item, out));
  }
  return out;
}

function recomposeGroup(
  domain: DataDomain,
  tree: NumericTree
): { value: PitchClassItemValue | PitchItemValue; label: string } {
  const numbers = flattenTree(tree);
  if (domain === 'pitchClass') {
    const pitchClasses = numbers.map((raw) => positiveModulo(Math.round(raw), 12));
    const label = pitchClasses.map((pitchClass) => pitchClassNames[pitchClass]).join(' ');
    const wrappedLabel = pitchClasses.length > 1 ? `[${label}]` : label;
    const value: PitchClassItemValue = pitchClasses.length > 1 ? pitchClasses : pitchClasses[0];
    return { value, label: wrappedLabel };
  }
  const label = numbers.map((midicents) => pitchLabel(midicents)).join(' ');
  const wrappedLabel = numbers.length > 1 ? `[${label}]` : label;
  const value: PitchItemValue = numbers.length > 1 ? numbers : numbers[0];
  return { value, label: wrappedLabel };
}

export function computeArithmetic({
  instanceId,
  operator,
  a,
  b,
  fallbackA,
  fallbackB,
  combineStrategy,
  modulo,
}: {
  instanceId: string;
  operator: ArithmeticOperator;
  a?: DataPacket;
  b?: DataPacket;
  fallbackA: number;
  fallbackB: number;
  combineStrategy: PitchAllocation;
  modulo: ModuloTreatment;
}): ArithmeticResult {
  const isUnary = operator === 'exp';

  // OM's om+ (verified against kernel.lisp) dispatches purely on Lisp type — number vs list —
  // with zero awareness of what the numbers "mean." It happily adds a duration list to a pitch
  // list; that's not an error there and isn't one here either. The domain only matters for
  // choosing how to LABEL the result: when A and B agree, the result keeps that meaning
  // (transposing a pitch list by a duration-domain list would be unusual, but the packet stays
  // honestly typed); when they disagree, the result is honestly untyped (`integer`) rather than
  // silently claiming to still be whichever domain happened to be A's.
  const bDomain = isUnary ? undefined : b?.domain;
  const domain: DataDomain =
    a && bDomain
      ? a.domain === bDomain
        ? a.domain
        : 'integer'
      : (a?.domain ?? bDomain ?? 'integer');

  const groupedA = Boolean(a && isGroupedDomain(a.domain));
  const groupedB = Boolean(!isUnary && b && isGroupedDomain(b.domain));
  const groupedOutput = a && bDomain ? a.domain === bDomain && groupedA : groupedA || groupedB;
  // True whenever an item's value could come out as an array rather than a plain number —
  // either a genuine grouped-domain output, or a mismatched-domain combination where one side
  // was grouped and broadcast its structure onto the result.
  const structurallyNested = groupedA || groupedB;

  const aItems: DataItem<unknown>[] = a ? a.items : [{ id: 'fallback', value: fallbackA, provenance: [] }];
  const bItems: DataItem<unknown>[] = isUnary
    ? [{ id: 'unused', value: 0, provenance: [] as Provenance[] }]
    : b
      ? b.items
      : [{ id: 'fallback', value: fallbackB, provenance: [] }];

  if (!aItems.length || !bItems.length) {
    return emptyResult(['A and B must each contain at least one item.']);
  }

  const pairs = isUnary
    ? aItems.map((_, index) => ({ aIndex: index, bIndex: 0 }))
    : pairIndices(aItems.length, bItems.length, combineStrategy);

  const messages: string[] = [];
  const warningCounts = new Map<string, number>();
  const items: DataItem<unknown>[] = pairs.map(({ aIndex, bIndex }, index) => {
    const aItem = aItems[aIndex];
    const bItem = bItems[bIndex];
    // Each side decomposes by its OWN domain, not a shared one — A and B can legitimately be
    // different domains (OM's om+ doesn't care what a list "means"). Every domain's item value
    // is already `number | number[]`; rawNumericTree's only real job left is the unconnected
    // fallback case (a bare typed-in number).
    const aTree: NumericTree = rawNumericTree(aItem.value);
    const bTree: NumericTree = rawNumericTree(bItem.value);
    const { tree, warnings } = combineTrees(operator, aTree, bTree, combineStrategy);
    warnings.forEach((warning) => warningCounts.set(warning, (warningCounts.get(warning) ?? 0) + 1));
    // Anything structurally nested — a grouped-domain output, or a mismatched-domain
    // combination where one side happened to be grouped — folds modulo in here via mapTree,
    // since applyModulo's DataItem<number> shape only fits a genuinely flat number. Fully flat
    // results skip this and go through applyModulo below, unchanged from before.
    const finalTree =
      structurallyNested && modulo.enabled
        ? mapTree(tree, (value) => positiveModulo(value, modulo.divisor))
        : tree;
    const recomposed = groupedOutput ? recomposeGroup(domain, finalTree) : undefined;
    const value = recomposed ? recomposed.value : (finalTree as number | number[]);
    return {
      id: `${instanceId}:arithmetic:${index}`,
      value,
      label: recomposed ? recomposed.label : formatNumericTree(finalTree),
      provenance: [
        ...aItem.provenance,
        ...(isUnary ? [] : bItem.provenance),
        {
          sourceModuleInstance: instanceId,
          sourceItemIds: isUnary ? [aItem.id] : [aItem.id, bItem.id],
          transformation: operator,
        },
      ],
    };
  });

  warningCounts.forEach((count, warning) => {
    messages.push(`${count} item${count === 1 ? '' : 's'} ${warning}.`);
  });

  if (
    !isUnary &&
    combineStrategy === 'zip' &&
    aItems.length !== bItems.length &&
    aItems.length > 1 &&
    bItems.length > 1
  ) {
    const used = Math.min(aItems.length, bItems.length);
    if (aItems.length > used) {
      messages.push(`${aItems.length - used} trailing A item${aItems.length - used === 1 ? '' : 's'} unused by Zip.`);
    }
    if (bItems.length > used) {
      messages.push(`${bItems.length - used} trailing B item${bItems.length - used === 1 ? '' : 's'} unused by Zip.`);
    }
  }

  // Fully flat results still route through the shared applyModulo building block (with its
  // provenance-append behavior); anything structurally nested already folded modulo in above,
  // since applyModulo's DataItem<number> shape doesn't fit an array-valued item.
  const finalItems =
    structurallyNested || !modulo.enabled ? items : applyModulo(items as DataItem<number>[], modulo);
  const kind = finalItems.length === 1 ? ('value' as const) : ('list' as const);

  return {
    packet: packet(kind, domain, finalItems, messages, { operator, combineStrategy }),
    errors: [],
    messages,
  };
}
