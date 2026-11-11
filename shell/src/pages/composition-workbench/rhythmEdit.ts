/**
 * Rhythm Edit: turns items of an inter-onset rhythm into rests and ties, and changes their lengths
 * per note.
 *
 * It follows the Grid Traversal workshop's way of combining patterns and rules: a **program** is a
 * cyclic list of blocks `[action,count]`, where the count says how many notes the block covers and
 * can be `n`, a variable that changes as the program completes blocks (start, change, every K
 * blocks, never below 1). A program has a **phase** (how many notes pass before it starts) and a
 * **rate** (it ticks on every R-th note; the others pass through). Two programs run independently:
 *
 * - **Structure** acts on whether a note sounds: `x` keeps it, `r` makes it a rest of the same
 *   length, `~` ties it into the next note, `u` removes a tie. `[x,2][r,1]` keeps two notes, rests
 *   one, and repeats; a bare `x x r` is the same with every count 1.
 * - **Length** acts on how long a note is: `o` leaves it, `*3/5` multiplies it, `+1` or `-1/2` adds
 *   or removes pulses, `=2` sets it. `[*3/5,2][o,1]` shortens two notes by 3/5, then skips one.
 *
 * **Rules** are the other way to choose notes, and they stay: one rule per line, a selector and an
 * action (`every 3 from 2: r`, `4-6: *3/2`, `last: ~`, `>2: r`). Later rules override earlier ones,
 * and a rule's action can be a structure or a length action. See ARCHITECTURE.md, "Rests and ties".
 *
 * Lengths are exact fractions: `2 * 3/5` is 6/5 of a pulse, not 1.2000000000000002.
 */

import { packet as makePacket, type DataItem, type DataPacket, type PacketGrouping } from './model';
import {
  addRational,
  compareRational,
  multiplyRational,
  rational,
  rationalFromNumber,
  rationalToNumber,
  subtractRational,
  type Rational,
} from './musicalTime';
import { rhythmOrigin } from './rhythmFrame';
import { rhythmItemNotation } from './rhythmNotation';
import { rhythmAttacks } from './rhythmRealization';

export type RhythmEditOp = 'keep' | 'rest' | 'tie' | 'untie';

export type LengthAction =
  | { kind: 'keep' }
  | { kind: 'multiply'; factor: Rational }
  | { kind: 'add'; pulses: Rational }
  | { kind: 'subtract'; pulses: Rational }
  | { kind: 'set'; pulses: Rational };

/** The variable `n`: where it starts, how much it changes, and after how many completed blocks. */
export interface VariableConfig {
  start: number;
  change: number;
  every: number;
}

export const defaultVariableConfig: VariableConfig = { start: 1, change: 1, every: 1 };

/** When a program starts and how often it ticks, as for a field program in Grid Traversal. */
export interface ProgramTiming {
  /** Notes that pass before the program's first tick. */
  phase: number;
  /** The program ticks on every `rate`-th note after that. */
  rate: number;
}

export const defaultProgramTiming: ProgramTiming = { phase: 0, rate: 1 };

export interface Block<A> {
  action: A;
  /** How many notes the block covers: a whole number, or `n`. */
  count: number | 'n';
}

// ---------------------------------------------------------------- actions

const structureWords: Record<string, RhythmEditOp> = {
  x: 'keep',
  keep: 'keep',
  r: 'rest',
  rest: 'rest',
  '~': 'tie',
  tie: 'tie',
  u: 'untie',
  untie: 'untie',
};

function parseAmount(text: string): Rational | undefined {
  const match = /^(\d+)\/(\d+)$|^(\d*\.\d+|\d+)$/.exec(text.trim());
  if (!match) {
    return undefined;
  }
  if (match[3] !== undefined) {
    const value = Number(match[3]);
    return Number.isFinite(value) ? rationalFromNumber(value) : undefined;
  }
  const bottom = Number(match[2]);
  return bottom === 0 ? undefined : rational(Number(match[1]), bottom);
}

/** `x`, `r`, `~` or `u`. */
export function parseStructureAction(text: string): RhythmEditOp | undefined {
  return structureWords[text.trim().toLowerCase()];
}

/**
 * `o`, `*3/5`, `+1`, `-1/2` or `=2`. A bare fraction multiplies, so `1/2` and `*1/2` both halve a
 * note, and `/2` divides it. A bare whole number or decimal does not: write `*2` or `*.5`. Amounts
 * after an operator are whole numbers, fractions or decimals (`3/5`, `1.5`, `.5`). A multiplier or
 * set value must be greater than zero.
 */
