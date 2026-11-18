/** The Developer menu's tooltip options: sanitizing, storage round trip, and `Tip` honoring off and the delay. */
import { act, fireEvent, render, screen, userEvent } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LAB_DEVELOPER_KEY,
  TOOLTIP_DELAY_DEFAULT,
  parseDeveloperOptions,
  readDeveloperOptions,
  resetDeveloperOptionsCache,
  sanitizeBeatPartialLimit,
  sanitizeTooltipDelay,
  writeDeveloperOptions,
} from '../state/developerOptions';
import { Hint, LabTooltip, Tip } from './ui';

beforeEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});
afterEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
});

describe('beat partial limit developer option (H-21)', () => {
  it('is Off by default and when the key is absent; old data loads unchanged', () => {
    expect(parseDeveloperOptions(null).beatPartialLimit).toBeNull();
    expect(parseDeveloperOptions('{"tooltips":false}')).toMatchObject({
      tooltips: false,
      beatPartialLimit: null,
    });
  });
  it('keeps a whole number 1 to 64 and reads anything else as Off', () => {
    expect(sanitizeBeatPartialLimit(7)).toBe(7);
    expect(sanitizeBeatPartialLimit(7.4)).toBe(7);
    expect(sanitizeBeatPartialLimit(100)).toBe(64);
    for (const v of [0, -3, 0.2, Number.NaN, 'x', null, undefined]) {
      expect(sanitizeBeatPartialLimit(v)).toBeNull();
    }
    expect(parseDeveloperOptions('{"beatPartialLimit":7}').beatPartialLimit).toBe(7);
    writeDeveloperOptions({ beatPartialLimit: 9 });
    expect(readDeveloperOptions().beatPartialLimit).toBe(9);
    writeDeveloperOptions({ beatPartialLimit: null });
    expect(readDeveloperOptions().beatPartialLimit).toBeNull();
  });
});

describe('tint band developer option (H-23)', () => {
  it('is center by default and when the key is absent; old data loads unchanged', () => {
    expect(parseDeveloperOptions(null).tintBand).toBe('center');
    expect(parseDeveloperOptions('{"tintScale":"relative"}')).toMatchObject({
      tintScale: 'relative',
      tintBand: 'center',
    });
  });
  it('round-trips left and reads anything else as center', () => {
    expect(parseDeveloperOptions('{"tintBand":"left"}').tintBand).toBe('left');
    expect(parseDeveloperOptions('{"tintBand":"x"}').tintBand).toBe('center');
    expect(parseDeveloperOptions('{"tintBand":3}').tintBand).toBe('center');
    writeDeveloperOptions({ tintBand: 'left' });
    expect(readDeveloperOptions().tintBand).toBe('left');
    writeDeveloperOptions({ tintBand: 'center' });
    expect(readDeveloperOptions().tintBand).toBe('center');
  });
  it('the interval intensity default is Simple strong; an explicit faint (Complex strong) is kept; saving any option stores it', () => {
    expect(parseDeveloperOptions(null).intervalIntensity).toBe('strong');
    expect(parseDeveloperOptions('{"intervalIntensity":"x"}').intervalIntensity).toBe('strong');
    expect(parseDeveloperOptions('{"intervalIntensity":"faint"}').intervalIntensity).toBe('faint');
  });
});

describe('tint scale developer option (H-22)', () => {
  it('is fixed by default and when the key is absent; old data loads unchanged', () => {
    expect(parseDeveloperOptions(null).tintScale).toBe('fixed');
    expect(parseDeveloperOptions('{"intervalIntensity":"faint"}')).toMatchObject({
      intervalIntensity: 'faint',
      tintScale: 'fixed',
    });
  });
  it('round-trips relative and reads anything else as fixed', () => {
    expect(parseDeveloperOptions('{"tintScale":"relative"}').tintScale).toBe('relative');
    expect(parseDeveloperOptions('{"tintScale":"x"}').tintScale).toBe('fixed');
    expect(parseDeveloperOptions('{"tintScale":3}').tintScale).toBe('fixed');
    writeDeveloperOptions({ tintScale: 'relative' });
    expect(readDeveloperOptions().tintScale).toBe('relative');
    writeDeveloperOptions({ tintScale: 'fixed' });
    expect(readDeveloperOptions().tintScale).toBe('fixed');
  });
});

