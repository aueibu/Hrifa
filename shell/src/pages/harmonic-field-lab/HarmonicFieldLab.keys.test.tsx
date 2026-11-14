/** Keys and Modes panels: wrapped mode tiles, the big key view, Switch / Add, and the common-tone counts. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';

const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const count = () =>
  /(\d+) of (\d+) notes selected/.exec(ring().getAttribute('aria-label')!)!.slice(1).map(Number);
const noteDots = () => within(ring()).getAllByRole('button');
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
// vitest runs from the shell root
const panelsCss = readFileSync(
  resolve(process.cwd(), 'src/pages/harmonic-field-lab/components/panels.module.css'),
  'utf8'
);

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

/** 12-EDO with the C major scale selected (steps 0 2 4 5 7 9 11), the Keys panel open. */
function openC12Keys() {
  render(<HarmonicFieldLabPage />);
  type(screen.getByRole('combobox', { name: 'Preset' }), '12-EDO');
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  MAJOR.forEach((i) => fireEvent.click(noteDots()[i]));
  fireEvent.click(within(rail()).getByRole('tab', { name: /^Keys/ }));
}
const rings = () => within(screen.getByRole('list', { name: 'Keys' })).getAllByRole('listitem');
const ringBtn = (i: number) => within(rings()[i]).getByRole('button');
const summary = () => screen.getByTestId('key-summary').textContent;
const SAME = '7 common · +0 added · −0 dropped · 0 missing';
const G = '6 common · +1 added · −1 dropped · 0 missing';

