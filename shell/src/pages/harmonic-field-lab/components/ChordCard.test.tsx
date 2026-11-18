/** M4: the chip's one tooltip (Pitches, Steps, a sentence per note, Appears at), the ring's own `chordChip` tooltip, the colored values. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NOTE_ERROR_WORD, type NoteErrorLine } from '../state/chordSort';
import { LAB_DEVELOPER_KEY, resetDeveloperOptionsCache } from '../state/developerOptions';
import { CardHintLines, ChordCard, fmtSteps, stepsValue, type ChordCardProps } from './ChordCard';
import { ValueList } from './ValueList';

const ups = [0, 315.6, 702];
const MINUS = String.fromCharCode(0x2212);
const NBSP = String.fromCharCode(0xa0);
/** A number and its unit are glued with a no-break space; the tests read plain spaces. */
const plain = (s: string | null | undefined) => (s ?? '').replaceAll(NBSP, ' ');

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ tooltipDelay: 0 }));
  resetDeveloperOptionsCache();
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});

const lines: NoteErrorLine[] = [
  { member: '13/11', ideal: '6/5', error: -26.4 },
  { member: '3/2', ideal: '3/2', error: 0 },
];

describe('CardHintLines', () => {
  it('Pitches, Steps, one sentence per note, then Appears at; the word Steps once, no Error line', () => {
    const { container } = render(
      <CardHintLines
        pitches="1/1  13/11  3/2"
        steps={fmtSteps([0, 1000, 1500])}
        errors={[0, -26.4, 0]}
        noteLines={lines}
        appearsAt={27}
      />
    );
    const rows = [...container.querySelectorAll('span[class*="hintLine"]')].map(
      (l) => l.textContent ?? ''
    );
    expect(rows).toEqual(['Pitches:1/1  13/11  3/2', 'Steps:1000.0, 500.0 c']);
    const notes = [...container.querySelectorAll('[data-testid="hint-note"]')].map((l) =>
      plain(l.textContent)
    );
    // the word between the error and its ideal is one constant
    expect(NOTE_ERROR_WORD).toBe('from');
    expect(notes).toEqual([`13/11 is ${MINUS}26.4 c ${NOTE_ERROR_WORD} 6/5`, '3/2 is exact']);
    expect(plain(container.querySelector('[data-testid="hint-appears"]')?.textContent)).toBe(
      'Appears at tolerance 27 c.'
    );
    expect(container.textContent?.match(/Steps/gi)).toHaveLength(1);
    expect(container.textContent).not.toContain('Error');
    // order in the DOM: Pitches, Steps, the notes, Appears at
    const all = [...container.querySelectorAll('[class*="hintLine"], [class*="hintNote"]')];
    expect(all).toHaveLength(5);
    expect(all[4]).toBe(container.querySelector('[data-testid="hint-appears"]'));
  });

  it('a positive error reads +6.4, an exact chord says it appears at any tolerance', () => {
    const { container } = render(
      <CardHintLines
        pitches="1/1  322.0 c"
        steps="steps 1 c"
        errors={[0, 6.4]}
        noteLines={[{ member: '322.0 c', ideal: '6/5', error: 6.4 }]}
        appearsAt={0}
      />
    );
    expect(plain(container.querySelector('[data-testid="hint-note"]')?.textContent)).toBe(
      '322.0 c is +6.4 c from 6/5'
    );
    expect(container.querySelector('[data-testid="hint-appears"]')?.textContent).toBe(
      'Appears at any tolerance.'
    );
  });

  it('a note under 0.05 c is exact; the sentence values take their own band', () => {
    const { container } = render(
      <CardHintLines
        pitches="1/1  6/5  3/2"
        steps="steps 1, 2 c"
        errors={[0, 0.04, -28.8]}
        noteLines={[
          { member: '6/5', ideal: '6/5', error: 0.04 },
          { member: '3/2', ideal: '3/2', error: -28.8 },
        ]}
        appearsAt={29}
      />
    );
    const notes = [...container.querySelectorAll('[data-testid="hint-note"]')];
    expect(plain(notes[0].textContent)).toBe('6/5 is exact');
    expect(plain(notes[1].textContent)).toBe(`3/2 is ${MINUS}28.8 c ${NOTE_ERROR_WORD} 3/2`);
    // member and error value of each line carry the band of that note, the ideal stays plain; 0.04 c is worded exact but is
    // still in band 1 (under 5 c), the same band the card gives it
    expect(
      [...notes[0].querySelectorAll('[data-sev]')].map((e) => e.getAttribute('data-sev'))
    ).toEqual(['1']);
    expect(
      [...notes[1].querySelectorAll('[data-sev]')].map((e) => e.getAttribute('data-sev'))
    ).toEqual(['3', '3']);
  });

  it('tints each pitch by its own band (root exact)', () => {
    const { container } = render(
      <CardHintLines pitches="1/1  6/5  3/2" steps="steps 1, 2 c" errors={[0, 6.4, -28.8]} />
    );
    const sev = [...container.querySelectorAll('[data-sev]')].map((e) =>
      e.getAttribute('data-sev')
    );
    expect(sev).toEqual(['0', '2', '3']);
  });

  it('every line is one line: Pitches, Steps, each note sentence and Appears at carry a nowrap class; a number keeps its c', () => {
    // a pentad: four non-root notes
    const five: NoteErrorLine[] = [
      { member: '5/4', ideal: '5/4', error: 0 },
      { member: '3/2', ideal: '3/2', error: 0 },
      { member: '7/4', ideal: '7/4', error: 0 },
      { member: '2250.5 c', ideal: '9/4', error: -12.3 },
    ];
    const { container } = render(
      <CardHintLines
        pitches="1/1  5/4  3/2  7/4  2250.5 c"
        steps={fmtSteps([0, 386.3, 702, 968.8, 2250.5])}
        errors={[0, 0, 0, 0, -12.3]}
        noteLines={five}
        appearsAt={13}
      />
    );
    const rows = [...container.querySelectorAll('[class*="hintLine"], [class*="hintNote"]')];
    expect(rows).toHaveLength(2 + 4 + 1);
    // the CSS source gives both classes `white-space: nowrap` (jsdom does not apply CSS modules)
    const css = readFileSync(join(__dirname, 'panels.module.css'), 'utf8');
    for (const cls of ['hintLine', 'hintNote']) {
      const rule = new RegExp(`\\.${cls} \\{[^}]*\\}`).exec(css)?.[0] ?? '';
      expect(rule, cls).toContain('white-space: nowrap');
    }
    // the bug the human saw (every word on its own line): `.valueList` is `display: block`, so a list inside a sentence must be
    // the inline variant, and that variant must be `display: inline`
    const lists = [...container.querySelectorAll('[data-testid="hint-note"] [class*="valueList"]')];
    expect(lists.length).toBeGreaterThan(0);
    for (const l of lists) {
      expect(l.className).toContain('valueListInline');
    }
    const inlineRule = /\.valueList\.valueListInline \{[^}]*\}/.exec(css)?.[0] ?? '';
    expect(inlineRule).toContain('display: inline;');
    // a number and its unit cannot split
    const text = container.textContent ?? '';
    expect(text).toContain(`2250.5${NBSP}c`);
    expect(text).toContain(`${MINUS}12.3${NBSP}c`);
    expect(text).toContain(`Appears at tolerance 13${NBSP}c.`);
  });

  it('a card with no error data has Pitches and Steps only', () => {
    const { container } = render(
      <CardHintLines pitches="0.0, 315.6, 702.0 c" steps={fmtSteps(ups)} />
    );
    expect(container.querySelectorAll('span[class*="hintLine"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="hint-note"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="hint-appears"]')).toBeNull();
    expect(container.querySelector('[data-sev]')).toBeNull();
  });
});

