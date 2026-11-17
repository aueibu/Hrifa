/** M7a: Check a library entry on the subset, and the add action (SCENARIOS.M7.md rows 7 to 10). */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEMPLATES,
  libraryEntries,
  parseInterval,
  type LibraryEntry,
  type Note,
  type RelNote,
} from '../../../lib/harmonic-field';
import { MAX_CHORDS } from './derive';
import { MAX_TEMPLATES, initialState, labReducer, type Action, type LabState } from './labState';
import { checkEntry, checkSentence } from './libraryCheck';
import { sanitizeTemplates } from './persist';

const entries = libraryEntries(1200);
const entry = (t: string): LibraryEntry => entries.find((e) => e.text === t) as LibraryEntry;
const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);

const baseOf = (xs: string[]) => ({
  repC: 1200,
  ratios: xs,
  rel: xs.map((s, i) => ({ ...(parseInterval(s) as Note), src: i }) as RelNote),
});
const major5 = baseOf(['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8']);

describe('checkEntry (row 10)', () => {
  it('Minor Triad at tolerance 0 is found on 5/4 and 5/3', () => {
    const r = checkEntry(major5, entry('10:12:15'), 0)!;
    expect(r.count).toBe(2);
    expect(r.hits.map((h) => h.root)).toEqual(['5/4', '5/3']);
    expect(r.hits.map((h) => h.rootIdx)).toEqual([2, 5]);
    expect(r.hits.every((h) => h.maxErr < 1e-6)).toBe(true);
    expect(r.truncated).toBe(false);
  });

  it('at 25 c D minor joins, at 21.5 c', () => {
    const r = checkEntry(major5, entry('10:12:15'), 25)!;
    expect(r.count).toBe(3);
    expect(r.hits.map((h) => h.root)).toEqual(['9/8', '5/4', '5/3']);
    expect(r.hits[0].maxErr).toBeCloseTo(21.5, 1);
    expect(checkEntry(major5, entry('10:12:15'), 21)!.count).toBe(2);
  });

  it('finds the major triad on 1/1, 4/3 and 3/2 and uses the base repeat', () => {
    const r = checkEntry(major5, entry('4:5:6'), 0)!;
    expect(r.hits.map((h) => h.root)).toEqual(['1/1', '4/3', '3/2']);
  });

  it('a root with several voicings counts once', () => {
    const b = baseOf(['1/1', '13/8', '5/3']);
    const r = checkEntry(b, { text: '3:5' }, 50)!;
    expect(r.hits.filter((h) => h.rootIdx === 0)).toHaveLength(1);
    expect(r.hits.find((h) => h.rootIdx === 0)!.maxErr).toBeLessThan(1e-6);
  });

  it('is null outside 2 to 128 notes (the usual hint)', () => {
    expect(MAX_CHORDS).toBe(128);
    expect(checkEntry(baseOf(['1/1']), entry('4:5:6'), 10)).toBeNull();
    const many = (n: number) => baseOf(Array.from({ length: n }, (_, i) => `${100 + i}/100`));
    expect(checkEntry(many(MAX_CHORDS), entry('4:5:6'), 1)).not.toBeNull();
    expect(checkEntry(many(MAX_CHORDS + 1), entry('4:5:6'), 1)).toBeNull();
  });

  it('a folding entry finds nothing', () => {
    expect(checkEntry(major5, entry('1:2:3'), 50)).toMatchObject({ count: 0, hits: [] });
  });

  it('does not touch the templates', () => {
    const s = initialState();
    const before = s.templates;
    checkEntry(major5, entry('10:12:15'), 25);
    expect(s.templates).toBe(before);
    expect(s.templates).toEqual(DEFAULT_TEMPLATES);
  });
});

describe('checkSentence (the line under a checked row)', () => {
  const hit = (root: string, maxErr = 0) => ({
    rootIdx: 0,
    root,
    maxErr,
    errors: [0, maxErr],
    worst: maxErr,
    avg: maxErr,
  });
  it('names the roots, adds the worst error only when it is above 0', () => {
    expect(
      checkSentence({ hits: [hit('5/4'), hit('5/3', 1e-9)], count: 2, truncated: false })
    ).toBe('2 found: on 5/4, 5/3');
    expect(
      checkSentence({
        hits: [hit('9/8', 21.5), hit('5/4'), hit('5/3')],
        count: 3,
        truncated: false,
      })
    ).toBe('3 found: on 9/8, 5/4, 5/3 (worst 21.5 c)');
  });
  it('none found, a cut-short search, and a long list kept to one line', () => {
    expect(checkSentence({ hits: [], count: 0, truncated: false })).toBe('none found');
    expect(checkSentence({ hits: [], count: 0, truncated: true })).toBe(
      'none found; search cut short'
    );
    const many = Array.from({ length: 11 }, (_, i) => hit(`${i + 2}/1`));
    expect(checkSentence({ hits: many, count: 11, truncated: true })).toBe(
      '11 found: on 2/1, 3/1, 4/1, 5/1, 6/1, 7/1, 8/1, 9/1, +3 more; search cut short'
    );
  });
});

