/**
 * The realistic modules: the chord picker in both sizes (one component, two renderings, no state lost on a move), the
 * preset switch on the page (keystroke and control), and the inspector panels built from the kit.
 */
import { fireEvent, render, screen, userEvent, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_STORAGE_KEY } from '../../../lib/stage';
import type { StageStorage } from '../persistence';
import { PRESETS_STORAGE_KEY } from '../presets';
import { StageApp } from '../StageApp';
import { ChordPicker, chordProbe } from './ChordPicker';
import { SpikeInspector } from './Inspector';
import { SpikeProvider } from './state';

vi.setConfig({ testTimeout: 20_000 });

const memory = () => {
  const data = new Map<string, string>();
  const storage: StageStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
  return { data, storage };
};

describe('ChordPicker (one component, two renderings)', () => {
  beforeEach(() => {
    chordProbe.mounts = 0;
  });

  it('is a 2x1 grid when narrow and a 3x1 row otherwise, from the same component', () => {
    const view = render(<ChordPicker size={{ width: 'narrow', height: 'tall' }} />);
    const root = () => document.querySelector('[data-standin="chords"]')!;
    expect(root().getAttribute('data-chord-layout')).toBe('2x1');
    expect(screen.getAllByRole('button', { name: /^(C|Dm|Em|F|G|Am|Bdim)$/ })).toHaveLength(7);
    view.rerender(<ChordPicker size={{ width: 'wide', height: 'short' }} />);
    expect(root().getAttribute('data-chord-layout')).toBe('3x1');
    expect(screen.getAllByRole('button', { name: /^(C|Dm|Em|F|G|Am|Bdim)$/ })).toHaveLength(7);
    view.rerender(<ChordPicker size={{ width: 'regular', height: 'regular' }} />);
    expect(root().getAttribute('data-chord-layout')).toBe('3x1');
  });

  it('keeps the role and the chord when it moves between the two sizes', async () => {
    const user = userEvent.setup();
    const view = render(<ChordPicker size={{ width: 'narrow', height: 'tall' }} />);
    await user.click(screen.getByText('Sevenths'));
    await user.click(screen.getByRole('button', { name: 'Dm7' }));
    expect(screen.getByTestId('chord-now').textContent).toBe('Dm7');
    view.rerender(<ChordPicker size={{ width: 'wide', height: 'short' }} />);
    expect(screen.getByTestId('chord-now').textContent).toBe('Dm7');
    expect(screen.getByRole('button', { name: 'Dm7' })).toHaveAttribute('aria-pressed', 'true');
    view.rerender(<ChordPicker size={{ width: 'narrow', height: 'regular' }} />);
    expect(screen.getByRole('button', { name: 'Dm7' })).toHaveAttribute('aria-pressed', 'true');
    expect(chordProbe.mounts).toBe(1);
  });
});

/* ----------------------------------------------------------------------------------- page */

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const rect = (w: number, h: number) =>
  ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 }) as DOMRect;
const realObserver = window.ResizeObserver;
const realInnerWidth = window.innerWidth;