export function parseLengthAction(text: string): LengthAction | undefined {
  const trimmed = text.trim().toLowerCase().replace(/^×/, '*');
  if (trimmed === 'o' || trimmed === 'keep') {
    return { kind: 'keep' };
  }
  // A bare fraction is a multiplier: `1/2` is `*1/2`. A bare number is not: it needs an operator.
  const bare = /^\d+\/\d+$/.test(trimmed) ? parseAmount(trimmed) : undefined;
  if (bare) {
    return bare.numerator > 0 ? { kind: 'multiply', factor: bare } : undefined;
  }
  // `/2` divides: `/2` is `*1/2`, `/.5` is `*2`.
  const divisor = /^\/\s*(.+)$/.exec(trimmed);
  const divide = divisor ? parseAmount(divisor[1]) : undefined;
  if (divide) {
    return divide.numerator > 0
      ? { kind: 'multiply', factor: rational(divide.denominator, divide.numerator) }
      : undefined;
  }
  const match = /^([*+\-=])\s*(.+)$/.exec(trimmed);
  const amount = match ? parseAmount(match[2]) : undefined;
  if (!match || !amount || (amount.numerator === 0 && match[1] !== '+' && match[1] !== '-')) {
    return undefined;
  }
  switch (match[1]) {
    case '*':
      return { kind: 'multiply', factor: amount };
    case '+':
      return { kind: 'add', pulses: amount };
    case '-':
      return { kind: 'subtract', pulses: amount };
    default:
      return { kind: 'set', pulses: amount };
  }
}

export function formatLengthAction(action: LengthAction): string {
  const text = (value: Rational) =>
    value.denominator === 1 ? String(value.numerator) : `${value.numerator}/${value.denominator}`;
  switch (action.kind) {
    case 'keep':
      return 'o';
    case 'multiply':
      return `*${text(action.factor)}`;
    case 'add':
      return `+${text(action.pulses)}`;
    case 'subtract':
      return `-${text(action.pulses)}`;
    default:
      return `=${text(action.pulses)}`;
  }
}

// ---------------------------------------------------------------- programs

export interface ParsedProgram<A> {
  blocks: Block<A>[];
  errors: string[];
}

/**
 * Reads `[action,count]` blocks and bare actions (count 1) in any mix. A bare token made only of
 * structure characters, such as `xxr`, is read one character per action.
 */
function parseProgram<A>(
  text: string,
  parseAction: (word: string) => A | undefined,
  splitCharacters: boolean,
  hint: string
): ParsedProgram<A> {
  const blocks: Block<A>[] = [];
  const errors: string[] = [];
  const scanner = /\[\s*([^,\]]+?)\s*,?\s*(\d+|n)\s*\]|([^\s,[\]]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = scanner.exec(text))) {
    if (match[1] !== undefined) {
      const action = parseAction(match[1]);
      const count = match[2].toLowerCase() === 'n' ? 'n' : Number(match[2]);
      if (action === undefined) {
        errors.push(`${match[0]}: ${hint}`);
      } else if (count !== 'n' && count < 1) {
        errors.push(`${match[0]}: a block must cover at least one note`);
      } else {
        blocks.push({ action, count });
      }
      continue;
    }
    const word = match[3];
    const whole = parseAction(word);
    if (whole !== undefined) {
      blocks.push({ action: whole, count: 1 });
      continue;
    }
    const characters = splitCharacters ? [...word].map(parseAction) : [];
    if (
      splitCharacters &&
      characters.length &&
      characters.every((action) => action !== undefined)
    ) {
      characters.forEach((action) => blocks.push({ action: action as A, count: 1 }));
    } else {
      errors.push(`${word}: ${hint}`);
    }
  }
  return { blocks, errors };
}

export function parseStructureProgram(text: string): ParsedProgram<RhythmEditOp> {
  if (!text.trim()) {
    return { blocks: [], errors: [] };
  }
  return parseProgram(
    text,
    parseStructureAction,
    true,
    'use x to keep, r for a rest, ~ for a tie, u to untie, as x or [r,2]'
  );
}

export function parseLengthProgram(text: string): ParsedProgram<LengthAction> {
  if (!text.trim()) {
    return { blocks: [], errors: [] };
  }
  return parseProgram(
    text,
    parseLengthAction,
    false,
    'use o, *3/5 (or just 3/5, or /2), +1, -1/2 or =2, as *3/5 or [*3/5,2]'
  );
}

