/** M3: dynamic tooltips (`Hint`) replace the native `title`s: order of the blocks, the Developer on/off, a disabled button, no `nativeTitle(` left. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { LAB_DEVELOPER_KEY, resetDeveloperOptionsCache } from './state/developerOptions';
import { KEY_CHORDSHELF } from './state/persist';

vi.setConfig({ testTimeout: 15_000 });

const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
const setOptions = (o: object) =>
  window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ tooltipDelay: 0, ...o }));

beforeEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});

describe('dynamic tooltips', () => {
  const openKeys = () => fireEvent.click(within(rail()).getByRole('tab', { name: /Keys/ }));
  const ring = () =>
    within(screen.getByRole('list', { name: 'Keys' })).getAllByRole('button', {
      name: /^Key on /,
    })[0];

  it('S5: a key ring shows the term, the dynamic line, the help paragraph, then the Keys list', async () => {
    setOptions({});
    render(<HarmonicFieldLabPage />);
    openKeys();
    fireEvent.mouseEnter(ring());
    await wait(50);
    const tip = screen.getByRole('tooltip');
    const text = tip.textContent ?? '';
    const help = text.indexOf('A scale from one root, drawn as a ring of its notes.');
    const dyn = text.search(/\d+ of the subset's \d+ notes are common to this key\./);
    const keys = text.indexOf('Keys:');
    expect(text.startsWith('Key rings')).toBe(true);
    expect(help).toBeGreaterThan(0);
    expect(dyn).toBeGreaterThan(0);
    expect(help).toBeGreaterThan(dyn);
    expect(keys).toBeGreaterThan(help);
    const example = text.indexOf('only the 1/1 ring has no crosses');
    expect(example).toBeGreaterThan(keys);
    expect(text.indexOf('as a scale for as long as you hold it')).toBeGreaterThan(keys);
    expect(text).toMatch(/Shift\+click.*add its notes to the subset/);
    expect(ring().getAttribute('title')).toBeNull();
  });

  it('with the Tooltips option off no tooltip shows on a converted site', async () => {
    setOptions({ tooltips: false });
    render(<HarmonicFieldLabPage />);
    fireEvent.mouseEnter(screen.getAllByRole('tab')[0]);
    openKeys();
    fireEvent.mouseEnter(ring());
    await wait(50);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('with Tooltips on, a tab shows its styled hint', async () => {
    setOptions({});
    render(<HarmonicFieldLabPage />);
    fireEvent.mouseEnter(
      within(screen.getByRole('tablist', { name: 'Tunings' })).getAllByRole('tab')[0]
    );
    await wait(50);
    expect(
      screen
        .getAllByRole('tooltip')
        .some((t) => /Alt\+1: double-click to rename/.test(t.textContent ?? ''))
    ).toBe(true);
  });

  it('a disabled Reload button still shows its reason on hover (a host span takes the pointer)', async () => {
    setOptions({});
    // a shelf chord with no stored source (as one stashed from a tab with no notes): Reload is disabled
    window.localStorage.setItem(
      KEY_CHORDSHELF,
      JSON.stringify({
        version: 1,
        next: 2,
        chords: [
          {
            id: 'c1',
            name: 'Chord 1',
            pitches: [{ c: 0 }, { c: 386.3 }, { c: 702 }],
            template: null,
            rootDeg: null,
          },
        ],
      })
    );
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Shelf/ }));
    const reload = screen.getByRole('button', { name: /^Reload .* as a new tab$/ });
    expect(reload).toBeDisabled();
    fireEvent.mouseEnter(reload.parentElement as HTMLElement);
    await wait(50);
    expect(screen.getByRole('tooltip').textContent).toMatch(
      /no stored source, so it cannot be reloaded/
    );
    // the host does not change layout, and the button takes no pointer so the host does
    const css = readFileSync(join(__dirname, 'components/panels.module.css'), 'utf8');
    expect(css).toMatch(/\.hintHost\s*\{\s*display:\s*inline-flex;\s*\}/);
    expect(css).toMatch(/\.hintHost > :disabled\s*\{\s*pointer-events:\s*none;\s*\}/);
  });
});

describe('no native title helper left', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
    );
  it('nothing under components/ calls nativeTitle( or useNativeTitle', () => {
    const files = walk(join(__dirname, 'components')).filter((f) => /\.tsx?$/.test(f));
    const hits = files.filter((f) => /nativeTitle\(|useNativeTitle/.test(readFileSync(f, 'utf8')));
    expect(hits.map((f) => f.replace(__dirname, ''))).toEqual([]);
  });
});