describe('templates/addLibrary', () => {
  const noMinor = (): LabState =>
    run(initialState(), {
      type: 'templates/set',
      templates: DEFAULT_TEMPLATES.filter((t) => t.text !== '10:12:15'),
    });

  it('adds the entry, with its name and family, and says so (row 7)', () => {
    const s0 = noMinor();
    const s1 = run(s0, { type: 'templates/addLibrary', entries: [entry('10:12:15')] });
    expect(s1.templates).toEqual([
      ...s0.templates,
      { text: '10:12:15', name: 'Minor Triad', family: 'Minor' },
    ]);
    expect(s1.templateNote).toEqual({ text: 'Added 1 template.', refused: false });
  });

  it('adds a whole shape with the count note (row 9)', () => {
    const shape = ['10:12:15', '12:15:20', '15:20:24'].map(entry);
    const s1 = run(noMinor(), { type: 'templates/addLibrary', entries: shape });
    expect(s1.templates.slice(-3).map((t) => t.text)).toEqual(['10:12:15', '12:15:20', '15:20:24']);
    expect(s1.templateNote).toEqual({ text: 'Added 3 templates.', refused: false });
  });

  it('a duplicate is refused: the sentence in templateNote, the list unchanged (row 8)', () => {
    const s0 = initialState();
    const s1 = run(s0, { type: 'templates/addLibrary', entries: [entry('4:5:6')] });
    expect(s1.templates).toBe(s0.templates);
    expect(s1.templateNote).toEqual({
      text: 'Same notes as 4:5:6 already in your templates.',
      refused: true,
    });
  });

  it('at the cap it refuses all of it (row 9)', () => {
    const fill = Array.from({ length: MAX_TEMPLATES - 1 }, (_, i) => ({
      text: `${1000 + i}:${1001 + i}`,
    }));
    const s0 = run(initialState(), { type: 'templates/set', templates: fill });
    const shape = ['10:12:15', '12:15:20', '15:20:24'].map(entry);
    const s1 = run(s0, { type: 'templates/addLibrary', entries: shape });
    expect(s1.templates).toBe(s0.templates);
    expect(s1.templateNote?.text).toBe('Needs 3 free places; you have 1.');
    expect(s1.templateNote?.refused).toBe(true);
  });

  it('a folding entry is ADDED as written, taking one place, with the octave sentence (rows 13b, 13c)', () => {
    const s0 = initialState();
    const s1 = run(s0, { type: 'templates/addLibrary', entries: [entry('1:2:3')] });
    expect(s1.templateNote).toEqual({
      text: 'Added 1:2:3 (not used by the finder in this repeat: octave notes merge).',
      refused: false,
    });
    expect(s1.templates).toEqual([
      ...DEFAULT_TEMPLATES,
      { text: '1:2:3', name: 'Triunisonus', family: entry('1:2:3').family },
    ]);
    // the stored form keeps it unchanged
    const stored = JSON.parse(JSON.stringify({ templates: s1.templates })) as unknown;
    expect(sanitizeTemplates(stored)).toEqual(s1.templates);
    // adding it again is the duplicate refusal
    const s2 = run(s1, { type: 'templates/addLibrary', entries: [entry('1:2:3')] });
    expect(s2.templates).toBe(s1.templates);
    expect(s2.templateNote).toEqual({
      text: 'Same notes as 1:2:3 already in your templates.',
      refused: true,
    });
  });

  it('a folding entry still counts against the 64 places', () => {
    const fill = Array.from({ length: MAX_TEMPLATES }, (_, i) => ({
      text: `${1000 + i}:${1001 + i}`,
    }));
    const s0 = run(initialState(), { type: 'templates/set', templates: fill });
    const s1 = run(s0, { type: 'templates/addLibrary', entries: [entry('1:2:3')] });
    expect(s1.templates).toBe(s0.templates);
    expect(s1.templateNote?.text).toBe('Needs 1 free place; you have 0.');
  });

  it('the note ends with the next templates/set, and adding nothing changes nothing', () => {
    const s1 = run(initialState(), { type: 'templates/addLibrary', entries: [entry('4:5:6')] });
    expect(s1.templateNote).not.toBeNull();
    expect(run(s1, { type: 'templates/set', templates: [] }).templateNote).toBeNull();
    const s0 = initialState();
    expect(run(s0, { type: 'templates/addLibrary', entries: [] })).toBe(s0);
  });

  it('every usable entry, once added, survives the stored form unchanged (name, family, text)', () => {
    for (const e of entries.filter((x) => !x.folds)) {
      const added = run(run(initialState(), { type: 'templates/set', templates: [] }), {
        type: 'templates/addLibrary',
        entries: [e],
      }).templates;
      expect(added).toHaveLength(1);
      const stored = JSON.parse(JSON.stringify({ templates: added })) as unknown;
      expect(sanitizeTemplates(stored)).toEqual(added);
    }
  });
});
