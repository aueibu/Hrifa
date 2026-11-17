/**
 * M6b: the generator column's new controls, rendered inside `LabProvider` without the whole page: the Genus shape of the
 * Lattice method (the box for n, its summary and refusals), the Odd limit box in the Field settings popover, the gear's
 * filter state and tooltip line, and the `Odd limit` warning styling. jsdom applies no CSS module, so how the gear LOOKS
 * (accent icon and border), whether the summary wraps and where the box sits on screen are checked in the CSS source or left
 * to the human.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GENUS_HINT, fmtRatio } from '../../../lib/harmonic-field';
import type { Lab } from '../state/context';
import { LAB_DEVELOPER_KEY, resetDeveloperOptionsCache } from '../state/developerOptions';
import { defaultGen, type GenSpec } from '../state/generate';
import { emptyLibrary, saveUserPreset } from '../state/generatorLibrary';
import { LabProvider } from '../state/LabProvider';
import { libraryToStored } from '../state/libraryStore';
import { KEY_GENERATORS, KEY_TABS } from '../state/persist';
import { pickPreset } from '../testUtils';
import { GeneratorColumn } from './GeneratorColumn';
import { useLab } from './ui';

const css = (file: string) => readFileSync(join(__dirname, file), 'utf8');

let lab: Lab;
/** Shows the active tab's field and lets a test reach the dispatch. */
function Probe() {
  lab = useLab();
  const { tab } = lab;
  return (
    <>
      <span data-testid="ratios">{tab.field.map(fmtRatio).join(' ')}</span>
      <span data-testid="err">{tab.err}</span>
    </>
  );
}

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
const ratios = () => screen.getByTestId('ratios').textContent;
const HARMONICS = '1/1 9/8 5/4 11/8 3/2 13/8 7/4 15/8';
const GENUS_45 = '1/1 9/8 5/4 45/32 3/2 15/8';

function mount() {
  return render(
    <LabProvider>
      <GeneratorColumn />
      <Probe />
    </LabProvider>
  );
}
const gear = () => screen.getByRole('button', { name: 'Field settings' });
const openGear = () => {
  if (!screen.queryByRole('group', { name: 'Prime filter' })) {
    fireEvent.click(gear());
  }
};
const oddBox = () => {
  openGear();
  return screen.getByRole('textbox', { name: 'Odd limit' });
};
const typeInto = async (box: HTMLElement, text: string) => {
  fireEvent.change(box, { target: { value: text } });
  await wait(200);
};
const pickLattice = () => fireEvent.click(screen.getByRole('radio', { name: 'Latt' }));
const pickShape = (v: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: 'Shape' }), { target: { value: v } });
const genusBox = () => screen.getByRole('textbox', { name: 'Number n' });
const axisGenerator = () =>
  (screen.getByRole('textbox', { name: 'Axis 1 generator' }) as HTMLInputElement).value;
const chip = (p: string) =>
  within(screen.getByRole('group', { name: 'Prime filter' })).getByRole('button', { name: p });
const tooltipText = () =>
  screen
    .queryAllByRole('tooltip')
    .map((t) => t.textContent ?? '')
    .join(' | ')
    .replaceAll(String.fromCharCode(0xa0), ' ');
// a tooltip gives way to one nested inside it while that one is hovered or focused: leave any box in the popover first
const hoverGear = () => {
  if (document.activeElement instanceof HTMLElement) {
    fireEvent.blur(document.activeElement);
  }
  fireEvent.blur(screen.queryByRole('textbox', { name: 'Odd limit' }) ?? document.body);
  fireEvent.mouseEnter(gear().closest('[data-tipk]') as HTMLElement);
};

beforeEach(() => {
  if (!('fonts' in document)) {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { addEventListener: () => undefined, removeEventListener: () => undefined },
    });
  }
  window.localStorage.clear();
  window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ tooltipDelay: 0 }));
  resetDeveloperOptionsCache();
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});