/**
 * What a program does at one note, for drawing it: `waiting` before its phase, `skipped` between
 * ticks at its rate, `tick` where it acts. A tick carries its action and the number of the block it
 * belongs to (counting from 0 as blocks complete, so a block that repeats gets a new number).
 */
export interface TrackNote<A> {
  state: 'waiting' | 'skipped' | 'tick';
  action?: A;
  block?: number;
}

/**
 * Runs a program over `noteCount` notes and reports, for each, whether it waits, is skipped, or
 * ticks. This is Grid Traversal's field clock: a block runs for `count` ticks, then the next block
 * starts, and each `every` completed blocks `n` changes by `change` (never below 1).
 */
export function traceProgram<A>(
  blocks: Block<A>[],
  noteCount: number,
  variable: VariableConfig,
  { phase, rate }: ProgramTiming
): TrackNote<A>[] {
  const trace: TrackNote<A>[] = [];
  let blockIndex = 0;
  let blockNumber = 0;
  let step = 0;
  let completed = 0;
  let n = Math.max(1, variable.start);
  for (let note = 1; note <= noteCount; note += 1) {
    if (note <= phase) {
      trace.push({ state: 'waiting' });
      continue;
    }
    const due = (note - phase - 1) % Math.max(1, rate) === 0;
    if (!due || !blocks.length) {
      trace.push({ state: 'skipped' });
      continue;
    }
    const block = blocks[blockIndex];
    trace.push({ state: 'tick', action: block.action, block: blockNumber });
    const length = block.count === 'n' ? n : block.count;
    step += 1;
    if (step >= length) {
      step = 0;
      blockIndex = (blockIndex + 1) % blocks.length;
      blockNumber += 1;
      completed += 1;
      if (completed >= Math.max(1, variable.every)) {
        n = Math.max(1, n + variable.change);
        completed = 0;
      }
    }
  }
  return trace;
}

/**
 * Runs a program over `noteCount` notes: the action each note gets, or undefined where the program
 * does not tick (before its phase, or between ticks at its rate).
 */
export function runProgram<A>(
  blocks: Block<A>[],
  noteCount: number,
  variable: VariableConfig,
  timing: ProgramTiming
): (A | undefined)[] {
  return traceProgram(blocks, noteCount, variable, timing).map((note) => note.action);
}

// ---------------------------------------------------------------- rules

/** One rule: the (0-based) notes a selector picks out, and the structure or length action to apply. */
export interface EditRule {
  text: string;
  structure?: RhythmEditOp;
  length?: LengthAction;
  select(lengths: number[]): number[];
}

export interface ParsedEditRules {
  rules: EditRule[];
  errors: string[];
}

function parseLength(text: string): number | undefined {
  const amount = parseAmount(text);
  return amount ? rationalToNumber(amount) : undefined;
}

function selectorFor(selector: string): EditRule['select'] | undefined {
  const text = selector.trim().toLowerCase();
  if (text === 'all' || text === '*') {
    return (lengths) => lengths.map((_, index) => index);
  }
  if (text === 'first') {
    return (lengths) => (lengths.length ? [0] : []);
  }
  if (text === 'last') {
    return (lengths) => (lengths.length ? [lengths.length - 1] : []);
  }
  const every = /^every\s+(\d+)(?:\s+from\s+(\d+))?$/.exec(text);
  if (every) {
    const step = Number(every[1]);
    const from = Number(every[2] ?? 1);
    if (step < 1 || from < 1) {
      return undefined;
    }
    return (lengths) =>
      lengths.flatMap((_, index) =>
        index + 1 >= from && (index + 1 - from) % step === 0 ? [index] : []
      );
  }
  const compare = /^(>=|<=|>|<)\s*(\d+\/\d+|\d*\.\d+|\d+)$/.exec(text);
  if (compare) {
    const limit = parseLength(compare[2]);
    if (limit === undefined) {
      return undefined;
    }
    const test: Record<string, (length: number) => boolean> = {
      '>': (length) => length > limit + 1e-9,
      '>=': (length) => length >= limit - 1e-9,
      '<': (length) => length < limit - 1e-9,
      '<=': (length) => length <= limit + 1e-9,
    };
    return (lengths) =>
      lengths.flatMap((length, index) => (test[compare[1]](length) ? [index] : []));
  }
  // Note numbers and ranges: `3`, `3-5`, `1, 3, 5-6`.
  const parts = text.split(/\s*,\s*|\s+/).filter(Boolean);
  const ranges: [number, number][] = [];
  for (const part of parts) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match) {
      return undefined;
    }
    const low = Number(match[1]);
    const high = Number(match[2] ?? match[1]);
    if (low < 1 || high < low) {
      return undefined;
    }
    ranges.push([low, high]);
  }
  if (!ranges.length) {
    return undefined;
  }
  return (lengths) =>
    lengths.flatMap((_, index) =>
      ranges.some(([low, high]) => index + 1 >= low && index + 1 <= high) ? [index] : []
    );
}