const baseCard = (extra: Partial<ChordCardProps> = {}): ChordCardProps => ({
  label: 'the plain aria label',
  title: 'minor triad',
  subtitle: '10:12:15 on 1/1',
  pitches: '1/1  13/11  3/2',
  steps: fmtSteps([0, 1000, 1500]),
  stat: <span>26.4 (13.2) c</span>,
  ring: { cents: [0, 1000, 1500], repC: 1200 },
  found: true,
  picked: false,
  ringTip: 'minor triad 10:12:15 on 1/1: notes 1/1 13/11 3/2.',
  ...extra,
});
const errorCard = baseCard({
  errors: [0, -26.4, 0],
  noteLines: lines,
  appearsAt: 27,
});

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

/** The text of the tooltip a region opens (rendered fresh, so no other tooltip can be left over). */
async function tipOf(card: ChordCardProps, region: (root: HTMLElement) => Element | null) {
  const { container, unmount } = render(<ChordCard {...card} />);
  const target = region(container);
  expect(target, 'region exists').not.toBeNull();
  fireEvent.mouseEnter(target as Element);
  await wait(50);
  const tips = screen.queryAllByRole('tooltip');
  const out = {
    count: tips.length,
    text: plain(tips[0]?.textContent),
    caps: [...(tips[0]?.querySelectorAll('kbd') ?? [])].map((k) => k.textContent),
  };
  unmount();
  return out;
}
const byId = (id: string) => (root: HTMLElement) => root.querySelector(`[data-testid="${id}"]`);
const ringOf = (root: HTMLElement) => root.querySelector('[class*="cardRing"]');

