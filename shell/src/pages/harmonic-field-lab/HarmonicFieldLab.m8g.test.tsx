/** M8g page tests: hover 4/5 arms the Sketch without moving its root (c), the persistent top, Collapse all | Expand all and the ladder window (e, f, g). */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset, ungroupShapes } from './testUtils';

vi.setConfig({ testTimeout: 30_000 });

const sketch = () => screen.getByRole('group', { name: 'Sketch a chord' });
const template = () =>
  within(sketch()).getByRole<HTMLSelectElement>('combobox', { name: 'Sketch template' });
const rootText = () => within(sketch()).getByText(/^root/).textContent;
const ladder = () => screen.getByRole('group', { name: 'Tolerance ladder' });
const EDO_MAJOR = /^major triad 4:5:6 on (1\/1|0\.0 c)/i;

beforeEach(() => {
  window.localStorage.clear();
  ungroupShapes();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('M8g Chords panel', () => {
  it('c: hold 4 / 5 on a ratio chip and a positional row arms the Sketch; its root stays', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.change(template(), { target: { value: '10:12:15' } });
    const root = rootText();
    const chip = screen.getAllByRole('button', { name: EDO_MAJOR })[0];
    fireEvent.mouseEnter(chip);
    fireEvent.keyDown(window, { key: '4' });
    fireEvent.keyUp(window, { key: '4' });
    expect(template().value).toBe('4:5:6');
    expect(rootText()).toBe(root);
    fireEvent.mouseLeave(chip);
    fireEvent.change(template(), { target: { value: '10:12:15' } });
    fireEvent.mouseEnter(chip);
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.keyUp(window, { key: '5' });
    expect(template().value).toBe('4:5:6');
    fireEvent.mouseLeave(chip);
    // a positional row (the pattern 2-2 on degree 3): the Sketch takes the pattern, the root stays
    const row = screen.getAllByRole('button', { name: /^2-2 on 3,/ })[0];
    fireEvent.mouseEnter(row);
    fireEvent.keyDown(window, { key: '4' });
    fireEvent.keyUp(window, { key: '4' });
    expect(template().value).toBe('pos:2-2');
    expect(rootText()).toBe(root);
    fireEvent.keyUp(window, { key: '4' });
    fireEvent.mouseLeave(row);
    // hold 5 on a positional row arms its pattern too
    fireEvent.change(template(), { target: { value: '10:12:15' } });
    fireEvent.mouseEnter(row);
    fireEvent.keyDown(window, { key: '5' });
    fireEvent.keyUp(window, { key: '5' });
    expect(template().value).toBe('pos:2-2');
    expect(rootText()).toBe(root);
    fireEvent.mouseLeave(row);
    // the Sketch tiles: a field note is data-sev 0 (solid blue, cyan wash); an offset has its own severity
    const tiles = within(sketch()).getAllByRole('listitem');
    expect(tiles.length).toBeGreaterThan(1);
    tiles.forEach((t) => {
      if (t.getAttribute('data-found') === 'true') {
        expect(t.getAttribute('data-sev')).toBe('0');
      } else if (/nearest field note/.test(t.getAttribute('aria-label') ?? '')) {
        expect(Number(t.getAttribute('data-sev'))).toBeGreaterThan(0);
      }
    });
    // hold 4 on a CPS chip arms its template and leaves the root
    await pickPreset('Hexany (1 3 5 7, choose 2)');
    fireEvent.change(template(), { target: { value: '10:12:15' } });
    const cpsRoot = rootText();
    const cps = within(screen.getByRole('region', { name: 'Chords inside this CPS' })).getAllByRole(
      'button',
      { name: /chord / }
    )[0];
    fireEvent.mouseEnter(cps);
    fireEvent.keyDown(window, { key: '4' });
    fireEvent.keyUp(window, { key: '4' });
    expect(template().value).not.toBe('10:12:15');
    expect(rootText()).toBe(cpsRoot);
    fireEvent.mouseLeave(cps);
  });

  it('e, f, g: the Sketch and ladder sit in the persistent top; Collapse all / Expand all; the ladder shows a window', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const top = screen.getByTestId('chords-top');
    expect(top).toContainElement(sketch());
    expect(top).toContainElement(ladder());
    const folds = () => [...document.querySelectorAll<HTMLElement>('[data-fold] button')];
    expect(folds().length).toBeGreaterThan(3);
    expect(folds().every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all sections' }));
    expect(folds().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    expect(folds().length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Expand all sections' }));
    expect(folds().every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
    // g: at most 7 tolerance tiles plus a +n tile at each edge; clicking +n picks the nearest hidden tolerance
    const tiles = () => within(ladder()).getAllByRole('button');
    const rungs = () =>
      tiles().filter((b) => b.getAttribute('aria-label')?.startsWith('Tolerance'));
    expect(rungs().length).toBeLessThanOrEqual(7);
    const more = within(ladder()).queryByRole('button', { name: /more tolerances above/ });
    expect(more).not.toBeNull();
    const before = screen.getByRole('button', { name: 'Raise tolerance' });
    expect(before).toBeInTheDocument();
    const on = () => rungs().find((b) => b.getAttribute('data-on') === 'true')?.textContent;
    const was = on();
    fireEvent.click(more as HTMLElement);
    expect(on()).not.toBe(was);
  });
});
