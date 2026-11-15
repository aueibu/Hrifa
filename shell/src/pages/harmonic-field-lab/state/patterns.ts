/**
 * The positional chord patterns (M9, H-9): the user's editable list of step patterns ("2-2", "2-3-2") the Positional section
 * of the Chords panel lists chords for. Pure: no React, no storage (patternStore.ts stores it as
 * `hrifa.harmonic-field-lab.patterns.v1`, a sibling of `chordfinder.v1`, which is never touched).
 *
 * The list holds each pattern in its canonical text (`patternName(parsePattern(text))`), no duplicates, at most
 * `MAX_PATTERNS`. A pattern is never dropped silently: a refused action leaves `refusal` with a reason. A stored empty list is
 * the user's own choice and stays empty.
 */
import { PRESET_PATTERNS, parsePattern, patternName } from '../../../lib/harmonic-field';

export const MAX_PATTERNS = 40;

export interface PatternsState {
  /** Canonical pattern texts, in the user's order. */
  list: string[];
  /** Set when an action was refused (invalid text, a duplicate, the cap); cleared by the next successful action. Runtime only. */
  refusal: { reason: string } | null;
}

export const defaultPatternList = (): string[] => [...PRESET_PATTERNS];
export const defaultPatterns = (): PatternsState => ({ list: defaultPatternList(), refusal: null });

/** The canonical text of a typed pattern, or null when it is not valid. */
export function canonicalPattern(text: string): string | null {
  const p = parsePattern(text);
  return p ? patternName(p) : null;
}

/**
 * The pattern the Positional section shows: the chosen one when it is in the list, else the first of the list (null when the
 * list is empty). `chosen` is `ui.positionalPattern`.
 */
export function chosenPattern(
  list: readonly string[],
  chosen: string | null | undefined
): string | null {
  return chosen && list.includes(chosen) ? chosen : (list[0] ?? null);
}

export type PatternAction =
  | { type: 'patterns/add'; text: string }
  | { type: 'patterns/edit'; at: number; text: string }
  | { type: 'patterns/delete'; at: number }
  | { type: 'patterns/move'; from: number; to: number }
  | { type: 'patterns/restore' }
  /** Another window saved the list: take it. */
  | { type: 'patterns/sync'; patterns: PatternsState };

const refuse = (s: PatternsState, reason: string): PatternsState => ({ ...s, refusal: { reason } });
const done = (s: PatternsState, list: string[]): PatternsState => ({ ...s, list, refusal: null });
const notAPattern = (text: string) =>
  `"${text.trim()}" is not a pattern. Use digits 1 to 9 joined by dashes, like 2-3-2 (1 to 8 steps).`;
const validAt = (s: PatternsState, at: number) =>
  Number.isInteger(at) && at >= 0 && at < s.list.length;

export function patternsReduce(s: PatternsState, a: PatternAction): PatternsState {
  switch (a.type) {
    case 'patterns/add': {
      const t = canonicalPattern(a.text);
      if (!t) {
        return refuse(s, notAPattern(a.text));
      }
      if (s.list.includes(t)) {
        return refuse(s, `${t} is already in the list.`);
      }
      if (s.list.length >= MAX_PATTERNS) {
        return refuse(s, `At most ${MAX_PATTERNS} patterns.`);
      }
      return done(s, [...s.list, t]);
    }
    case 'patterns/edit': {
      if (!validAt(s, a.at)) {
        return s;
      }
      const t = canonicalPattern(a.text);
      if (!t) {
        return refuse(s, notAPattern(a.text));
      }
      if (t === s.list[a.at]) {
        return s.refusal ? { ...s, refusal: null } : s;
      }
      if (s.list.includes(t)) {
        return refuse(s, `${t} is already in the list.`);
      }
      return done(
        s,
        s.list.map((x, i) => (i === a.at ? t : x))
      );
    }
    case 'patterns/delete':
      return validAt(s, a.at)
        ? done(
            s,
            s.list.filter((_, i) => i !== a.at)
          )
        : s;
    case 'patterns/move': {
      if (!validAt(s, a.from) || !Number.isInteger(a.to)) {
        return s;
      }
      const to = Math.min(Math.max(a.to, 0), s.list.length - 1);
      if (to === a.from) {
        return s;
      }
      const list = s.list.slice();
      const [x] = list.splice(a.from, 1);
      list.splice(to, 0, x);
      return done(s, list);
    }
    case 'patterns/restore': {
      const d = defaultPatternList();
      return d.length === s.list.length && d.every((x, i) => x === s.list[i])
        ? s.refusal
          ? { ...s, refusal: null }
          : s
        : done(s, d);
    }
    case 'patterns/sync':
      return { list: a.patterns.list, refusal: null };
  }
}