describe('ChordCard: one tooltip for every region except the ring', () => {
  it('a chip with error data shows the same body on the title, subtitle, pitches, steps and stat', async () => {
    const texts: string[] = [];
    for (const id of ['card-title', 'card-subtitle', 'card-pitches', 'card-steps', 'card-stat']) {
      const t = await tipOf(errorCard, byId(id));
      expect(t.count, id).toBe(1);
      texts.push(t.text);
    }
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).toContain(`13/11 is ${MINUS}26.4 c ${NOTE_ERROR_WORD} 6/5`);
    expect(texts[0]).toContain('3/2 is exact');
    expect(texts[0]).toContain('Appears at tolerance 27 c.');
    expect(texts[0]).toContain('Pitches');
    expect(texts[0]).toContain('Steps');
    // not the ring's glossary entry
    expect(texts[0]).not.toContain('Chord chip');
  });

  it('with the Developer Error line on, that line shows the same body too', async () => {
    const t = await tipOf({ ...errorCard, showErrors: true }, byId('card-errors'));
    expect(t.count).toBe(1);
    expect(t.text).toContain('Appears at tolerance 27 c.');
  });

  it('the ring tooltip: Chord chip, the SAME lines as the chip body first, then the help, keys and example; one bubble only', async () => {
    const t = await tipOf(errorCard, ringOf);
    expect(t.count).toBe(1);
    expect(t.text.startsWith('Chord chip')).toBe(true);
    // the chip's own lines come first (Pitches, Steps, a sentence per note, Appears at), then the glossary help
    const order = [
      t.text.indexOf('Pitches'),
      t.text.indexOf('Steps'),
      t.text.indexOf(`13/11 is ${MINUS}26.4 c ${NOTE_ERROR_WORD} 6/5`),
      t.text.indexOf('3/2 is exact'),
      t.text.indexOf('Appears at tolerance 27 c.'),
      t.text.indexOf('A chord the finder found in your subset.'),
      t.text.indexOf('Click'),
      t.text.indexOf('Example'),
    ];
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(t.text).toMatch(/Click.*hear it and keep it highlighted/);
    expect(t.text).toMatch(/Shift\+click.*make these notes the subset/);
    expect(t.text).toMatch(/hear its exact ratios there/);
    // the three hold keys appear as key caps
    expect(t.caps).toEqual(expect.arrayContaining(['1', '4', '5']));
    // the old one-sentence description is gone for a card that has the lines
    expect(t.text).not.toContain('notes 1/1 13/11 3/2.');
  });

  it('a card with no error data (dashed, CPS, Positional) shows the ring tooltip on its other regions too', async () => {
    const noData = baseCard({
      ringTip: 'Otonal chord 1:3:5: the notes that share 1 (3 notes).',
    });
    const ring = await tipOf(noData, ringOf);
    for (const id of ['card-title', 'card-subtitle', 'card-pitches', 'card-steps', 'card-stat']) {
      const t = await tipOf(noData, byId(id));
      expect(t.count, id).toBe(1);
      expect(t.text, id).toBe(ring.text);
    }
    expect(ring.text).toContain('Otonal chord 1:3:5');
    expect(ring.text.startsWith('Chord chip')).toBe(true);
    // a card with no per-note lines still shows Pitches and Steps first, then its own sentence, then the help
    expect(ring.text.indexOf('Pitches')).toBeLessThan(ring.text.indexOf('Otonal chord 1:3:5'));
    expect(ring.text.indexOf('Otonal chord 1:3:5')).toBeLessThan(
      ring.text.indexOf('A chord the finder found')
    );
  });

  it('the button itself has no tooltip of its own (only its regions); aria-label keeps the plain label', async () => {
    const { container, unmount } = render(<ChordCard {...errorCard} />);
    const button = container.querySelector('button') as HTMLElement;
    expect(button.getAttribute('aria-label')).toBe('the plain aria label');
    fireEvent.mouseEnter(button);
    await wait(50);
    expect(screen.queryAllByRole('tooltip')).toHaveLength(0);
    unmount();
  });
});

describe('helpers', () => {
  it('stepsValue drops only the leading word', () => {
    expect(stepsValue('steps 315.6, 386.3 c')).toBe('315.6, 386.3 c');
    expect(stepsValue('')).toBe('');
  });
  it('ValueList colors the n-th value by its SIGNED error (H-38); no errors leaves it plain', () => {
    const { container } = render(<ValueList text="1, 2, 3, 4 c" errors={[0, -30, 4.9, 15]} />);
    const vals = [...container.querySelectorAll('[data-value]')];
    expect(vals.map((e) => e.getAttribute('data-sev'))).toEqual(['0', '4', '1', '3']);
    expect(vals.map((e) => e.getAttribute('data-dir'))).toEqual([null, 'flat', 'sharp', 'sharp']);
    const plain = render(<ValueList text="1, 2 c" />);
    expect(plain.container.querySelector('[data-sev]')).toBeNull();
  });
});