describe('Modes panel: wrapped tiles keep their columns', () => {
  it('each row is a label column plus one tile area holding every degree; the header has its own tile area', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Modes/ }));
    const rows = screen.getAllByTestId('mode-row');
    expect(rows).toHaveLength(8);
    const headTiles = within(screen.getByTestId('mode-head')).getByTestId('mode-tiles');
    expect(headTiles.className).toMatch(/modeTiles/);
    expect(headTiles.children).toHaveLength(8);
    for (const row of rows) {
      // three columns: label, tiles, total; the tiles are never siblings of the label
      expect(row.children).toHaveLength(3);
      expect(row.children[0].className).toMatch(/modeLabelCol/);
      expect(row.children[1].className).toMatch(/modeTiles/);
      expect(row.children[1].children).toHaveLength(8);
      expect(row.children[2].className).toMatch(/modeTotalCol/);
      expect(row.querySelectorAll(':scope > [class*="heatCell"]')).toHaveLength(0);
    }
  });

  it('the header and every row use the same wrapping tile grid (checked in the stylesheet)', () => {
    const tiles = /\.modeTiles \{([^}]*)\}/.exec(panelsCss)![1];
    expect(tiles).toMatch(/display:\s*grid/);
    expect(tiles).toMatch(/grid-template-columns:\s*repeat\(auto-fill/);
    // the row and the header share one three-column template: label | tiles | total
    const line = /\.modeLine \{([^}]*)\}/.exec(panelsCss)![1];
    expect(line).toMatch(/grid-template-columns:\s*[\d.]+rem minmax\(0, 1fr\) [\d.]+rem/);
  });

  it('clicking a row still makes that mode current', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Modes/ }));
    fireEvent.click(screen.getAllByTestId('mode-row')[2]);
    expect(screen.getAllByTestId('mode-row')[2]).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Keys panel: common tones and the big view (12-EDO C major)', () => {
  it('shows x|y under each ring: G major 6|7, F# major 2|7, C major 7|7', () => {
    openC12Keys();
    expect(count()).toEqual([7, 12]);
    expect(within(rings()[7]).getByTestId('common-tones')).toHaveTextContent('6|7');
    expect(within(rings()[6]).getByTestId('common-tones')).toHaveTextContent('2|7');
    expect(within(rings()[0]).getByTestId('common-tones')).toHaveTextContent('7|7');
    expect(screen.getByTestId('key-summary').textContent).not.toMatch(/\d\/\d/);
  });

  it('starts on the current key (everything common); hover shows another key and leaving goes back', () => {
    openC12Keys();
    expect(summary()).toBe(SAME);
    fireEvent.mouseEnter(ringBtn(7));
    expect(summary()).toBe(G);
    const big = screen.getByTestId('big-key-ring');
    expect(big.querySelectorAll('[data-kind="common"]')).toHaveLength(6);
    expect(big.querySelectorAll('[data-kind="added"]')).toHaveLength(1);
    expect(big.querySelectorAll('[data-kind="dropped"]')).toHaveLength(1);
    // common notes are plain filled dots: no glyph and no strike
    expect(big.querySelector('[data-kind="common"]')!.querySelector('path')).toBeNull();
    fireEvent.mouseLeave(ringBtn(7));
    expect(summary()).toBe(SAME);
  });

  it('draws missing degrees as dashed circles and the four groups with different shapes', () => {
    render(<HarmonicFieldLabPage />);
    // the example field: two notes selected, the 9/8 key has one note the field lacks
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(noteDots()[0]);
    fireEvent.click(noteDots()[2]);
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Keys/ }));
    const r = within(screen.getByRole('list', { name: 'Keys' })).getByRole('button', {
      name: /^Key on 9\/8: 1 scale note/,
    });
    fireEvent.mouseEnter(r);
    const big = screen.getByTestId('big-key-ring');
    expect(big.querySelectorAll('circle[data-kind="missing"]')).toHaveLength(1);
    expect(screen.getByTestId('key-summary')).toHaveTextContent(/0 common .* 1 missing/);
    // shapes: a plus glyph is only on the added dot, a strike only on the dropped dot
    const kinds = (k: string) => big.querySelector(`[data-kind="${k}"]`);
    expect(kinds('added')?.querySelector('path[class*="bigKeyGlyph"]')).not.toBeNull();
    expect(kinds('dropped')?.querySelector('path[class*="bigKeyStrike"]')).not.toBeNull();
  });

  it('click = Switch: the key becomes the subset and stays shown', () => {
    openC12Keys();
    fireEvent.click(ringBtn(7));
    expect(count()).toEqual([7, 12]);
    expect(noteDots()[6]).toHaveAccessibleName(/in subset/); // F# joined
    expect(noteDots()[5]).not.toHaveAccessibleName(/in subset/); // F left
    fireEvent.mouseLeave(ringBtn(7));
    expect(summary()).toBe(SAME);
    expect(screen.getByText(/key on .* \(last clicked\)/)).toBeInTheDocument();
  });

  it('Shift+click = Add: the key notes join the subset, the mode root is unchanged', () => {
    openC12Keys();
    fireEvent.click(ringBtn(7), { shiftKey: true });
    expect(count()).toEqual([8, 12]);
    for (const i of [...MAJOR, 6]) {
      expect(noteDots()[i]).toHaveAccessibleName(/in subset/);
    }
  });

  it('Ctrl+click previews without changing the subset, and the big view keeps that key until the subset changes', () => {
    openC12Keys();
    fireEvent.click(ringBtn(7), { ctrlKey: true });
    expect(count()).toEqual([7, 12]);
    fireEvent.mouseLeave(ringBtn(7));
    expect(summary()).toBe(G); // last clicked
    fireEvent.click(noteDots()[1]); // any other change of the subset
    expect(summary()).toMatch(/^8 common · \+0 added · −0 dropped/); // back on the current key
    expect(screen.getByText(/\(current key\)/)).toBeInTheDocument();
  });

  it('a new preset, mode, tab or Select all also resets to the current key', () => {
    openC12Keys();
    fireEvent.click(ringBtn(7), { ctrlKey: true });
    fireEvent.mouseLeave(ringBtn(7));
    expect(summary()).toBe(G);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText(/\(current key\)/)).toBeInTheDocument();
  });

  it('the Switch and Add buttons act on the shown key and are off when they would change nothing', () => {
    openC12Keys();
    const sw = () => screen.getByRole('button', { name: 'Switch to key' });
    const add = () => screen.getByRole('button', { name: 'Add key' });
    expect(sw()).toBeDisabled();
    expect(add()).toBeDisabled();
    fireEvent.click(ringBtn(7), { ctrlKey: true });
    fireEvent.mouseLeave(ringBtn(7));
    expect(sw()).toBeEnabled();
    expect(add()).toBeEnabled();
    fireEvent.click(add());
    expect(count()).toEqual([8, 12]);
    expect(noteDots()[6]).toHaveAccessibleName(/in subset/);
    expect(noteDots()[5]).toHaveAccessibleName(/in subset/);
  });

  it('Switch to key from the button drops the notes the key does not use', () => {
    openC12Keys();
    fireEvent.click(ringBtn(7), { ctrlKey: true });
    fireEvent.mouseLeave(ringBtn(7));
    fireEvent.click(screen.getByRole('button', { name: 'Switch to key' }));
    expect(count()).toEqual([7, 12]);
    expect(noteDots()[6]).toHaveAccessibleName(/in subset/);
    expect(noteDots()[5]).not.toHaveAccessibleName(/in subset/);
    expect(screen.getByRole('button', { name: 'Switch to key' })).toBeDisabled();
    expect(summary()).toBe(SAME);
  });

  it('hovering a note in the big view lights it in every view; sounding notes are lit there too', () => {
    openC12Keys();
    const big = screen.getByTestId('big-key-ring');
    fireEvent.mouseEnter(big.querySelector('[data-note="4"]')!);
    expect(ring().querySelectorAll('circle[class*="selRing"]')).toHaveLength(1);
    fireEvent.mouseLeave(big.querySelector('[data-note="4"]')!);
    expect(ring().querySelectorAll('circle[class*="selRing"]')).toHaveLength(0);
    // computer key z plays the first subset note
    fireEvent.keyDown(document.body, { key: 'z' });
    expect(big.querySelectorAll('[data-sounding="true"]').length).toBeGreaterThan(0);
    expect(big.querySelectorAll('circle[class*="bigKeyLit"]').length).toBeGreaterThan(0);
  });

  it('every new label and control has a tooltip target', () => {
    openC12Keys();
    const keysPanel = screen.getByRole('list', { name: 'Keys' }).closest('div')!;
    const tipks = [...keysPanel.querySelectorAll('[data-tipk]')].map((e) =>
      e.getAttribute('data-tipk')
    );
    expect(tipks).toEqual(expect.arrayContaining(['keyView', 'keyMarks', 'keySwitch', 'keyAdd']));
    expect(tipks).toContain('keyRings');
    expect(tipks).toContain('commonTones');
  });
});
