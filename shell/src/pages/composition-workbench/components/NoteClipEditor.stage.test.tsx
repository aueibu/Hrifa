import { act, fireEvent, render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { EDITOR_STAGE_KEY } from '../editorStage';
import { resetHistory } from '../history';
import { rational } from '../musicalTime';
import { NOTE_EDITOR_PREFERENCES_KEY } from '../noteEditorPreferences';
import { CanvasTakeoverProvider, CanvasTakeoverSlot } from './canvasTakeover';
import { NoteClipEditor } from './NoteClipEditor';

// The Stage inside the clip editor (M9b): the roll and the chord picker are its two modules.
const engine = vi.hoisted(() => ({
  play: vi.fn(async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined })),
}));
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: engine.play, subscribe: () => () => undefined }),
}));

let desk: ReturnType<typeof useDesk>;

function Harness({ takeover = false }: { takeover?: boolean }) {
  desk = useDesk();
  const clip = desk.snippets[0];
  const editor = clip && <NoteClipEditor snippet={clip} />;
  return takeover ? (
    <CanvasTakeoverProvider>
      <div>
        <CanvasTakeoverSlot />
        {editor}
      </div>
    </CanvasTakeoverProvider>
  ) : (
    editor
  );
}

async function open(takeover = false) {
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <Harness takeover={takeover} />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await waitFor(() => expect(desk.loading).toBe(false));
  act(() => {
    desk.addBlankClip('notes', rational(4));
  });
  return screen.findByRole('group', { name: /Note clip piano roll/ });
}

// jsdom lays nothing out: the roll's origin is (0, 0), 64 px a quarter and 22 px a semitone.
const rowY = (midi: number) => (127 - midi) * 22 + 11;
function clickAnchor(roll: HTMLElement, midi: number, x = 70) {
  roll.focus();
  fireEvent.keyDown(roll, { key: '7' });
  fireEvent.pointerDown(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
  fireEvent.pointerUp(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
}
const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key, ...init });
const ghosts = (variant: string) =>
  document.querySelectorAll(`[data-ghost-overlay="${variant}"]`) as NodeListOf<HTMLElement>;
const chordButtons = () => [...document.querySelectorAll<HTMLButtonElement>('[data-chord-button]')];
const stopName = () => chordButtons().find((b) => b.tabIndex === 0)?.title;
/** The ids of the Stage's slots, left to right. */
const slotOrder = () =>
  [...document.querySelectorAll<HTMLElement>('section[data-slot-id]')].map((s) => s.dataset.slotId);
const slotColumnWidth = (id: string) =>
  (document.querySelector(`section[data-slot-id="${id}"]`)?.parentElement as HTMLElement).style
    .width;
const storedLayout = () => JSON.parse(localStorage.getItem(EDITOR_STAGE_KEY) ?? 'null');

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  engine.play.mockClear();
});