describe('tooltip developer options', () => {
  it('default to today (on, 250 ms) and sanitize bad stored values', () => {
    expect(parseDeveloperOptions(null)).toMatchObject({ tooltips: true, tooltipDelay: 250 });
    expect(parseDeveloperOptions('not json')).toMatchObject({ tooltips: true, tooltipDelay: 250 });
    expect(parseDeveloperOptions('{"tooltips":"no","tooltipDelay":"fast"}')).toMatchObject({
      tooltips: true,
      tooltipDelay: TOOLTIP_DELAY_DEFAULT,
    });
    expect(sanitizeTooltipDelay(-5)).toBe(0);
    expect(sanitizeTooltipDelay(99999)).toBe(5000);
    expect(sanitizeTooltipDelay(120.6)).toBe(121);
    expect(sanitizeTooltipDelay(Number.NaN)).toBe(250);
    expect(sanitizeTooltipDelay(null)).toBe(250);
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

describe('nested tooltips: the innermost wins', () => {
  const wait = (ms: number) =>
    act(async () => {
      await new Promise((r) => setTimeout(r, ms));
    });
  const visible = () => screen.queryAllByRole('tooltip').map((t) => t.textContent);

  it('Hint in Hint, Tip in Hint and Hint in a plain tooltip show only the inner bubble while the child is hovered', async () => {
    writeDeveloperOptions({ tooltipDelay: 0 });
    const user = userEvent.setup();
    render(
      <>
        <Hint dynamic="OUTER-A">
          <div data-testid="a">
            <span>area</span>
            <Hint dynamic="INNER-A">
              <button type="button">child</button>
            </Hint>
          </div>
        </Hint>
        <Hint dynamic="OUTER-B">
          <div data-testid="b">
            <Tip k="wave">Wave</Tip>
          </div>
        </Hint>
        <LabTooltip label="OUTER-C">
          <div data-testid="c">
            <Hint dynamic="INNER-C">
              <button type="button">cchild</button>
            </Hint>
          </div>
        </LabTooltip>
      </>
    );
    // A: outer area first, then the child (the user-event hover enters the ancestors first)
    await user.hover(screen.getByText('area'));
    await wait(50);
    expect(visible()).toEqual(['OUTER-A']);
    await user.hover(screen.getByRole('button', { name: 'child' }));
    await wait(50);
    expect(visible()).toHaveLength(1);
    expect(visible()[0]).toContain('INNER-A');
    await user.hover(screen.getByText('area'));
    await wait(50);
    expect(visible()).toEqual(['OUTER-A']);
    await user.unhover(screen.getByText('area'));
    await wait(50);
    expect(visible()).toEqual([]);

    // B: a Tip inside a Hint
    await user.hover(screen.getByTestId('b'));
    await wait(50);
    expect(visible()).toHaveLength(1);
    await user.hover(screen.getByRole('button', { name: 'Wave' }));
    await wait(50);
    expect(visible()).toHaveLength(1);
    expect(visible()[0]).not.toContain('OUTER-B');
    await user.unhover(screen.getByRole('button', { name: 'Wave' }));
    await user.unhover(screen.getByTestId('b'));
    await wait(50);

    // C: the plain tooltip (the chord card) around a Hint
    await user.hover(screen.getByTestId('c'));
    await wait(50);
    expect(visible()).toEqual(['OUTER-C']);
    await user.hover(screen.getByRole('button', { name: 'cchild' }));
    await wait(50);
    expect(visible()).toHaveLength(1);
    expect(visible()[0]).toContain('INNER-C');
    await user.hover(screen.getByTestId('c'));
    await wait(50);
    expect(visible()).toEqual(['OUTER-C']);
  });
});
