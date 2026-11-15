/** The Developer menu's tooltip options: sanitising, storage round trip, and `Tip` honouring off and the delay. */
import { act, fireEvent, render, screen } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LAB_DEVELOPER_KEY,
  TOOLTIP_DELAY_DEFAULT,
  parseDeveloperOptions,
  readDeveloperOptions,
  resetDeveloperOptionsCache,
  sanitiseTooltipDelay,
  writeDeveloperOptions,
} from '../state/developerOptions';
import { Tip } from './ui';

beforeEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});

describe('tooltip developer options', () => {
  it('default to today (on, 250 ms) and sanitise bad stored values', () => {
    expect(parseDeveloperOptions(null)).toMatchObject({ tooltips: true, tooltipDelay: 250 });
    expect(parseDeveloperOptions('not json')).toMatchObject({ tooltips: true, tooltipDelay: 250 });
    expect(parseDeveloperOptions('{"tooltips":"no","tooltipDelay":"fast"}')).toMatchObject({
      tooltips: true,
      tooltipDelay: TOOLTIP_DELAY_DEFAULT,
    });
    expect(sanitiseTooltipDelay(-5)).toBe(0);
    expect(sanitiseTooltipDelay(99999)).toBe(5000);
    expect(sanitiseTooltipDelay(120.6)).toBe(121);
    expect(sanitiseTooltipDelay(Number.NaN)).toBe(250);
    expect(sanitiseTooltipDelay(null)).toBe(250);
    // the older options are untouched by a stored file that predates these two
    expect(parseDeveloperOptions('{"modeSignAlways":false}')).toMatchObject({
      modeSignAlways: false,
      keepModeRoot: true,
      tooltips: true,
    });
  });

  it('round-trip through storage, clamped on write', () => {
    writeDeveloperOptions({ tooltips: false, tooltipDelay: 800 });
    resetDeveloperOptionsCache();
    expect(readDeveloperOptions()).toMatchObject({ tooltips: false, tooltipDelay: 800 });
    writeDeveloperOptions({ tooltipDelay: 12000 });
    expect(JSON.parse(window.localStorage.getItem(LAB_DEVELOPER_KEY)!)).toMatchObject({
      tooltipDelay: 5000,
    });
  });
});

describe('Tip', () => {
  const hover = () => fireEvent.mouseEnter(screen.getByRole('button', { name: 'Wave' }));
  const wait = (ms: number) =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });

  it('shows after the delay by default', async () => {
    render(<Tip k="wave">Wave</Tip>);
    hover();
    expect(screen.queryByRole('tooltip')).toBeNull();
    await wait(400);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('a longer delay holds it back; 0 shows it at once', async () => {
    writeDeveloperOptions({ tooltipDelay: 1500 });
    render(<Tip k="wave">Wave</Tip>);
    hover();
    await wait(400);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => writeDeveloperOptions({ tooltipDelay: 0 }));
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Wave' }));
    hover();
    await wait(50);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('off shows no tooltip at all', async () => {
    writeDeveloperOptions({ tooltips: false });
    render(<Tip k="wave">Wave</Tip>);
    hover();
    await wait(400);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
