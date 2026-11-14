/** Stage in jsdom: measuring, mounted-once moves, splitters, narrow window, minimum sizes, the page and its storage. */
import { useState } from 'react';
import { act, fireEvent, render, screen, userEvent, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_STORAGE_KEY, moveColumn, type Layout } from '../../lib/stage';
import type { StageStorage } from './persistence';
import { Stage } from './Stage';
import { StageApp } from './StageApp';
import { addWithMin } from './stageOps';
import { DEFAULT_STAGE_LAYOUT, STANDIN_REGISTRY } from './standins';
import { pickerProbe } from './standins/PickerStandin';

vi.setConfig({ testTimeout: 15_000 });

/** A ResizeObserver stand-in whose callbacks the test fires, and the sizes jsdom has no layout to give. */
const observers = new Set<{ cb: () => void }>();
class FakeResizeObserver {
  constructor(public cb: () => void) {
    observers.add(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observers.delete(this);
  }
}
const slot = { w: 640, h: 400 }; // px: 40 x 25 rem, so regular-short
const rect = (w: number, h: number) =>
  ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
const resize = (w: number, h: number) => {
  slot.w = w;
  slot.h = h;
  act(() => observers.forEach((o) => o.cb()));
};

const realObserver = window.ResizeObserver;
const realInnerWidth = window.innerWidth;

beforeEach(() => {
  observers.clear();
  slot.w = 640;
  slot.h = 400;
  pickerProbe.mounts = 0;
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-slot-size')) {
      return rect(slot.w, slot.h);
    }
    if (this.hasAttribute('data-stage-root')) {
      return rect(1600, 800); // 50 rem tall
    }
    if (this.querySelector(':scope > [role="separator"][aria-orientation="horizontal"]')) {
      return rect(640, 800); // a stacked column, 50 rem tall
    }
    return rect(0, 0);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
  window.innerWidth = realInnerWidth;
});

const cols = (...c: { slots: string[]; width?: number }[]): Layout => ({ version: 1, columns: c });

function Harness({ initial, widthRem = 300 }: { initial: Layout; widthRem?: number }) {
  const [layout, setLayout] = useState(initial);
  return (
    <>
      <Stage
        registry={STANDIN_REGISTRY}
        layout={layout}
        update={setLayout}
        widthRem={widthRem}
        showSizes
      />
      <button type="button" onClick={() => setLayout((l) => moveColumn(l, 'picker', 'right'))}>
        external move
      </button>
      <button
        type="button"
        onClick={() => setLayout((l) => addWithMin(l, STANDIN_REGISTRY.meta, 'picker'))}
      >
        add picker
      </button>
      <output data-testid="layout">{JSON.stringify(layout)}</output>
    </>
  );
}
const stored = () => JSON.parse(screen.getByTestId('layout').textContent!) as Layout;
const widths = () => stored().columns.map((c) => c.width);
const body = (title: string) =>
  within(screen.getByRole('region', { name: title }))
    .getByText(/^size /)
    .closest('[data-standin]')!;

describe('slot size', () => {
  it('reports a new size class when the container resizes, and the module follows', () => {
    render(<Harness initial={cols({ slots: ['roll'] })} />);
    const section = screen.getByRole('region', { name: 'Roll stand-in' });
    const slotBody = () => section.querySelector('[data-slot-size]')!;
    expect(slotBody().getAttribute('data-slot-size')).toBe('regular-short');
    expect(within(section).getByText('size regular-short')).toBeInTheDocument();
    expect(within(section).getAllByText('regular-short').length).toBe(1); // the Show sizes badge

    resize(800, 720); // 50 x 45 rem
    expect(slotBody().getAttribute('data-slot-size')).toBe('wide-tall');
    expect(within(section).getByText('size wide-tall')).toBeInTheDocument();

    resize(300, 300); // 18.75 x 18.75 rem
    expect(slotBody().getAttribute('data-slot-size')).toBe('narrow-short');
    expect(within(section).getByText('12 notes, bars 1 to 4')).toBeInTheDocument();
  });
});