describe('the Genus shape', () => {
  it('is a third choice of the Shape control; picking it replaces the axes with the one box for n', () => {
    mount();
    pickLattice();
    const shape = screen.getByRole('combobox', { name: 'Shape' });
    expect(
      within(shape)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Box (count × count × ...)', 'Diamond (within N steps)', 'Genus (Euler-Fokker)']);
    expect(screen.getByRole('textbox', { name: 'Axis 1 generator' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Number n' })).toBeNull();
    pickShape('genus');
    expect(screen.queryByRole('textbox', { name: 'Axis 1 generator' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Axis 2 on' })).toBeNull();
    expect(genusBox()).toBeInTheDocument();
  });

  it('typing 45 shows 3^2 x 5, 6 notes and builds the six notes', async () => {
    mount();
    pickLattice();
    pickShape('genus');
    await typeInto(genusBox(), '105');
    expect(screen.getByTestId('genus-summary')).toHaveTextContent('3 x 5 x 7, 8 notes');
    await typeInto(genusBox(), '45');
    expect(screen.getByTestId('genus-summary')).toHaveTextContent('3^2 x 5, 6 notes');
    expect(ratios()).toBe(GENUS_45);
    expect(screen.queryByTestId('genus-refusal')).toBeNull();
  });

  it('text that is not a number shows the plain sentence under the box and the field stays as it was', async () => {
    mount();
    pickLattice();
    pickShape('genus');
    await typeInto(genusBox(), '45');
    for (const bad of ['abc', '0', '-5', '3.5', '']) {
      await typeInto(genusBox(), bad);
      expect(screen.getByTestId('genus-refusal')).toHaveTextContent(GENUS_HINT);
      expect(screen.getByTestId('genus-refusal')).toHaveAttribute('data-kind', 'err');
      expect(screen.queryByTestId('genus-summary')).toBeNull();
      expect(ratios()).toBe(GENUS_45);
      // the inline sentence only: no failure banner besides it
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    }
    await typeInto(genusBox(), '3^2*5');
    expect(screen.queryByTestId('genus-refusal')).toBeNull();
    expect(ratios()).toBe(GENUS_45);
  });

  it('a prime above 89 and a genus over the note limit are refused in plain words', async () => {
    mount();
    pickLattice();
    pickShape('genus');
    await typeInto(genusBox(), '45');
    await typeInto(genusBox(), '101');
    expect(screen.getByTestId('genus-refusal')).toHaveTextContent(/largest prime allowed/);
    await typeInto(genusBox(), '3^12*5^12*7^12');
    expect(screen.getByTestId('genus-refusal')).toHaveTextContent(
      'This genus has 2197 notes, the limit is 2048.'
    );
    expect(ratios()).toBe(GENUS_45);
  });

  it('3 3 5 is the same number as 3^2*5 and as 45', async () => {
    mount();
    pickLattice();
    pickShape('genus');
    await typeInto(genusBox(), '105');
    expect(ratios()).not.toBe(GENUS_45);
    await typeInto(genusBox(), '3 3 5');
    expect(screen.getByTestId('genus-summary')).toHaveTextContent('3^2 x 5, 6 notes');
    expect(ratios()).toBe(GENUS_45);
    expect(lab.tab.gen.genusN).toBe('45');
  });

  it('switching back to Box restores the axes as they were; the number is kept for the next visit', async () => {
    mount();
    pickLattice();
    const before = ratios();
    const axisG = axisGenerator();
    pickShape('genus');
    await typeInto(genusBox(), '45');
    expect(ratios()).toBe(GENUS_45);
    pickShape('box');
    expect(screen.queryByRole('textbox', { name: 'Number n' })).toBeNull();
    expect(axisGenerator()).toBe(axisG);
    expect(ratios()).toBe(before);
    pickShape('genus');
    expect((genusBox() as HTMLInputElement).value).toBe('45');
    expect(ratios()).toBe(GENUS_45);
  });

  it('a saved Genus preset opens with its number in the box', async () => {
    const gen: GenSpec = { ...defaultGen(), method: 'lattice', shape: 'genus', genusN: '45' };
    const lib = saveUserPreset(emptyLibrary(), { name: 'Genus 45', folder: '', gen }).lib;
    window.localStorage.setItem(KEY_GENERATORS, JSON.stringify(libraryToStored(lib)));
    mount();
    expect(screen.queryByRole('textbox', { name: 'Number n' })).toBeNull();
    await pickPreset('Genus 45');
    expect((genusBox() as HTMLInputElement).value).toBe('45');
    expect(screen.getByTestId('genus-summary')).toHaveTextContent('3^2 x 5, 6 notes');
    expect(ratios()).toBe(GENUS_45);
  });

  it('the number box carries the genus tooltip', () => {
    mount();
    pickLattice();
    pickShape('genus');
    fireEvent.mouseEnter(genusBox().closest('[data-tipk]') as HTMLElement);
    expect(tooltipText()).toContain('Genus (Euler-Fokker)');
    expect(tooltipText()).toContain('45 divides by 1, 3, 5, 9, 15 and 45');
  });
});

describe('the Odd limit box in the Field settings popover', () => {
  it('sits under the prime chips and above Repeat interval', () => {
    mount();
    openGear();
    const chips = screen.getByRole('group', { name: 'Prime filter' });
    const odd = oddBox();
    const repeat = screen.getByRole('textbox', { name: 'Repeat interval' });
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(chips, odd)).toBe(true);
    expect(follows(odd, repeat)).toBe(true);
  });

  it('typing 9 drops the notes over 9; clearing the box brings them all back', async () => {
    mount();
    expect(ratios()).toBe(HARMONICS);
    await typeInto(oddBox(), '9');
    expect(ratios()).toBe('1/1 9/8 5/4 3/2 7/4');
    expect(lab.tab.gen.oddLimit).toBe(9);
    await typeInto(oddBox(), '');
    expect(ratios()).toBe(HARMONICS);
    expect(lab.tab.gen.oddLimit).toBeUndefined();
  });

  it('applies to every method (a Genus field too)', async () => {
    mount();
    pickLattice();
    pickShape('genus');
    await typeInto(genusBox(), '45');
    await typeInto(oddBox(), '9');
    expect(ratios()).toBe('1/1 9/8 5/4 3/2');
  });

  it('is stored with the tab and read back after a reload', async () => {
    const first = mount();
    await typeInto(oddBox(), '9');
    const stored = JSON.parse(window.localStorage.getItem(KEY_TABS) ?? '{}') as {
      tabs?: { snap?: { oddLimit?: number } }[];
    };
    expect(JSON.stringify(stored)).toContain('"oddLimit":9');
    first.unmount();
    mount();
    expect(ratios()).toBe('1/1 9/8 5/4 3/2 7/4');
    expect((oddBox() as HTMLInputElement).value).toBe('odd ≤ 9');
    expect(gear()).toHaveAttribute('data-filtering', 'true');
  });

  it('a limit that empties the field is a note, not a failure', async () => {
    mount();
    // one lattice note, 1024/729: 1/1 is not in the field, so a limit of 3 leaves nothing
    act(() =>
      lab.dispatch({
        type: 'gen/patch',
        patch: {
          method: 'lattice',
          shape: 'box',
          axes: [
            { on: true, g: '9/8', n: 1, ctr: 3 },
            { on: false, g: '5/4', n: 3, ctr: 1 },
            { on: false, g: '7/4', n: 3, ctr: 1 },
          ],
        },
      })
    );
    expect(ratios()).toBe('1024/729');
    await typeInto(oddBox(), '3');
    expect(ratios()).toBe('');
    const msg = screen.getByRole('status');
    expect(msg).toHaveTextContent('Odd limit 3 leaves no notes.');
    expect(msg).toHaveAttribute('data-kind', 'warn');
    expect(msg).toHaveAttribute('role', 'status');
    // a real failure is still one
    act(() => lab.dispatch({ type: 'gen/patch', patch: { rep: 'nonsense' } }));
    expect(screen.getByTestId('err').textContent).not.toBe('');
    expect(screen.getByRole('alert')).toHaveAttribute('data-kind', 'err');
  });
});

describe('the gear', () => {
  it('with no filter it is plain: no data flag, no description, no tooltip line', () => {
    mount();
    expect(gear()).not.toHaveAttribute('data-filtering');
    expect(gear()).not.toHaveAttribute('aria-description');
    hoverGear();
    expect(tooltipText()).toContain('Field settings');
    expect(tooltipText()).not.toContain('Filtering');
  });

  it('with primes off it is marked and the tooltip names them first', () => {
    mount();
    openGear();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(chip('3'));
    fireEvent.click(chip('5'));
    expect(gear()).toHaveAttribute('data-filtering', 'true');
    expect(gear()).toHaveAttribute('aria-description', 'Filtering: primes 2 3 5');
    expect(gear()).toHaveAttribute('aria-label', 'Field settings');
    hoverGear();
    const t = tooltipText();
    expect(t).toContain('Filtering: primes 2 3 5');
    // the dynamic line comes before the help text
    expect(t.indexOf('Filtering: primes 2 3 5')).toBeLessThan(t.indexOf('Opens a small popover'));
  });

  it('with an odd limit only', async () => {
    mount();
    await typeInto(oddBox(), '9');
    expect(gear()).toHaveAttribute('data-filtering', 'true');
    expect(gear()).toHaveAttribute('aria-description', 'Filtering: odd limit 9');
    hoverGear();
    expect(tooltipText()).toContain('Filtering: odd limit 9');
  });

  it('with both, and plain again once both are off', async () => {
    mount();
    openGear();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    fireEvent.click(chip('3'));
    fireEvent.click(chip('5'));
    await typeInto(oddBox(), '9');
    expect(gear()).toHaveAttribute('aria-description', 'Filtering: primes 2 3 5, odd limit 9');
    hoverGear();
    expect(tooltipText()).toContain('Filtering: primes 2 3 5, odd limit 9');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await typeInto(oddBox(), '');
    expect(gear()).not.toHaveAttribute('data-filtering');
    expect(gear()).not.toHaveAttribute('aria-description');
  });

  it('the accent look is in the CSS source: icon and border take --accent, hover keeps it', () => {
    const source = css('lab.module.css');
    const block = /\.gearBtn\[data-filtering='true'\][^{]*\{[^}]*\}/.exec(source)?.[0] ?? '';
    expect(block).toContain('color: var(--accent)');
    expect(block).toContain('border-color: var(--accent)');
    expect(source).toMatch(/\.gearBtn\[data-filtering='true'\]:hover/);
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).toMatch(/\.paramNoteWrap \{[^}]*white-space: normal/);
  });
});