describe('the clip editor Stage', () => {
  it('shows the roll alone until the Chords tool is active, then the picker beside it at 30rem', async () => {
    const roll = await open();
    expect(slotOrder()).toEqual(['roll']);
    clickAnchor(roll, 69);
    expect(slotOrder()).toEqual(['roll', 'chords']);
    expect(slotColumnWidth('chords')).toBe('30rem');
    // Nothing is stored until the viewer arranges something.
    expect(localStorage.getItem(EDITOR_STAGE_KEY)).toBeNull();
  });

  it('opens an old stored dock width as the picker column width, and spends it with the first arrangement', async () => {
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify({ chordDockWidth: 640 }));
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    expect(slotColumnWidth('chords')).toBe('40rem');
    await user.click(screen.getByRole('button', { name: 'Move Chords left' }));
    expect(storedLayout().columns[0]).toMatchObject({ slots: ['chords'], width: 40 });
    expect(
      JSON.parse(localStorage.getItem(NOTE_EDITOR_PREFERENCES_KEY)!).chordDockWidth
    ).toBeNull();
  });

  it('an old stored takeover host still puts the picker in the takeover, with the roll alone on the Stage', async () => {
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify({ chordHost: 'takeover' }));
    const roll = await open(true);
    clickAnchor(roll, 69);
    const slot = document.querySelector('[data-slot="canvas-takeover"]') as HTMLElement;
    expect(slot.querySelector('[data-chord-host="takeover"]')).not.toBeNull();
    expect(slotOrder()).toEqual(['roll']);
  });

  it('a saved arrangement is restored on open', async () => {
    localStorage.setItem(
      EDITOR_STAGE_KEY,
      JSON.stringify({
        version: 1,
        columns: [
          { slots: ['chords'], width: 20 },
          { slots: ['roll'], width: 12 },
        ],
      })
    );
    const roll = await open();
    clickAnchor(roll, 69);
    expect(slotOrder()).toEqual(['chords', 'roll']);
    expect(slotColumnWidth('chords')).toBe('20rem');
  });

  it('the Stage splitter resizes the columns and the width is remembered per viewer', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    fireEvent.keyDown(screen.getByRole('separator', { name: /Resize columns of Piano roll/ }), {
      key: 'ArrowLeft',
    });
    const rollWidth = storedLayout().columns[0].width as number;
    expect(rollWidth).toBeLessThan(36);
    expect(slotColumnWidth('roll')).toBe(`${rollWidth}rem`);
  });

  it('moving the picker keeps its state (mode, voicing, pinned chord) and the keys keep working', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    roll.focus();
    press(roll, 'ArrowDown');
    const pinnedName = stopName();
    const pinnedGhosts = ghosts('pinned').length;
    expect(pinnedGhosts).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Move Chords left' }));
    expect(slotOrder()).toEqual(['chords', 'roll']);
    expect(screen.getByRole('button', { name: 'Common tone' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(stopName()).toBe(pinnedName);
    expect(ghosts('pinned')).toHaveLength(pinnedGhosts);

    // Keys with focus in the roll and in the picker, at the new position.
    roll.focus();
    press(roll, 'ArrowDown');
    expect(stopName()).not.toBe(pinnedName);
    const buttons = chordButtons();
    const current = buttons.find((b) => b.tabIndex === 0)!;
    current.focus();
    press(current, 'ArrowDown');
    expect(document.activeElement).toBe(chordButtons()[buttons.indexOf(current) + 1]);

    await user.click(screen.getByRole('button', { name: 'Move Chords right' }));
    expect(slotOrder()).toEqual(['roll', 'chords']);
    expect(storedLayout().columns.map((c: { slots: string[] }) => c.slots[0])).toEqual([
      'roll',
      'chords',
    ]);
    expect(ghosts('pinned').length).toBeGreaterThan(0);
  });

  it('the takeover takes the picker out of the Stage and switching it off returns it to its place', async () => {
    const user = userEvent.setup();
    const roll = await open(true);
    clickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: 'Move Chords left' }));
    expect(slotOrder()).toEqual(['chords', 'roll']);
    await user.click(screen.getByRole('button', { name: 'Common tone' }));

    await user.click(screen.getByRole('button', { name: 'Expand over canvas' }));
    const slot = document.querySelector('[data-slot="canvas-takeover"]') as HTMLElement;
    expect(slot.querySelector('[data-chord-host="takeover"]')).not.toBeNull();
    expect(slotOrder()).toEqual(['roll']);

    await user.click(screen.getByRole('button', { name: 'Dock beside roll' }));
    expect(slotOrder()).toEqual(['chords', 'roll']);
    expect(document.querySelector('[data-chord-host="takeover"]')).toBeNull();
    // The session lives in the editor, not in the picker: the mode survived the round trip.
    expect(screen.getByRole('button', { name: 'Common tone' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('closing the picker from its Stage strip leaves the Chords tool; the tool brings it back where it was', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: 'Move Chords left' }));
    await user.click(screen.getByRole('button', { name: 'Close Chords' }));
    expect(slotOrder()).toEqual(['roll']);
    expect(screen.getByRole('button', { name: /Tool: / })).not.toHaveTextContent('Chords');
    expect(ghosts('anchor')).toHaveLength(0);
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    expect(slotOrder()).toEqual(['chords', 'roll']);
  });

  it('the roll cannot be closed from its strip', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('button', { name: 'Close Piano roll' }));
    expect(slotOrder()).toEqual(['roll']);
  });
});
