/**
 * Storage of the positional patterns: `hrifa.harmonic-field-lab.patterns.v1` (H-9), a NEW sibling of `chordfinder.v1` (which is
 * never read or written here, so saved templates load untouched).
 *
 * ```
 * { version: 1, patterns: [{ text: '2-2' }, { text: '2-3-2' }] }
 * ```
 * Rules: entry by entry (an entry that is not a valid pattern is dropped, a repeated one is kept once, text is canonicalized,
 * at most 40 are kept); no write on mount (the caller compares identity); an absent or unreadable record, or one whose every
 * entry is bad, gives the defaults; a stored empty list stays empty (the user's choice). Every well-formed entry is written
 * back, so a later save never drops it.
 */
import { MAX_PATTERNS, canonicalPattern, defaultPatterns, type PatternsState } from './patterns';
import { KEY_PATTERNS, readJson, writeJson } from './persist';

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Coerce a stored value into the patterns; the defaults when it is not a patterns record or has no usable entry. */
export function sanitizePatterns(raw: unknown): PatternsState {
  const list = isObj(raw) ? raw.patterns : undefined;
  if (!Array.isArray(list)) {
    return defaultPatterns();
  }
  const out: string[] = [];
  for (const e of list.slice(0, 1000)) {
    const text = typeof e === 'string' ? e : isObj(e) && typeof e.text === 'string' ? e.text : '';
    const t = text.length <= 40 ? canonicalPattern(text) : null;
    if (t && !out.includes(t)) {
      out.push(t);
      if (out.length >= MAX_PATTERNS) {
        break;
      }
    }
  }
  return out.length === 0 && list.length > 0 ? defaultPatterns() : { list: out, refusal: null };
}

export function patternsToStored(s: PatternsState): Record<string, unknown> {
  return { version: 1, patterns: s.list.map((text) => ({ text })) };
}

/** The patterns for this page load: stored, else the defaults (nothing is written). */
export function loadPatterns(): PatternsState {
  return sanitizePatterns(readJson(KEY_PATTERNS));
}

/** Store the patterns; false when storage is unavailable or full. */
export function savePatterns(s: PatternsState): boolean {
  return writeJson(KEY_PATTERNS, patternsToStored(s));
}
