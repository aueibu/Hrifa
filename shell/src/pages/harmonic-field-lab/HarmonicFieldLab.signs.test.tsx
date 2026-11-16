/** Mode numbers from 1 in every display, signed mode-tile errors, the lab Developer menu. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import {
  LAB_DEVELOPER_KEY,
  parseDeveloperOptions,
  resetDeveloperOptionsCache,
} from './state/developerOptions';
import { TIPS } from './texts';

vi.setConfig({ testTimeout: 15_000 });

const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const openModes = () => fireEvent.click(within(rail()).getByRole('tab', { name: /^Modes/ }));
const MINUS = '\u2212';

beforeEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('modes are numbered from 1', () => {
  it('the stepper starts at mode 1 and the grid labels its first row 1; stored state stays 0-based', () => {
    render(<HarmonicFieldLabPage />);
    const label = document.querySelector('[class*="modeLabel"]')!;
    expect(label.textContent).toMatch(/^mode 1\b/);
    fireEvent.click(screen.getByRole('button', { name: 'Next mode' }));
    expect(document.querySelector('[class*="modeLabel"]')!.textContent).toMatch(/^mode 2\b/);
    openModes();
    const rows = screen.getAllByTestId('mode-row');
    expect(rows[0].getAttribute('aria-label')).toMatch(/^Mode 1,/);
    expect(rows[1]).toHaveAttribute('aria-pressed', 'true'); // index 1 is the second row
    expect(rows[0].querySelector('[class*="heatName"]')!.textContent).toMatch(/^1 /);
    expect(rows[7].getAttribute('aria-label')).toMatch(/^Mode 8,/);
  });
});

describe('signed mode tiles', () => {
  it('inexact tiles show + or the minus sign, spelled out in the title; exact tiles show none', () => {
    render(<HarmonicFieldLabPage />);
    openModes();
    const tiles = screen
      .getAllByRole('img')
      .filter((t) => /^Degree \d+:/.test(t.getAttribute('aria-label') ?? ''));
    expect(tiles.length).toBe(64);
    const exact = tiles.filter((t) => t.getAttribute('data-sev') === '0');
    expect(exact.length).toBeGreaterThan(0);
    exact.forEach((t) => {
      expect(t.getAttribute('data-sign')).toBe('');
      expect(t.getAttribute('aria-label')).toMatch(/: exact from the nearest field note/);
    });
    const off = tiles.filter((t) => t.getAttribute('data-sev') !== '0');
    expect(off.length).toBeGreaterThan(0);
    let sharp = 0;
    let flat = 0;
    for (const t of off) {
      const sign = t.getAttribute('data-sign');
      const aria = t.getAttribute('aria-label')!;
      expect(t.querySelector('[class*="heatSign"]')!.textContent).toBe(sign);
      if (sign === '+') {
        sharp += 1;
        expect(aria).toMatch(/^Degree \d+: \+\d+\.\d c \(sharp\) from the nearest field note/);
      } else {
        flat += 1;
        expect(sign).toBe(MINUS);
        expect(aria).toMatch(/^Degree \d+: −\d+\.\d c \(flat\) from the nearest field note/);
      }
    }
    expect(sharp + flat).toBe(off.length);
  });

  it('hovering a tile shows the same sentence as a styled tooltip', async () => {
    window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ tooltipDelay: 0 }));
    resetDeveloperOptionsCache();
    render(<HarmonicFieldLabPage />);
    openModes();
    const tile = screen
      .getAllByRole('img')
      .find((t) => /^Degree \d+: [+−]/.test(t.getAttribute('aria-label') ?? ''))!;
    expect(tile.getAttribute('title')).toBeNull();
    fireEvent.mouseEnter(tile);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // a number and its unit are glued with a no-break space in the tooltip only
    expect(screen.getByRole('tooltip').textContent?.replaceAll('\u00a0', ' ')).toBe(
      tile.getAttribute('aria-label')
    );
  });

  it('the heat grid tooltip explains the sign with an example', () => {
    expect(TIPS.modes.text).toMatch(/\+ means/);
    expect(TIPS.modes.text).toMatch(/21\.5 c flat/);
  });
});

describe('lab Developer menu', () => {
  const open = () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Developer options' }));
    return screen.getByRole('switch', { name: 'Mode tiles: always show \u00b1 sign' });
  };
  const grid = () => {
    openModes();
    return screen.getByRole('group', { name: 'Mode by degree heat grid' });
  };

  it('writes nothing on mount; the sign option defaults on and round-trips through the per-viewer key', () => {
    const sw = open();
    expect(window.localStorage.getItem(LAB_DEVELOPER_KEY)).toBeNull();
    expect(sw).toBeChecked();
    expect(grid()).toHaveAttribute('data-signs', 'always');
    fireEvent.click(sw);
    expect(JSON.parse(window.localStorage.getItem(LAB_DEVELOPER_KEY)!)).toEqual({
      modeSignAlways: false,
      keepModeRoot: true,
      tooltips: true,
      tooltipDelay: 250,
      linkedRootDefault: 'reroot',
      mergeTolerance: 5,
      mergeKeeps: 'first',
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
    expect(grid()).toHaveAttribute('data-signs', 'hover');
    fireEvent.click(screen.getByRole('switch', { name: /always show/ }));
    expect(JSON.parse(window.localStorage.getItem(LAB_DEVELOPER_KEY)!)).toEqual({
      modeSignAlways: true,
      keepModeRoot: true,
      tooltips: true,
      tooltipDelay: 250,
      linkedRootDefault: 'reroot',
      mergeTolerance: 5,
      mergeKeeps: 'first',
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
  });

  it('a stored false starts hover-only', () => {
    window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ modeSignAlways: false }));
    open();
    expect(grid()).toHaveAttribute('data-signs', 'hover');
  });

  it('bad data reads as the defaults', () => {
    expect(parseDeveloperOptions('{not json')).toEqual({
      modeSignAlways: true,
      keepModeRoot: true,
      tooltips: true,
      tooltipDelay: 250,
      linkedRootDefault: 'reroot',
      mergeTolerance: 5,
      mergeKeeps: 'first',
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
    expect(parseDeveloperOptions('{"modeSignAlways":"no"}')).toEqual({
      modeSignAlways: true,
      keepModeRoot: true,
      tooltips: true,
      tooltipDelay: 250,
      linkedRootDefault: 'reroot',
      mergeTolerance: 5,
      mergeKeeps: 'first',
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
    expect(parseDeveloperOptions('[1,2]')).toEqual({
      modeSignAlways: true,
      keepModeRoot: true,
      tooltips: true,
      tooltipDelay: 250,
      linkedRootDefault: 'reroot',
      mergeTolerance: 5,
      mergeKeeps: 'first',
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
    expect(parseDeveloperOptions('null')).toEqual({
      modeSignAlways: true,
      keepModeRoot: true,
      tooltips: true,
      tooltipDelay: 250,
      linkedRootDefault: 'reroot',
      mergeTolerance: 5,
      mergeKeeps: 'first',
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
    window.localStorage.setItem(LAB_DEVELOPER_KEY, '{oops');
    open();
    expect(grid()).toHaveAttribute('data-signs', 'always');
  });

  it('groups the controls into sections by what they affect', () => {
    open();
    const sections: Record<string, string[]> = {
      Tooltips: ['Tooltips', 'Tooltip delay (ms)'],
      'Mode display': [
        'Mode tiles: always show ± sign',
        'Keep the mode root when notes are added or removed',
      ],
      'Playback and keys': ['Linked melody root default'],
      'Pairs panel': ['Interval color', 'Interval intensity'],
      Composites: ['Merge tolerance (c)', 'Merged note keeps'],
    };
    for (const [title, names] of Object.entries(sections)) {
      const group = screen.getByRole('group', { name: title });
      for (const n of names) {
        expect(within(group).getByLabelText(n)).toBeInTheDocument();
      }
    }
  });

  it('the interval color options default to size wheel and strong; they round-trip and read damaged data as the defaults', () => {
    expect(parseDeveloperOptions(null)).toMatchObject({
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
    expect(
      parseDeveloperOptions('{"intervalColor":"rank","intervalIntensity":"faint"}')
    ).toMatchObject({ intervalColor: 'rank', intervalIntensity: 'faint' });
    expect(parseDeveloperOptions('{"intervalColor":3,"intervalIntensity":"x"}')).toMatchObject({
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
    window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ intervalColor: 'rank' }));
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'Simple faint' }));
    expect(JSON.parse(window.localStorage.getItem(LAB_DEVELOPER_KEY)!)).toMatchObject({
      intervalColor: 'rank',
      intervalIntensity: 'faint',
    });
  });

  it('the merge options default to 5 c and first, and read stored values safely', () => {
    expect(parseDeveloperOptions('{"mergeTolerance":12.5,"mergeKeeps":"recent"}')).toMatchObject({
      mergeTolerance: 12.5,
      mergeKeeps: 'recent',
    });
    expect(parseDeveloperOptions('{"mergeTolerance":99}').mergeTolerance).toBe(50);
    expect(parseDeveloperOptions('{"mergeTolerance":-3}').mergeTolerance).toBe(0);
    expect(parseDeveloperOptions('{"mergeTolerance":"x","mergeKeeps":"x"}')).toMatchObject({
      mergeTolerance: 5,
      mergeKeeps: 'first',
      intervalColor: 'size',
      intervalIntensity: 'strong',
      tileLook: 'tinted',
      tileOutline: true,
    });
  });

  it('the menu and its option have tooltips with examples', () => {
    expect(TIPS.mergeTolerance.text).toMatch(/Example:/);
    expect(TIPS.mergeKeeps.text).toMatch(/Example:/);
    expect(TIPS.developerMenu.text).toMatch(/Example:/);
    expect(TIPS.modeSignAlways.text).toMatch(/Example:/);
  });
});
