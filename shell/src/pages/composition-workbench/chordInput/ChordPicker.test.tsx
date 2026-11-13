import { useState } from 'react';
import { cleanup, render, screen, userEvent, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasTakeoverProvider, CanvasTakeoverSlot } from '../components/canvasTakeover';
import { defaultProjectPitchSet, type ProjectPitchSet } from '../compositionSettings';
import type { ChordHost } from '../noteEditorPreferences';
import { ChordPicker, type ChordPickerMode } from './ChordPicker';
import { ChordPickerHost } from './ChordPickerHost';
import { chordsWithCommonTone } from './chords';
import { DEFAULT_VOICING } from './placement';
import type { VoicingSpec } from './voicing';

const project = defaultProjectPitchSet(12); // C major

const spies = () => ({
  onHover: vi.fn(),
  onPin: vi.fn(),
  onInsert: vi.fn(),
  onClose: vi.fn(),
});

/** The picker with its own override and voicing state, as its owner keeps them. */
function Stateful({
  anchorMidicents = 6900,
  pitchSet = project,
  callbacks,
  seenOverride,
}: {
  anchorMidicents?: number;
  pitchSet?: ProjectPitchSet;
  callbacks: ReturnType<typeof spies>;
  seenOverride?: (override: ProjectPitchSet | null) => void;
}) {
  const [override, setOverride] = useState<ProjectPitchSet | null>(null);
  const [voicing, setVoicing] = useState<VoicingSpec>(DEFAULT_VOICING);
  return (
    <ChordPicker
      anchor={{ pitchMidicents: anchorMidicents }}
      pitchSet={pitchSet}
      override={override}
      onOverrideChange={(next) => {
        seenOverride?.(next);
        setOverride(next);
      }}
      voicing={voicing}
      onVoicingChange={setVoicing}
      {...callbacks}
    />
  );
}

const chordButtons = () =>
  within(screen.getByRole('group', { name: 'Chords' }))
    .getAllByRole('button')
    .map((button) => button.textContent);

beforeEach(() => localStorage.clear());