describe('mounted once', () => {
  it('keeps the picker state and mounts it once through move, stack, reorder and unstack', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={cols(
          { slots: ['picker'], width: 24 },
          { slots: ['roll'], width: 24 },
          { slots: ['notes'], width: 36 }
        )}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Picks' }));
    await user.click(screen.getByRole('button', { name: 'Picks' }));
    const count = () => screen.getByTestId('picker-count').textContent;
    const order = () => stored().columns.map((c) => c.slots.join('+'));
    expect(count()).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Move Picker stand-in right' }));
    expect(order()).toEqual(['roll', 'picker', 'notes']);
    expect(count()).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Move Picker stand-in left' }));
    expect(order()).toEqual(['picker', 'roll', 'notes']);

    await user.click(screen.getByRole('button', { name: 'Stack Picker stand-in onto' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Stack onto Roll stand-in' }));
    expect(order()).toEqual(['roll+picker', 'notes']);
    expect(count()).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Move Picker stand-in up in its stack' }));
    expect(order()).toEqual(['picker+roll', 'notes']);
    expect(count()).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Unstack Picker stand-in' }));
    expect(order()).toEqual(['roll', 'picker', 'notes']);
    expect(count()).toBe('2');

    expect(pickerProbe.mounts).toBe(1);
    // the module sits in the slot body of its own section
    expect(
      within(screen.getByRole('region', { name: 'Picker stand-in' })).getByTestId('picker-count')
    ).toBeInTheDocument();
  });

  it('renders one component three ways for three sizes', () => {
    render(<Harness initial={cols({ slots: ['picker'], width: 24 })} />);
    const layoutOf = () =>
      body('Picker stand-in')
        .querySelector('[data-picker-layout]')!
        .getAttribute('data-picker-layout');
    resize(400, 800); // 25 x 50 rem: narrow-tall
    expect(layoutOf()).toBe('list');
    resize(600, 800); // 37.5 rem: regular-tall
    expect(layoutOf()).toBe('grid');
    resize(800, 800); // wide
    expect(layoutOf()).toBe('strip');
    resize(600, 300); // regular-short
    expect(layoutOf()).toBe('strip');
  });

  it('removes a closed module from the layout and the screen', async () => {
    const user = userEvent.setup();
    render(<Harness initial={cols({ slots: ['picker'] }, { slots: ['roll'] })} />);
    await user.click(screen.getByRole('button', { name: 'Close Picker stand-in' }));
    expect(screen.queryByRole('region', { name: 'Picker stand-in' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('picker-count')).not.toBeInTheDocument();
    expect(stored().columns).toEqual([{ slots: ['roll'] }]);
  });
});

describe('focus', () => {
  it('puts focus back on the same tool in the new slot after a move', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={cols(
          { slots: ['picker'], width: 24 },
          { slots: ['roll'], width: 24 },
          { slots: ['notes'], width: 36 }
        )}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Move Picker stand-in right' }));
    expect(stored().columns[1].slots).toEqual(['picker']);
    expect(screen.getByRole('button', { name: 'Move Picker stand-in right' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Move Picker stand-in right' }));
    expect(stored().columns[2].slots).toEqual(['picker']);
    // the right tool is now disabled (last column), so focus falls back to the slot itself
    expect(screen.getByRole('region', { name: 'Picker stand-in' })).toHaveFocus();
  });

  it('keeps focus that was inside the module through a move', () => {
    render(
      <Harness initial={cols({ slots: ['picker'], width: 24 }, { slots: ['roll'], width: 24 })} />
    );
    const picks = screen.getByRole('button', { name: 'Picks' });
    picks.focus();
    fireEvent.click(screen.getByRole('button', { name: 'external move' }));
    expect(stored().columns[1].slots).toEqual(['picker']);
    expect(screen.getByRole('button', { name: 'Picks' })).toBe(picks);
    expect(picks).toHaveFocus();
  });
});

describe('lifecycle', () => {
  it('releases every ResizeObserver on unmount', () => {
    const view = render(<Harness initial={cols({ slots: ['picker'] }, { slots: ['roll'] })} />);
    expect(observers.size).toBeGreaterThan(0);
    view.unmount();
    expect(observers.size).toBe(0);
  });

  it('keeps the previous size when a slot measures a zero rectangle', () => {
    render(<Harness initial={cols({ slots: ['roll'] })} />);
    const attr = () =>
      screen
        .getByRole('region', { name: 'Roll stand-in' })
        .querySelector('[data-slot-size]')!
        .getAttribute('data-slot-size');
    expect(attr()).toBe('regular-short');
    resize(0, 0);
    expect(attr()).toBe('regular-short');
  });

  it('starts the picker afresh when it is closed and added again', async () => {
    const user = userEvent.setup();
    render(<Harness initial={cols({ slots: ['picker'] }, { slots: ['roll'] })} />);
    await user.click(screen.getByRole('button', { name: 'Picks' }));
    expect(screen.getByTestId('picker-count').textContent).toBe('1');
    await user.click(screen.getByRole('button', { name: 'Close Picker stand-in' }));
    await user.click(screen.getByRole('button', { name: 'add picker' }));
    expect(screen.getByTestId('picker-count').textContent).toBe('0');
    expect(pickerProbe.mounts).toBe(2);
  });

  it('gives a module the nearest size it supports while the slot reports the measured one', () => {
    render(<Harness initial={cols({ slots: ['notes'], width: 36 })} />);
    resize(300, 300); // narrow x short, below the Notes minimum (a squeezed window)
    const section = screen.getByRole('region', { name: 'Notes stand-in' });
    expect(section.querySelector('[data-slot-size]')!.getAttribute('data-slot-size')).toBe(
      'narrow-short'
    );
    expect(within(section).getByText('size regular-short')).toBeInTheDocument();
  });
});

describe('splitters', () => {
  it('nudges column widths by arrows and Home within the minimums', () => {
    render(
      <Harness initial={cols({ slots: ['picker'], width: 24 }, { slots: ['roll'], width: 36 })} />
    );
    const sep = screen.getByRole('separator', { name: /Resize columns of Picker stand-in/ });
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('aria-valuenow', '24');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    expect(widths()).toEqual([25, 35]);
    expect(sep).toHaveAttribute('aria-valuenow', '25');
    fireEvent.keyDown(sep, { key: 'Home' });
    expect(widths()).toEqual([12, 48]);
    fireEvent.keyDown(sep, { key: 'ArrowLeft' });
    expect(widths()).toEqual([12, 48]); // at the clamp
  });

  it('changes column widths by a pointer drag, clamped', () => {
    render(
      <Harness initial={cols({ slots: ['picker'], width: 24 }, { slots: ['roll'], width: 36 })} />
    );
    const sep = screen.getByRole('separator', { name: /Resize columns/ });
    fireEvent.pointerDown(sep, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(sep, { clientX: 132, pointerId: 1, buttons: 1 }); // +2 rem at 16 px
    expect(widths()).toEqual([26, 34]);
    fireEvent.pointerMove(sep, { clientX: 1000, pointerId: 1, buttons: 1 });
    expect(widths()).toEqual([48, 12]);
    fireEvent.pointerUp(sep, { pointerId: 1 });
    fireEvent.pointerMove(sep, { clientX: 100, pointerId: 1, buttons: 1 }); // released: no change
    expect(widths()).toEqual([48, 12]);
  });

  it('nudges stack shares by keyboard within the clamp', () => {
    render(<Harness initial={cols({ slots: ['roll', 'notes'], width: 42 })} />);
    const sep = screen.getByRole('separator', { name: /Resize Roll stand-in and Notes stand-in/ });
    expect(sep).toHaveAttribute('aria-orientation', 'horizontal');
    expect(sep).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(sep, { key: 'ArrowDown' });
    expect(sep).toHaveAttribute('aria-valuenow', '55');
    expect(stored().columns[0].shares).toEqual([0.55, 0.45]);
    fireEvent.keyDown(sep, { key: 'End' });
    expect(sep).toHaveAttribute('aria-valuenow', '80'); // each slot keeps at least 20%
    fireEvent.keyDown(sep, { key: 'ArrowDown' });
    expect(sep).toHaveAttribute('aria-valuenow', '80');
    fireEvent.keyDown(sep, { key: 'Home' });
    expect(sep).toHaveAttribute('aria-valuenow', '20');
  });
});

describe('splitter drags', () => {
  const stackSep = () =>
    screen.getByRole('separator', { name: /Resize Roll stand-in and Notes stand-in/ });

  it('drags a stack splitter by pointer and clamps a far move', () => {
    render(<Harness initial={cols({ slots: ['roll', 'notes'], width: 42 })} />);
    const sep = stackSep();
    fireEvent.pointerDown(sep, { clientY: 400, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(sep, { clientY: 480, pointerId: 1, buttons: 1 }); // +80 of 800 px
    expect(stored().columns[0].shares).toEqual([0.6, 0.4]);
    fireEvent.pointerMove(sep, { clientY: 4000, pointerId: 1, buttons: 1 });
    expect(sep).toHaveAttribute('aria-valuenow', '80');
    expect(sep).toHaveAttribute('aria-valuemax', '80');
  });

  it('ends a drag on pointercancel, on lost capture, and on a move with no button down', () => {
    render(<Harness initial={cols({ slots: ['roll', 'notes'], width: 42 })} />);
    const sep = stackSep();
    const drag = (end: () => void) => {
      fireEvent.pointerDown(sep, { clientY: 400, pointerId: 1, buttons: 1 });
      fireEvent.pointerMove(sep, { clientY: 440, pointerId: 1, buttons: 1 });
      end();
      const before = sep.getAttribute('aria-valuenow');
      fireEvent.pointerMove(sep, { clientY: 600, pointerId: 1, buttons: 1 });
      expect(sep.getAttribute('aria-valuenow')).toBe(before);
    };
    drag(() => fireEvent.pointerCancel(sep, { pointerId: 1 }));
    drag(() => fireEvent.lostPointerCapture(sep, { pointerId: 1 }));
    drag(() => fireEvent.pointerMove(sep, { clientY: 500, pointerId: 1, buttons: 0 }));
  });
});

describe('narrow window', () => {
  it('shows at least one column when none would fit', () => {
    render(
      <Harness
        widthRem={10}
        initial={cols({ slots: ['picker'], width: 24 }, { slots: ['roll'], width: 24 })}
      />
    );
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual([
      'Picker stand-in',
    ]);
  });

  it('keeps the hidden module mounted', async () => {
    render(
      <Harness
        widthRem={30}
        initial={cols({ slots: ['roll'], width: 24 }, { slots: ['picker'], width: 24 })}
      />
    );
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(pickerProbe.mounts).toBe(1);
  });
});

describe('minimum sizes', () => {
  it('refuses stacking a module onto a column narrower than its minimum, and clamps its splitter', async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={cols({ slots: ['picker'], width: 24 }, { slots: ['notes'], width: 36 })} />
    );
    // Notes asks for 30 rem; the Picker column is 24 rem wide
    await user.click(screen.getByRole('button', { name: 'Stack Notes stand-in onto' }));
    const item = await screen.findByRole('menuitem', { name: 'Stack onto Picker stand-in' });
    expect(item).toHaveAttribute('data-disabled', 'true');
    await user.click(item);
    expect(stored().columns.map((c) => c.slots.join('+'))).toEqual(['picker', 'notes']);

    // the splitter will not take the Notes column below 30 rem
    const sep = screen.getByRole('separator', { name: /Resize columns/ });
    fireEvent.keyDown(sep, { key: 'End' });
    expect(widths()).toEqual([30, 30]);
  });
});

describe('StageApp', () => {
  const memory = () => {
    const data = new Map<string, string>();
    const storage: StageStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
    return { data, storage };
  };

  it('saves every change, adds modules back, resets, and loads a stored layout', async () => {
    const user = userEvent.setup();
    const { data, storage } = memory();
    window.innerWidth = 2400; // room for every column
    const first = render(
      <StageApp
        storage={storage}
        registry={STANDIN_REGISTRY}
        defaultLayout={DEFAULT_STAGE_LAYOUT}
        presets={[]}
        inspector={false}
      />
    );
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Stage (spike)')).toBeInTheDocument();
    // the default: a picker column and a roll over notes stack
    expect(screen.getAllByRole('region')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Close Notes stand-in' }));
    expect(JSON.parse(data.get(LAYOUT_STORAGE_KEY)!).columns).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Notes stand-in' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Modules' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Add Notes stand-in' }));
    expect(screen.getByRole('region', { name: 'Notes stand-in' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Show sizes' }));
    expect(
      screen.getAllByText(/^(narrow|regular|wide)-(short|regular|tall)$/).length
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Close Roll stand-in' }));
    first.unmount();
    // a new page load reads what the last one saved
    render(
      <StageApp
        storage={storage}
        registry={STANDIN_REGISTRY}
        defaultLayout={DEFAULT_STAGE_LAYOUT}
        presets={[]}
        inspector={false}
      />
    );
    expect(screen.queryByRole('region', { name: 'Roll stand-in' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset layout' }));
    expect(screen.getByRole('region', { name: 'Roll stand-in' })).toBeInTheDocument();
  });

  it('keeps a module mounted while its column is hidden, and brings it back from the switcher', async () => {
    const user = userEvent.setup();
    const { data, storage } = memory();
    data.set(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        columns: [
          { slots: ['roll'], width: 24 },
          { slots: ['picker'], width: 24 },
        ],
      })
    );
    window.innerWidth = 2400;
    render(
      <StageApp
        storage={storage}
        registry={STANDIN_REGISTRY}
        defaultLayout={DEFAULT_STAGE_LAYOUT}
        presets={[]}
        inspector={false}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Picks' }));
    await user.click(screen.getByRole('button', { name: 'Picks' }));
    window.innerWidth = 480; // 30 rem: one column
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.queryByRole('region', { name: 'Picker stand-in' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hidden columns (1)' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Show Picker stand-in' }));
    expect(screen.getByRole('region', { name: 'Picker stand-in' })).toBeInTheDocument();
    expect(screen.getByTestId('picker-count').textContent).toBe('2');
    expect(pickerProbe.mounts).toBe(1);
  });
});
