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

describe('no native title attribute on a DOM tag', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
    );
  /** Lowercase JSX opening tags (`<span`, `<div`, `<g` ...) up to their closing `>` that carry ` title=`. `=>` and `>` inside `{...}` are skipped. */
  const nativeTitleTags = (src: string): string[] => {
    const hits: string[] = [];
    const open = /<[a-z][A-Za-z0-9]*(?=[\s/>])/g;
    for (let m = open.exec(src); m; m = open.exec(src)) {
      let depth = 0;
      let i = m.index + m[0].length;
      for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
        } else if ((ch === '"' || ch === "'") && depth === 0) {
          // an attribute string: a `>` inside it does not end the tag
          const close = src.indexOf(ch, i + 1);
          i = close === -1 ? src.length : close;
        } else if (ch === '>' && depth === 0 && src[i - 1] !== '=') {
          break;
        }
      }
      const tag = src.slice(m.index, i);
      if (/\stitle=/.test(tag)) {
        hits.push(tag.slice(0, 60));
      }
    }
    return hits;
  };
  it('the scanner finds a reintroduced title and ignores component props', () => {
    expect(nativeTitleTags('<span className="a" title="x">hi</span>')).toHaveLength(1);
    expect(nativeTitleTags('<g\n  title={f(() => 1)}\n/>')).toHaveLength(1);
    expect(nativeTitleTags('<Strip title="x"><title>t</title></Strip>')).toEqual([]);
    // a `>` inside a quoted attribute must not end the tag early and hide the title after it
    expect(nativeTitleTags('<span aria-label="a > b" title="x" />')).toHaveLength(1);
  });
  it('no components/*.tsx puts title= on a lowercase tag', () => {
    const files = walk(join(__dirname, 'components')).filter(
      (f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f)
    );
    const hits = files.flatMap((f) =>
      nativeTitleTags(readFileSync(f, 'utf8')).map((t) => `${f.replace(__dirname, '')}: ${t}`)
    );
    expect(hits).toEqual([]);
  });
});