export function parseEditRules(text: string): ParsedEditRules {
  const rules: EditRule[] = [];
  const errors: string[] = [];
  text
    .split(/[\n;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      // The action is the last word; everything before it is the selector.
      const words = line.replace(/:/g, ' ').trim().split(/\s+/);
      const actionWord = words.pop() ?? '';
      const structure = parseStructureAction(actionWord);
      const length = structure === undefined ? parseLengthAction(actionWord) : undefined;
      const select = structure !== undefined || length ? selectorFor(words.join(' ')) : undefined;
      if (!select) {
        errors.push(
          `Rule ${index + 1} (${line}): write a selector and an action, such as "every 3 from 2: r", "4-6: *3/2", "last: ~" or ">2: r"`
        );
        return;
      }
      rules.push({ text: line, structure, length, select });
    });
  if (!rules.length && !errors.length) {
    errors.push('Enter at least one rule, such as every 3: r.');
  }
  return { rules, errors };
}

// ---------------------------------------------------------------- grouping

/**
 * Moves grouping boundaries with the notes they fall in. Note k runs from its start to start plus
 * its length (notes begin at `origin`); a boundary inside note k keeps its fraction through that
 * note when the note's length changes, one before the first note stays put, and one after the last
 * note shifts by the change in total length. Exact arithmetic throughout.
 */
function followGrouping(
  grouping: PacketGrouping,
  oldLengths: number[],
  newLengths: number[],
  origin: number
): PacketGrouping {
  const zero = rational(0);
  const start = rationalFromNumber(origin);
  const olds = oldLengths.map((length) => rationalFromNumber(length));
  const news = newLengths.map((length) => rationalFromNumber(length));
  const oldStarts: Rational[] = [];
  const newStarts: Rational[] = [];
  let oldCursor = start;
  let newCursor = start;
  olds.forEach((length, index) => {
    oldStarts.push(oldCursor);
    newStarts.push(newCursor);
    oldCursor = addRational(oldCursor, length);
    newCursor = addRational(newCursor, news[index]);
  });
  const move = (boundary: number): number => {
    const position = rationalFromNumber(boundary);
    if (compareRational(position, start) < 0) {
      return boundary;
    }
    for (let index = 0; index < olds.length; index += 1) {
      const end = addRational(oldStarts[index], olds[index]);
      if (compareRational(position, end) < 0) {
        const inside = subtractRational(position, oldStarts[index]);
        const fraction = multiplyRational(
          inside,
          rational(olds[index].denominator, olds[index].numerator)
        );
        return rationalToNumber(
          addRational(newStarts[index], multiplyRational(news[index], fraction))
        );
      }
    }
    return rationalToNumber(addRational(position, subtractRational(newCursor, oldCursor)));
  };
  const oldSpan = subtractRational(oldCursor, start);
  const newSpan = subtractRational(newCursor, start);
  const ratio =
    compareRational(oldSpan, zero) > 0
      ? rationalToNumber(
          multiplyRational(newSpan, rational(oldSpan.denominator, oldSpan.numerator))
        )
      : 1;
  return {
    ...grouping,
    units: grouping.units * ratio,
    boundaries: grouping.boundaries.map(move),
  };
}

// ---------------------------------------------------------------- the edit

export type RhythmEditMode = 'program' | 'rules';

/**
 * What happens to the source's grouping boundaries when note lengths change:
 * - `drop`: remove the grouping, with a warning (the boundaries no longer line up with the notes).
 * - `keep`: leave the boundaries at the same pulses; notes may then cross them.
 * - `follow`: move each boundary with the note it falls in, to the same fraction of that note's new
 *   length, so a boundary at the start of note 4 stays at the start of note 4. Groups are then no
 *   longer equal, so `units` is rescaled by the change in total length.
 */
export type GroupingPolicy = 'drop' | 'keep' | 'follow';

/** Per note: what each program did there, as text to draw. A program with nothing to show is absent. */
export interface EditTracks {
  structure?: TrackNote<string>[];
  length?: TrackNote<string>[];
}