describe('ChordPicker', () => {
  it('offers the chords on the anchor over the project scale (Am yes, A major no in C major)', () => {
    render(<Stateful callbacks={spies()} />);
    const names = chordButtons();
    expect(names).toContain('Am');
    expect(names).not.toContain('A');
    expect(screen.getByText(/Chords on A \(A4\)/)).toBeInTheDocument();
  });

  it('lays the voicing out after the chord list (second row) at the default width', () => {
    render(<Stateful callbacks={spies()} />);
    const layout = screen.getByRole('group', { name: 'Chord picker' }).firstElementChild!;
    expect(layout).toHaveAttribute('data-layout-base', 'stacked');
    const chords = screen.getByRole('group', { name: 'Chords' });
    const spread = screen.getByRole('group', { name: 'Spread' });
    const inversion = screen.getByRole('group', { name: 'Inversion' });
    const scale = screen.getByRole('button', { name: /Scale/ });
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(chords, spread)).toBe(true);
    expect(follows(spread, inversion)).toBe(true);
    expect(follows(inversion, scale)).toBe(true);
    // Spread and Inversion share one row container, after the chord list's container.
    expect(spread.parentElement).toBe(inversion.parentElement);
    expect(chords.parentElement).not.toBe(spread.parentElement);
  });

  it('has Root active and Common tone disabled while the owner offers no mode switch', () => {
    render(<Stateful callbacks={spies()} />);
    expect(screen.getByRole('button', { name: 'Root' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Common tone' })).toBeDisabled();
  });

  it('reports hover and focus as a preview, a single click as a pin, double-click and Enter as insert', async () => {
    const user = userEvent.setup();
    const callbacks = spies();
    render(<Stateful callbacks={callbacks} />);
    const am = screen.getByRole('button', { name: 'Am' });
    await user.hover(am);
    expect(callbacks.onHover).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Am' }));
    await user.unhover(am);
    expect(callbacks.onHover).toHaveBeenLastCalledWith(null);
    expect(callbacks.onPin).not.toHaveBeenCalled();
    expect(callbacks.onInsert).not.toHaveBeenCalled();

    await user.click(am);
    expect(callbacks.onPin).toHaveBeenCalledTimes(1);
    expect(callbacks.onInsert).not.toHaveBeenCalled();

    callbacks.onPin.mockClear();
    await user.dblClick(am);
    expect(callbacks.onInsert).toHaveBeenCalledTimes(1);
    // The second click of a double-click is not another audition.
    expect(callbacks.onPin).toHaveBeenCalledTimes(1);

    callbacks.onInsert.mockClear();
    am.focus();
    expect(callbacks.onHover).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Am' }));
    await user.keyboard('{Enter}');
    expect(callbacks.onInsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Am' }));
    expect(callbacks.onPin).toHaveBeenCalledTimes(1);
  });

  it('arrow keys move over the chords and Escape closes', async () => {
    const user = userEvent.setup();
    const callbacks = spies();
    render(<Stateful callbacks={callbacks} />);
    const buttons = within(screen.getByRole('group', { name: 'Chords' })).getAllByRole('button');
    buttons[0].focus();
    await user.keyboard('{ArrowDown}');
    expect(buttons[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(buttons[0]).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(callbacks.onClose).toHaveBeenCalled();
  });

  it('Escape in a Scale fold Select does not close the picker', async () => {
    const user = userEvent.setup();
    const callbacks = spies();
    render(<Stateful callbacks={callbacks} />);
    await user.click(screen.getByRole('button', { name: /Scale/ }));
    const field = document.querySelector('input[aria-haspopup="listbox"]') as HTMLElement;
    expect(field).not.toBeNull();
    field.focus();
    await user.keyboard('{Escape}');
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('spread and inversion are parallel single-column controls that share one voicing state', async () => {
    const user = userEvent.setup();
    render(<Stateful callbacks={spies()} />);
    const spread = screen.getByRole('group', { name: 'Spread' });
    const inversion = screen.getByRole('group', { name: 'Inversion' });
    expect(
      within(spread)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['Close', 'Open', 'Drop 2', 'Drop 3']);
    expect(within(inversion).getByRole('button', { name: 'Root pos.' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(within(inversion).getByRole('button', { name: '1st inv.' }));
    await user.click(within(spread).getByRole('button', { name: 'Drop 2' }));
    expect(within(inversion).getByRole('button', { name: '1st inv.' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(spread).getByRole('button', { name: 'Drop 2' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('the Scale fold is collapsed, shows the project scale, and an override changes the offer without touching the project set', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    const frozen = JSON.stringify(project);
    render(<Stateful callbacks={spies()} seenOverride={seen} />);
    const fold = screen.getByRole('button', { name: /Scale/ });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Pitches in the scale' })).toBeNull();
    expect(chordButtons()).not.toContain('A');

    await user.click(fold);
    const chips = screen.getByRole('group', { name: 'Pitches in the scale' });
    expect(within(chips).getAllByRole('checkbox')).toHaveLength(12);
    expect(within(chips).getByRole('checkbox', { name: 'C' })).toBeChecked();
    expect(within(chips).getByRole('checkbox', { name: /^C[♯#]$/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Reset to the project scale' })).toBeDisabled();

    // C♯ on: A major (A C♯ E) now fits.
    await user.click(within(chips).getByText(/^C[♯#]$/));
    expect(chordButtons()).toContain('A');
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ edo: 12 }));
    expect(screen.getByText('(custom)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset to the project scale' }));
    expect(seen).toHaveBeenLastCalledWith(null);
    expect(chordButtons()).not.toContain('A');
    // The project's own set was never handed back to anyone to change.
    expect(JSON.stringify(project)).toBe(frozen);
  });

  it('shows an empty state when the scale has no pitches, and when no chord fits the root', () => {
    const empty: ProjectPitchSet = { ...project, pcs: [] };
    const { unmount } = render(<Stateful callbacks={spies()} pitchSet={empty} />);
    expect(screen.getByRole('status')).toHaveTextContent(/No pitches in the scale/);
    expect(screen.queryByRole('group', { name: 'Chords' })).toBeNull();
    unmount();

    // Root C♯ is not in C major: no chord is built on it.
    render(<Stateful callbacks={spies()} anchorMidicents={6100} />);
    expect(screen.getByRole('status')).toHaveTextContent(/No chord on C[♯#] fits/);
  });

  it('states the gestures', () => {
    render(<Stateful callbacks={spies()} />);
    expect(
      screen.getByText('Hover previews. Click auditions. Double-click or Enter inserts.')
    ).toBeInTheDocument();
  });
});

describe('ChordPicker hosts: one body, no host-specific props', () => {
  function Hosted({ initial }: { initial: ChordHost }) {
    const [host, setHost] = useState<ChordHost>(initial);
    return (
      <CanvasTakeoverProvider>
        <div>
          <CanvasTakeoverSlot />
          <ChordPickerHost host={host} onHostChange={setHost} onClose={() => undefined}>
            <Stateful callbacks={spies()} />
          </ChordPickerHost>
        </div>
      </CanvasTakeoverProvider>
    );
  }

  it('renders the same body in the dock and in the takeover, and the button moves it between them', async () => {
    const user = userEvent.setup();
    render(<Hosted initial="dock" />);
    const slot = () => document.querySelector('[data-slot="canvas-takeover"]') as HTMLElement;

    const dockFrame = document.querySelector('[data-chord-host="dock"]') as HTMLElement;
    expect(dockFrame).not.toBeNull();
    expect(slot().contains(dockFrame)).toBe(false);
    const dockNames = chordButtons();
    expect(within(dockFrame).getByRole('group', { name: 'Chord picker' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand over canvas' }));
    const takeoverFrame = document.querySelector('[data-chord-host="takeover"]') as HTMLElement;
    expect(takeoverFrame).not.toBeNull();
    expect(document.querySelector('[data-chord-host="dock"]')).toBeNull();
    expect(slot().contains(takeoverFrame)).toBe(true);
    expect(within(takeoverFrame).getByRole('group', { name: 'Chord picker' })).toBeInTheDocument();
    expect(chordButtons()).toEqual(dockNames);

    await user.click(screen.getByRole('button', { name: 'Dock beside roll' }));
    expect(document.querySelector('[data-chord-host="dock"]')).not.toBeNull();
  });

  it('shows the dock when a takeover is asked for but the stage has no slot', () => {
    render(
      <ChordPickerHost host="takeover" onHostChange={() => undefined}>
        <Stateful callbacks={spies()} />
      </ChordPickerHost>
    );
    expect(document.querySelector('[data-chord-host="dock"]')).not.toBeNull();
    expect(screen.getByRole('group', { name: 'Chord picker' })).toBeInTheDocument();
  });
});

describe('ChordPicker common-tone mode', () => {
  function Modal({
    mode: first = 'common',
    pitchSet = project,
    callbacks,
  }: {
    mode?: ChordPickerMode;
    pitchSet?: ProjectPitchSet;
    callbacks: ReturnType<typeof spies>;
  }) {
    const [mode, setMode] = useState<ChordPickerMode>(first);
    const [allPitches, setAllPitches] = useState(false);
    const [voicing, setVoicing] = useState<VoicingSpec>(DEFAULT_VOICING);
    return (
      <ChordPicker
        anchor={{ pitchMidicents: 6900 }}
        pitchSet={pitchSet}
        override={null}
        onOverrideChange={() => undefined}
        mode={mode}
        onModeChange={setMode}
        allPitches={allPitches}
        onAllPitchesChange={setAllPitches}
        voicing={voicing}
        onVoicingChange={setVoicing}
        {...callbacks}
      />
    );
  }
  const columnEls = () => [...document.querySelectorAll<HTMLElement>('[data-role-column]')];
  const roleOrder = () => columnEls().map((col) => col.dataset.role);
  const columnChords = (role: string) =>
    [...document.querySelector(`[data-role="${role}"]`)!.querySelectorAll('button')].map(
      (button) => button.textContent
    );
  const roleGroup = () => (columnEls().length > 0 ? columnEls() : null);

  it('shows every role the engine finds for A as columns at once, in order, no role buttons', () => {
    render(<Modal callbacks={spies()} />);
    expect(roleOrder()).toEqual(chordsWithCommonTone(project, 9).map((column) => column.role));
    expect(roleOrder()).toEqual(expect.arrayContaining(['root', '3rd', '5th']));
    expect(roleOrder().indexOf('root')).toBeLessThan(roleOrder().indexOf('3rd'));
    expect(roleOrder().indexOf('3rd')).toBeLessThan(roleOrder().indexOf('5th'));
    expect(screen.queryByRole('group', { name: 'Role of the clicked pitch' })).toBeNull();
    expect(screen.queryByRole('button', { name: '5th' })).toBeNull();
    expect(screen.getByText('A is the ...')).toBeInTheDocument();
    expect(columnChords('root')).toContain('Am');
    cleanup();
    // Only D, F and A: the one role left is the 5th; roles without chords have no column.
    render(<Modal callbacks={spies()} pitchSet={{ ...project, pcs: [2, 5, 9] }} />);
    expect(roleOrder()).toEqual(['5th']);
    expect(chordButtons()).toContain('Dm');
  });

  it('the 5th column lists Dm, Dm7 and Dm9 in order', () => {
    render(<Modal callbacks={spies()} />);
    const names = columnChords('5th');
    expect(names).toEqual(expect.arrayContaining(['Dm', 'Dm7', 'Dm9']));
    expect(names.indexOf('Dm')).toBeLessThan(names.indexOf('Dm7'));
    expect(names.indexOf('Dm7')).toBeLessThan(names.indexOf('Dm9'));
    expect(names).not.toContain('Am');
  });

  it('All pitches adds chords outside the scale (F#m has A as its 3rd)', async () => {
    const user = userEvent.setup();
    render(<Modal callbacks={spies()} />);
    expect(columnChords('3rd').some((name) => /^F[♯#]m$/.test(name!))).toBe(false);
    await user.click(screen.getByRole('checkbox', { name: 'All pitches' }));
    expect(columnChords('3rd').some((name) => /^F[♯#]m$/.test(name!))).toBe(true);
  });

  it('arrow keys move within a column and across columns, keeping the row', async () => {
    const user = userEvent.setup();
    render(<Modal callbacks={spies()} />);
    const root = within(document.querySelector<HTMLElement>('[data-role="root"]')!);
    const fifth = within(document.querySelector<HTMLElement>('[data-role="5th"]')!);
    const buttons = root.getAllByRole('button');
    buttons[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(buttons[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(buttons[0]).toHaveFocus();
    const row = 0;
    const hops = roleOrder().indexOf('5th');
    await user.keyboard('{ArrowRight}'.repeat(hops));
    expect(fifth.getAllByRole('button')[row]).toHaveFocus();
    await user.keyboard('{ArrowLeft}'.repeat(hops));
    expect(buttons[row]).toHaveFocus();
    // Clamped to the last chord of a shorter column; Down stops at the end.
    const last = buttons.length - 1;
    buttons[last]!.focus();
    await user.keyboard('{ArrowRight}');
    const next = document.activeElement as HTMLElement;
    expect(next.closest('[data-role-column]')).not.toBe(
      root.getAllByRole('button')[0]!.closest('[data-role-column]')
    );
  });

  it('ArrowRight clamps to the last chord of a shorter column and ArrowLeft keeps the row where it exists', async () => {
    const user = userEvent.setup();
    render(<Modal callbacks={spies()} />);
    const cols = columnEls().map((col) => [...col.querySelectorAll<HTMLButtonElement>('button')]);
    // A tall column followed by a strictly shorter one.
    const at = cols.findIndex((col, i) => i < cols.length - 1 && col.length > cols[i + 1]!.length);
    expect(at).toBeGreaterThanOrEqual(0);
    const tall = cols[at]!;
    const short = cols[at + 1]!;
    expect(tall.length).toBeGreaterThan(2);
    const row = tall.length - 1;
    tall[row]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(short[Math.min(row, short.length - 1)]).toHaveFocus();
    expect(short[short.length - 1]).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(tall[short.length - 1]).toHaveFocus();
  });

  it('only the current chord is a Tab stop, in both modes', async () => {
    const user = userEvent.setup();
    render(<Modal callbacks={spies()} />);
    const stops = () =>
      [...document.querySelectorAll<HTMLButtonElement>('[data-chord-button]')].filter(
        (button) => button.tabIndex === 0
      );
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toBe(document.querySelector('[data-chord-button]'));
    const all = [...document.querySelectorAll<HTMLButtonElement>('[data-chord-button]')];
    all[2]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(stops()).toHaveLength(1);
    expect(stops()[0]).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Root' }));
    expect(stops()).toHaveLength(1);
    const rootButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-chord-button]')];
    rootButtons[1]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(stops()).toHaveLength(1);
    expect(rootButtons[2]).toHaveFocus();
    expect(stops()[0]).toBe(rootButtons[2]);
    // Tab from the modes goes to the one chord stop.
    screen.getByRole('button', { name: 'Root' }).focus();
    await user.tab();
    await user.tab();
    expect(rootButtons[2]).toHaveFocus();
  });

  it('with All pitches on, a Scale chip toggles one pitch of the scale, not of the chromatic set', async () => {
    const user = userEvent.setup();
    const seen: (ProjectPitchSet | null)[] = [];
    function Common() {
      const [override, setOverride] = useState<ProjectPitchSet | null>(null);
      const [voicing, setVoicing] = useState<VoicingSpec>(DEFAULT_VOICING);
      return (
        <ChordPicker
          anchor={{ pitchMidicents: 6900 }}
          pitchSet={project}
          override={override}
          onOverrideChange={(next) => {
            seen.push(next);
            setOverride(next);
          }}
          mode="common"
          allPitches
          voicing={voicing}
          onVoicingChange={setVoicing}
          {...spies()}
        />
      );
    }
    render(<Common />);
    await user.click(screen.getByRole('button', { name: /Scale/ }));
    const group = screen.getByRole('group', { name: 'Pitches in the scale' });
    await user.click(within(group).getByRole('checkbox', { name: 'D' }));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.pcs).toEqual(project.pcs.filter((pc) => pc !== 2));
    expect(project.pcs).toContain(2);
  });

  it('the mode buttons switch between root and common tone', async () => {
    const user = userEvent.setup();
    render(<Modal mode="root" callbacks={spies()} />);
    expect(roleGroup()).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    expect(roleGroup()).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Root' }));
    expect(roleGroup()).toBeNull();
  });

  it('hover, click and Enter report the chord as in root mode', async () => {
    const user = userEvent.setup();
    const callbacks = spies();
    render(<Modal callbacks={callbacks} />);
    const am = screen.getByRole('button', { name: 'Am' });
    await user.hover(am);
    expect(callbacks.onHover).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Am' }));
    await user.click(am);
    expect(callbacks.onPin).toHaveBeenCalledTimes(1);
    am.focus();
    await user.keyboard('{Enter}');
    expect(callbacks.onInsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Am' }));
  });

  it('shows the empty-set state and the no-chord state (with a hint to try All pitches)', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Modal callbacks={spies()} pitchSet={{ ...project, pcs: [] }} />);
    expect(screen.getByText(/No pitches in the scale/)).toBeInTheDocument();
    unmount();
    // A lone C offers no chord with A in it; All pitches does.
    render(<Modal callbacks={spies()} pitchSet={{ ...project, pcs: [0] }} />);
    expect(screen.getByText(/No chord contains A in this scale/)).toBeInTheDocument();
    expect(roleGroup()).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'All pitches' }));
    expect(chordButtons().length).toBeGreaterThan(0);
  });
});