describe('StageApp presets', () => {
  beforeEach(() => {
    chordProbe.mounts = 0;
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;
    window.innerWidth = 2400;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        if (this.hasAttribute('data-slot-size')) {
          const section = this.closest('[data-slot-id]')!;
          const stacked = !!section.parentElement?.querySelector(
            ':scope > [role="separator"][aria-orientation="horizontal"]'
          );
          const id = section.getAttribute('data-slot-id');
          if (id === 'chords') {
            return stacked ? rect(768, 160) : rect(224, 640); // 48 x 10 rem above, 14 x 40 rem beside
          }
          return rect(960, 640);
        }
        if (this.hasAttribute('data-stage-root')) {
          return rect(1600, 800);
        }
        return rect(0, 0);
      }
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
    window.innerWidth = realInnerWidth;
  });

  const layoutLayout = () =>
    document.querySelector('[data-chord-layout]')!.getAttribute('data-chord-layout');
  const stored = (data: Map<string, string>) => JSON.parse(data.get(LAYOUT_STORAGE_KEY)!);

  it('switches layouts by keystroke and control, keeps the chord picker state, and saves under hrifa.stage.', async () => {
    const user = userEvent.setup();
    const { data, storage } = memory();
    render(<StageApp storage={storage} />);
    // sketch: the picker beside the roll, 2x1
    expect(screen.getByRole('region', { name: 'Chord picker' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Piano roll' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Canvas' })).not.toBeInTheDocument();
    expect(layoutLayout()).toBe('2x1');
    await user.click(screen.getByRole('button', { name: 'G' }));

    // audition by keystroke: the picker is above the roll, 3x1, same state; the canvas appears
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', altKey: true });
    expect(screen.getByRole('region', { name: 'Canvas' })).toBeInTheDocument();
    expect(layoutLayout()).toBe('3x1');
    expect(screen.getByTestId('chord-now').textContent).toBe('G');
    expect(stored(data).columns[0].slots).toEqual(['chords', 'pianoroll']);

    // back with the control
    await user.click(screen.getByText('Sketch (Alt+1)'));
    expect(layoutLayout()).toBe('2x1');
    expect(screen.queryByRole('region', { name: 'Canvas' })).not.toBeInTheDocument();
    expect(screen.getByTestId('chord-now').textContent).toBe('G');
    expect(chordProbe.mounts).toBe(1);

    // every key written is under the Stage prefix
    expect([...data.keys()].every((k) => k.startsWith('hrifa.stage.'))).toBe(true);
    expect(data.has(PRESETS_STORAGE_KEY)).toBe(true);
  });

  it('remembers the arrangement each preset was left in', async () => {
    const user = userEvent.setup();
    const { storage } = memory();
    render(<StageApp storage={storage} />);
    await user.click(screen.getByRole('button', { name: 'Close Chord picker' }));
    expect(screen.queryByRole('region', { name: 'Chord picker' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', altKey: true });
    expect(screen.getByRole('region', { name: 'Chord picker' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: '1', code: 'Digit1', altKey: true });
    expect(screen.queryByRole('region', { name: 'Chord picker' })).not.toBeInTheDocument();
    // Reset layout returns the active preset to its default
    await user.click(screen.getByRole('button', { name: 'Reset layout' }));
    expect(screen.getByRole('region', { name: 'Chord picker' })).toBeInTheDocument();
  });

  it('shows clip details in the inspector when a clip stand-in is clicked', async () => {
    const user = userEvent.setup();
    const { storage } = memory();
    render(<StageApp storage={storage} />);
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', altKey: true });
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByText('Click a clip on the canvas.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Chorus/ }));
    expect(within(inspector).getByLabelText('Name')).toHaveValue('Chorus');
  });

  it('does not switch presets on Alt+digit typed in a text field', async () => {
    const user = userEvent.setup();
    const { storage } = memory();
    render(<StageApp storage={storage} />);
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', altKey: true });
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    await user.click(screen.getByRole('button', { name: /Chorus/ }));
    const name = within(inspector).getByLabelText('Name');
    fireEvent.keyDown(name, { key: '1', code: 'Digit1', altKey: true });
    expect(screen.getByRole('region', { name: 'Canvas' })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------------ inspector */

describe('SpikeInspector (from the kit)', () => {
  it('has a note panel and a clip panel with hints when nothing is selected', () => {
    render(
      <SpikeProvider>
        <SpikeInspector />
      </SpikeProvider>
    );
    const panels = document.querySelectorAll('[data-kit="panel"]');
    expect(panels).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Selected note' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Selected clip' })).toBeInTheDocument();
    expect(screen.getByText('Click a note in the roll.')).toBeInTheDocument();
  });

  it('renders the selected note from kit rows, sections and actions, and edits it', async () => {
    const user = userEvent.setup();
    render(
      <SpikeProvider initialSelection={{ kind: 'note', ids: ['n1'] }}>
        <SpikeInspector />
      </SpikeProvider>
    );
    const panel = screen.getByRole('region', { name: 'Selected note' });
    expect(panel.querySelectorAll('[data-kit="section"]')).toHaveLength(2);
    expect(panel.querySelectorAll('[data-kit="row"]').length).toBeGreaterThanOrEqual(6);
    expect(panel.querySelectorAll('[data-kit="actions"]')).toHaveLength(1);
    expect(within(panel).getByText('C4')).toBeInTheDocument();
    const velocity = within(panel).getByLabelText('Velocity (%)');
    expect(velocity).toHaveValue('80');
    await user.clear(velocity);
    await user.type(velocity, '55');
    expect(velocity).toHaveValue('55');
    await user.click(within(panel).getByRole('button', { name: 'Muted' }));
    expect(within(panel).getByRole('button', { name: 'Muted' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(within(panel).getByRole('button', { name: 'Delete' }));
    expect(within(panel).getByText('Click a note in the roll.')).toBeInTheDocument();
  });

  it('renders the selected clip from kit pieces (text, number, select, segmented, toggle)', async () => {
    const user = userEvent.setup();
    render(
      <SpikeProvider initialSelection={{ kind: 'clip', id: 'c2' }}>
        <SpikeInspector />
      </SpikeProvider>
    );
    const panel = screen.getByRole('region', { name: 'Selected clip' });
    expect(within(panel).getByLabelText('Name')).toHaveValue('Chorus');
    expect(within(panel).getByLabelText('Bars')).toHaveValue('8');
    expect(within(panel).getByLabelText('Mode')).toHaveValue('Dorian');
    expect(within(panel).getByRole('radio', { name: '1/8' })).toBeChecked();
    expect(within(panel).getByRole('button', { name: 'Loop' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(within(panel).getByText('1/16'));
    expect(within(panel).getByRole('radio', { name: '1/16' })).toBeChecked();
    await user.click(within(panel).getByRole('button', { name: 'Duplicate' }));
    expect(panel.querySelectorAll('[data-kit="actions"]')).toHaveLength(1);
  });
});