export interface RhythmEditResult {
  packet?: DataPacket<number>;
  errors: string[];
  /** How many items the edit changed. */
  changed: number;
  /** The programs and rules laid out note by note, to draw alongside the input. */
  tracks?: EditTracks;
}

export function editRhythm({
  instanceId,
  source,
  mode = 'program',
  program = '',
  programTiming = defaultProgramTiming,
  rules = '',
  lengths = '',
  lengthTiming = defaultProgramTiming,
  variable = defaultVariableConfig,
  grouping = 'drop',
}: {
  instanceId: string;
  source?: DataPacket;
  mode?: RhythmEditMode;
  /** The structure program: `[x,2][r,1]`, or `x x r`. */
  program?: string;
  programTiming?: ProgramTiming;
  rules?: string;
  /** The length program: `[*3/5,2][o,1]`. */
  lengths?: string;
  lengthTiming?: ProgramTiming;
  variable?: VariableConfig;
  grouping?: GroupingPolicy;
}): RhythmEditResult {
  if (
    !source ||
    source.kind !== 'list' ||
    source.domain !== 'duration' ||
    source.role !== 'interOnset'
  ) {
    return { errors: ['Connect an inter-onset duration list to edit.'], changed: 0 };
  }
  // An empty program or rule list changes nothing, so each part can be used on its own.
  const structure = mode === 'program' ? parseStructureProgram(program) : undefined;
  const parsedRules = mode === 'rules' && rules.trim() ? parseEditRules(rules) : undefined;
  const lengthProgram = parseLengthProgram(lengths);
  const errors = [
    ...(structure?.errors ?? []),
    ...(parsedRules?.errors ?? []),
    ...lengthProgram.errors,
  ];
  if (errors.length) {
    return { errors, changed: 0 };
  }

  const sourceItems = (source as DataPacket<number>).items;
  const inputLengths = sourceItems.map((item) => Math.abs(Number(item.value)));

  const structureTrace: TrackNote<RhythmEditOp>[] = structure
    ? traceProgram(structure.blocks, sourceItems.length, variable, programTiming)
    : sourceItems.map(() => ({ state: 'skipped' }));
  const lengthTrace: TrackNote<LengthAction>[] = traceProgram(
    lengthProgram.blocks,
    sourceItems.length,
    variable,
    lengthTiming
  );
  const structureOps: (RhythmEditOp | undefined)[] = structureTrace.map((note) => note.action);
  const lengthActions: (LengthAction | undefined)[] = lengthTrace.map((note) => note.action);
  // Rules override the programs, in order. Each rule changes either what a note does or its length.
  // A rule's note ticks in its track too, though with no block: rules do not come in blocks.
  const ruleSources: Record<number, string> = {};
  let rulesStructure = false;
  let rulesLength = false;
  for (const rule of parsedRules?.rules ?? []) {
    for (const index of rule.select(inputLengths)) {
      if (rule.structure !== undefined) {
        structureOps[index] = rule.structure;
        structureTrace[index] = { state: 'tick', action: rule.structure };
        rulesStructure = true;
      }
      if (rule.length) {
        lengthActions[index] = rule.length;
        lengthTrace[index] = { state: 'tick', action: rule.length };
        rulesLength = true;
      }
      ruleSources[index] = rule.text;
    }
  }
  const textOf = <A>(trace: TrackNote<A>[], format: (action: A) => string): TrackNote<string>[] =>
    trace.map((note) => ({
      ...note,
      action: note.action === undefined ? undefined : format(note.action),
    }));
  const tracks: EditTracks = {
    structure:
      (structure && structure.blocks.length) || rulesStructure
        ? textOf(structureTrace, (op) =>
            op === 'keep' ? 'x' : op === 'rest' ? 'r' : op === 'tie' ? '~' : 'u'
          )
        : undefined,
    length:
      lengthProgram.blocks.length || rulesLength
        ? textOf(lengthTrace, formatLengthAction)
        : undefined,
  };

  const warnings: string[] = [];
  let changed = 0;
  let lengthsChanged = false;
  const items = sourceItems.map((item, index): DataItem<number> => {
    const op = structureOps[index] ?? 'keep';
    const action = lengthActions[index] ?? { kind: 'keep' };
    const base = rationalFromNumber(inputLengths[index]);
    let next: Rational = base;
    switch (action.kind) {
      case 'multiply':
        next = multiplyRational(base, action.factor);
        break;
      case 'add':
        next = addRational(base, action.pulses);
        break;
      case 'subtract':
        next = subtractRational(base, action.pulses);
        break;
      case 'set':
        next = action.pulses;
        break;
      default:
        break;
    }
    if (compareRational(next, rational(0)) <= 0) {
      warnings.push(
        `Note ${index + 1}: ${formatLengthAction(action)} would leave it at or below zero, so its length was kept.`
      );
      next = base;
    }
    const length = compareRational(next, base) === 0 ? inputLengths[index] : rationalToNumber(next);
    const lengthChanged = length !== inputLengths[index];
    const isRest = op === 'rest' || (op !== 'tie' && Number(item.value) < 0);
    // A rest never carries a tie.
    const tie = isRest
      ? undefined
      : op === 'tie'
        ? true
        : op === 'untie'
          ? undefined
          : item.tie || undefined;
    const value = isRest ? -length : length;
    if (value === item.value && Boolean(tie) === Boolean(item.tie)) {
      return item;
    }
    changed += 1;
    lengthsChanged ||= lengthChanged;
    const { tie: _previous, ...rest } = item;
    const provenance = [...item.provenance];
    if (lengthChanged) {
      provenance.push({
        sourceModuleInstance: instanceId,
        sourceItemIds: [item.id],
        transformation: 'edit-length',
        parameters: { action: formatLengthAction(action), rule: ruleSources[index] },
      });
    }
    if (op !== 'keep') {
      provenance.push({
        sourceModuleInstance: instanceId,
        sourceItemIds: [item.id],
        transformation: 'edit-rhythm',
        parameters: { op, mode, rule: ruleSources[index] },
      });
    }
    const edited: DataItem<number> = {
      ...rest,
      value,
      ...(tie ? { tie: true } : {}),
      provenance,
    };
    return { ...edited, label: rhythmItemNotation(edited) };
  });

  const topology = source.frame?.topology;
  const origin = rhythmOrigin(source);
  const resolved = rhythmAttacks(
    items.map((item) => ({ duration: item.value, tie: item.tie, itemId: item.id })),
    origin,
    { cyclic: topology === 'cyclic' }
  );
  const allWarnings = [
    ...source.warnings,
    ...warnings,
    ...resolved.warnings.filter((warning) => !source.warnings.includes(warning)),
  ];
  // Lengths changed note by note, so the span moves and a grouping no longer lines up with it.
  const sourceGrouping = source.frame?.grouping;
  const dropGrouping = lengthsChanged && Boolean(sourceGrouping) && grouping === 'drop';
  if (dropGrouping) {
    allWarnings.push('The grouping was dropped because note lengths changed.');
  }
  const followedGrouping =
    lengthsChanged && sourceGrouping && grouping === 'follow'
      ? followGrouping(
          sourceGrouping,
          inputLengths,
          items.map((item) => Math.abs(Number(item.value))),
          origin
        )
      : undefined;
  const frame = source.frame
    ? {
        ...source.frame,
        extent:
          source.frame.extent === undefined
            ? undefined
            : resolved.spanPulses + (topology === 'linear' ? origin : 0),
        grouping: dropGrouping ? undefined : (followedGrouping ?? source.frame.grouping),
      }
    : undefined;
  return {
    packet: makePacket<number>(
      'list',
      'duration',
      items,
      allWarnings,
      {
        ...source.metadata,
        rhythmEdit: { mode, program, rules, lengths, variable, programTiming, lengthTiming },
      },
      { role: 'interOnset', frame, encoding: source.encoding }
    ),
    errors: [],
    changed,
    tracks,
  };
}

/**
 * The same rhythm stretched or shrunk, every note by one exact factor, so that its total length is
 * `target` pulses. Rests keep their sign and ties stay on their notes; only the lengths change. This
 * is the input read at the edit's overall length, to hear or see what the edit did beyond changing
 * how long the whole thing is.
 */
export function scaleStepsToLength<T extends { duration: number }>(
  steps: T[],
  target: number
): T[] {
  const total = steps.reduce((sum, step) => sum + Math.abs(step.duration), 0);
  if (!(total > 0) || !(target > 0)) {
    return steps.map((step) => ({ ...step }));
  }
  const factor = multiplyRational(
    rationalFromNumber(target),
    rational(rationalFromNumber(total).denominator, rationalFromNumber(total).numerator)
  );
  return steps.map((step) => {
    const length = rationalToNumber(
      multiplyRational(rationalFromNumber(Math.abs(step.duration)), factor)
    );
    return { ...step, duration: step.duration < 0 ? -length : length };
  });
}
