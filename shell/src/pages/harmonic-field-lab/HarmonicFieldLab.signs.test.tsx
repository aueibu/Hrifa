/** Mode numbers from 1 in every display, signed mode-tile errors, the lab Developer menu. */
import { fireEvent, render, screen, within } from '@test-utils';
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
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
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
      expect(t.getAttribute('title')).toBe(aria);
    }
    expect(sharp + flat).toBe(off.length);
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
    });
    expect(grid()).toHaveAttribute('data-signs', 'hover');
    fireEvent.click(screen.getByRole('switch', { name: /always show/ }));
    expect(JSON.parse(window.localStorage.getItem(LAB_DEVELOPER_KEY)!)).toEqual({
      modeSignAlways: true,
    });
  });

  it('a stored false starts hover-only', () => {
    window.localStorage.setItem(LAB_DEVELOPER_KEY, JSON.stringify({ modeSignAlways: false }));
    open();
    expect(grid()).toHaveAttribute('data-signs', 'hover');
  });

  it('bad data reads as the defaults', () => {
    expect(parseDeveloperOptions('{not json')).toEqual({ modeSignAlways: true });
    expect(parseDeveloperOptions('{"modeSignAlways":"no"}')).toEqual({ modeSignAlways: true });
    expect(parseDeveloperOptions('[1,2]')).toEqual({ modeSignAlways: true });
    expect(parseDeveloperOptions('null')).toEqual({ modeSignAlways: true });
    window.localStorage.setItem(LAB_DEVELOPER_KEY, '{oops');
    open();
    expect(grid()).toHaveAttribute('data-signs', 'always');
  });

  it('the menu and its option have tooltips with examples', () => {
    expect(TIPS.developerMenu.text).toMatch(/Example:/);
    expect(TIPS.modeSignAlways.text).toMatch(/Example:/);
  });
});

