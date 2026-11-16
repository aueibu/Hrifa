/** Guards for the help entries (both forms) and the markup parser. */
import { describe, expect, it } from 'vitest';
import { SHORTCUTS, shortcutKey } from './audio/shortcuts';
import {
  LINE_GROUP_MAX,
  glueUnits,
  legacyBlocks,
  parseMarkup,
  plainText,
  sentenceLines,
  type Block,
} from './markup';
import { GLOSSARY, TIPS, tipKeys } from './texts';

const blockStrings = (b: Block): string[] =>
  b.kind === 'keys' ? b.rows.flatMap((r) => [r.key, r.does]) : [b.text];
const strings = (e: (typeof TIPS)[keyof typeof TIPS]) =>
  [...e.help, ...e.teaching].flatMap(blockStrings);

describe('markup parser', () => {
  it('turns **a** and *b* into bold and italic tokens', () => {
    expect(parseMarkup('**a** and *b*')).toEqual([
      { type: 'bold', text: 'a' },
      { type: 'text', text: ' and ' },
      { type: 'italic', text: 'b' },
    ]);
  });
  it('turns {key:name} into a key token', () => {
    expect(parseMarkup('press {key:holdField} now')).toEqual([
      { type: 'text', text: 'press ' },
      { type: 'key', name: 'holdField' },
      { type: 'text', text: ' now' },
    ]);
  });
  it('leaves unknown markup, stray asterisks and < as plain text', () => {
    for (const s of ['a < b', '<b>x</b>', '2 * 3 and 4 *', '{foo:bar}', '{key:}', '__x__']) {
      expect(parseMarkup(s)).toEqual([{ type: 'text', text: s }]);
    }
  });
  it('plainText drops the markup characters and resolves keys; unknown keys stay as written', () => {
    expect(plainText('**a** *b* {key:modePlayback} {key:nope}')).toBe('a b 0 {key:nope}');
    expect(shortcutKey('nope')).toBeUndefined();
    expect(shortcutKey('toString')).toBeUndefined();
  });
});

describe('help entries', () => {
  it('every `see` key exists (all entries, old and new form)', () => {
    const bad = tipKeys.flatMap((k) =>
      (TIPS[k].see ?? []).filter((s) => !(s in TIPS)).map((s) => `${k} -> ${s}`)
    );
    expect(bad).toEqual([]);
  });

  const converted = tipKeys.filter((k) => !TIPS[k].legacy);
  it('has the three converted entries', () => {
    expect(converted).toEqual(expect.arrayContaining(['playScale', 'holdToPlay', 'modes']));
  });

  it.each(converted)('new-form entry %s: length, example, markup', (k) => {
    const e = TIPS[k];
    const helpLen = e.help
      .flatMap(blockStrings)
      .map(plainText)
      .reduce((n, s) => n + s.length, 0);
    expect(helpLen).toBeLessThanOrEqual(600);
    expect(
      e.help.some((b) => b.kind === 'example'),
      `${k}: the help needs an Example`
    ).toBe(true);
    for (const s of strings(e)) {
      expect(s).not.toContain('<');
      for (const m of s.matchAll(/\{key:([^}]*)\}/g)) {
        expect(Object.keys(SHORTCUTS), `${k}: {key:${m[1]}}`).toContain(m[1]);
      }
    }
  });

  it('no entry names a key for the Parallel | Relative switch that disagrees with the table', () => {
    const want = SHORTCUTS.modePlayback;
    const re = /\b(?:the (\d) key|[Kk]ey (\d)\b|[Pp]ress (\d) to switch)/g;
    const bad: string[] = [];
    for (const k of tipKeys) {
      const texts = TIPS[k].legacy ? [TIPS[k].text] : strings(TIPS[k]).map(plainText);
      for (const s of texts) {
        if (!/Parallel/.test(s)) {
          continue;
        }
        for (const m of s.matchAll(re)) {
          if ((m[1] ?? m[2] ?? m[3]) !== want) {
            bad.push(`${k}: ${m[0]}`);
          }
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('modes names key 0 for the Parallel | Relative switch', () => {
    expect(TIPS.modes.text).toContain('Parallel | Relative (key 0)');
    expect(TIPS.modes.text).not.toMatch(/the 5 key/);
  });

  it('the glossary lists every entry once, new form included', () => {
    expect(GLOSSARY).toHaveLength(tipKeys.length);
    expect(TIPS.playScale.text).toContain('comes back down');
    expect(TIPS.modes.text).toMatch(/\+ means/);
  });
});

describe('layout rules for every entry (old and new form)', () => {
  it('no paragraph has an Example running inline: an example is its own block', () => {
    for (const k of tipKeys) {
      const e = TIPS[k];
      for (const b of [...e.help, ...e.teaching]) {
        if (b.kind === 'p') {
          expect(b.text, `${k}: an inline Example`).not.toMatch(/(^|\s)Example( [^:.]{1,40})?:\s/);
        }
      }
    }
  });

  it('legacyBlocks cuts a text at its Example into a paragraph and an example block', () => {
    expect(legacyBlocks('First. Second. Example: one. Two.')).toEqual([
      { kind: 'p', text: 'First. Second.' },
      { kind: 'example', text: 'one. Two.' },
    ]);
    expect(legacyBlocks('Plain text only.')).toEqual([{ kind: 'p', text: 'Plain text only.' }]);
    expect(legacyBlocks('Rule. Example in a 5-limit field: do x.')).toEqual([
      { kind: 'p', text: 'Rule.' },
      { kind: 'example', text: 'in a 5-limit field: do x.' },
    ]);
  });

  it('sentenceLines: no line of more than one sentence is longer than the limit', () => {
    for (const k of tipKeys) {
      for (const b of [...TIPS[k].help, ...TIPS[k].teaching]) {
        if (b.kind === 'keys') {
          continue;
        }
        for (const line of sentenceLines(b.text)) {
          const sentences = line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'({*{])/);
          if (sentences.length > 1) {
            expect(plainText(line).length, `${k}: ${line.slice(0, 40)}`).toBeLessThanOrEqual(
              LINE_GROUP_MAX
            );
          }
        }
      }
    }
    expect(sentenceLines('Aaa. Bbb. Ccc.', 10)).toEqual(['Aaa. Bbb.', 'Ccc.']);
    expect(sentenceLines('A very long single sentence stays whole.', 5)).toHaveLength(1);
  });
});

describe('units stay with their number', () => {
  it('glueUnits joins a number and c or Hz with a no-break space, and nothing else', () => {
    expect(glueUnits('21.5 c flat, 392.44 Hz')).toBe('21.5\u00a0c flat, 392.44\u00a0Hz');
    expect(glueUnits('a 5 chord, 3 cents, 2 of 7')).toBe('a 5 chord, 3 cents, 2 of 7');
  });
});
