import { act, fireEvent, render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { DEVELOPER_OPTIONS_KEY } from '../developerOptions';
import { resetHistory, undo } from '../history';
import type { NoteEventValue } from '../melodicization';
import { rational, rationalToNumber } from '../musicalTime';
import { NoteClipEditor } from './NoteClipEditor';

// The audition path: a stand-in audio engine that makes no sound and records what was played.
const engine = vi.hoisted(() => ({
  play: vi.fn(async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined })),
}));
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: engine.play, subscribe: () => () => undefined }),
}));

const anchors = vi.fn();
let desk: ReturnType<typeof useDesk>;

function Harness() {
  desk = useDesk();
  const clip = desk.snippets[0];
  return clip && <NoteClipEditor snippet={clip} onChordAnchor={anchors} />;
}

async function open() {
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <Harness />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await waitFor(() => expect(desk.loading).toBe(false));
  act(() => {
    desk.addBlankClip('notes', rational(4));
  });
  return screen.findByRole('group', { name: /Note clip piano roll/ });
}

// jsdom lays nothing out: the roll's origin is (0, 0), 64 px a quarter (half-quarter grid steps)
// and 22 px a semitone.
const rowY = (midi: number) => (127 - midi) * 22 + 11;

/** Selects the Chords tool and clicks the roll at a pitch (midi) and an x. */
function clickAnchor(roll: HTMLElement, midi: number, x = 70) {
  roll.focus();
  fireEvent.keyDown(roll, { key: '7' });
  fireEvent.pointerDown(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
  fireEvent.pointerUp(roll, { clientX: x, clientY: rowY(midi), pointerId: 1 });
}

const pitches = () =>
  desk.snippets[0].packet.items
    .map((item) => item.value as NoteEventValue)
    .flatMap((value) => value.pitches.map((pitch) => ({ pitch, onset: value.onset })))
    .sort((a, b) => a.pitch - b.pitch);
const noteCount = () => desk.snippets[0].packet.items.length;
const ghosts = (variant: string) =>
  document.querySelectorAll(`[data-ghost-overlay="${variant}"]`) as NodeListOf<HTMLElement>;
const chord = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  engine.play.mockClear();
  anchors.mockClear();
});

const onsets = () =>
  [...new Set(pitches().map((entry) => rationalToNumber(entry.onset.quarterNotes)))].sort(
    (a, b) => a - b
  );
const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key, ...init });
const chordNames = () =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-chord-button]')].map(
    (button) => button.title
  );
const stopName = () =>
  [...document.querySelectorAll<HTMLButtonElement>('[data-chord-button]')].find(
    (button) => button.tabIndex === 0
  )?.title;
const pressed = (name: string) =>
  screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true';
/** A second click on the roll (the tool is already active). */
const reclick = (roll: HTMLElement, midi: number, init: PointerEventInit = {}) => {
  const at = { clientX: 70, clientY: rowY(midi), pointerId: 1, ...init };
  fireEvent.pointerDown(roll, at);
  fireEvent.pointerUp(roll, at);
};

describe('sticky mode', () => {
  it('Common tone then a plain click opens common-tone mode; Root then a plain click opens root mode', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    reclick(roll, 69);
    expect(screen.getByText(/Chords containing A/)).toBeInTheDocument();
    reclick(roll, 69);
    expect(screen.getByText(/Chords containing A/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Root' }));
    reclick(roll, 69);
    expect(screen.getByText(/Chords on A/)).toBeInTheDocument();
  });

  it('Ctrl+click opens common-tone mode for that click only; the stored mode is unchanged', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    reclick(roll, 69, { ctrlKey: true });
    expect(screen.getByText(/Chords containing A/)).toBeInTheDocument();
    expect(pressed('Common tone')).toBe(true);
    reclick(roll, 69);
    expect(screen.getByText(/Chords on A/)).toBeInTheDocument();
    expect(pressed('Root')).toBe(true);
  });

  it('with Common tone stored, a Ctrl+click stays common and the Root button then sticks', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    reclick(roll, 69, { ctrlKey: true });
    await user.click(screen.getByRole('button', { name: 'Root' }));
    reclick(roll, 69, { ctrlKey: true });
    expect(screen.getByText(/Chords containing A/)).toBeInTheDocument();
    reclick(roll, 69);
    expect(screen.getByText(/Chords on A/)).toBeInTheDocument();
  });
});

describe('the Chords tool key map', () => {
  it('arrows browse the chord array from roll focus and from picker focus, pinning the ghost', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    const names = chordNames();
    expect(stopName()).toBe(names[0]);
    roll.focus();
    press(roll, 'ArrowDown');
    expect(stopName()).toBe(names[1]);
    expect(ghosts('pinned').length).toBeGreaterThan(0);
    press(roll, 'ArrowRight');
    expect(stopName()).toBe(names[2]);
    press(roll, 'ArrowUp');
    expect(stopName()).toBe(names[1]);
    // From the picker: focus follows.
    const first = chord(names[0]!);
    first.focus();
    press(first, 'ArrowDown');
    expect(chord(names[1]!)).toHaveFocus();
    expect(noteCount()).toBe(0);
  });

  it('arrows move across the columns in common-tone mode from the roll', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    const columns = [...document.querySelectorAll<HTMLElement>('[data-role-column]')];
    const firstOfSecond = columns[1]!.querySelector<HTMLElement>('[data-chord-button]')!;
    const firstOfFirst = columns[0]!.querySelector<HTMLElement>('[data-chord-button]')!;
    expect(firstOfFirst.tabIndex).toBe(0);
    roll.focus();
    press(roll, 'ArrowRight');
    expect(firstOfSecond.tabIndex).toBe(0);
  });

  it('Enter inserts the current chord from roll focus (one undo step) and from picker focus', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    press(roll, 'Enter');
    expect(pitches().map((entry) => entry.pitch)).toEqual([6900, 7200, 7600]);
    act(() => undo());
    expect(noteCount()).toBe(0);
    clickAnchor(roll, 69);
    const second = chordNames()[1]!;
    press(roll, 'ArrowDown');
    press(roll, 'Enter');
    expect(noteCount()).toBeGreaterThan(0);
    expect(ghosts('pinned')).toHaveLength(0);
    act(() => undo());
    expect(noteCount()).toBe(0);
    // From picker focus the button's own Enter inserts that chord once.
    clickAnchor(roll, 69);
    const button = chord(second);
    button.focus();
    press(button, 'Enter');
    expect(noteCount()).toBeGreaterThan(0);
    act(() => undo());
    expect(noteCount()).toBe(0);
  });

  it('Alt+Up/Down steps the inversion and Alt+Left/Right the spread, cycling, like the buttons', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    expect(pressed('Root pos.')).toBe(true);
    press(roll, 'ArrowUp', { altKey: true });
    expect(pressed('1st inv.')).toBe(true);
    press(roll, 'ArrowUp', { altKey: true });
    expect(pressed('2nd inv.')).toBe(true);
    // A triad has three inversions: past the last it wraps to root position, and back.
    press(roll, 'ArrowUp', { altKey: true });
    expect(pressed('Root pos.')).toBe(true);
    press(roll, 'ArrowDown', { altKey: true });
    expect(pressed('2nd inv.')).toBe(true);
    press(roll, 'ArrowDown', { altKey: true });
    press(roll, 'ArrowDown', { altKey: true });
    expect(pressed('Root pos.')).toBe(true);
    press(roll, 'ArrowRight', { altKey: true });
    expect(pressed('Open')).toBe(true);
    press(roll, 'ArrowRight', { altKey: true });
    expect(pressed('Drop 2')).toBe(true);
    press(roll, 'ArrowRight', { altKey: true });
    expect(pressed('Drop 3')).toBe(true);
    press(roll, 'ArrowRight', { altKey: true });
    expect(pressed('Close')).toBe(true);
    press(roll, 'ArrowLeft', { altKey: true });
    expect(pressed('Drop 3')).toBe(true);
    // From picker focus too, and the ghost follows.
    const first = chord(chordNames()[0]!);
    first.focus();
    press(first, 'ArrowLeft', { altKey: true });
    press(first, 'ArrowLeft', { altKey: true });
    expect(pressed('Open')).toBe(true);
    expect(ghosts('pinned').length).toBeGreaterThan(0);
  });

  it('Shift+arrows move the anchor and the chord list recomputes (A to A#)', async () => {
    const roll = await open();
    clickAnchor(roll, 69, 10);
    roll.focus();
    const before = chordNames();
    expect(screen.getByText(/Chords on A \(A4\)/)).toBeInTheDocument();
    press(roll, 'ArrowUp', { shiftKey: true });
    // A# is not in C major: the offer changes (here to the empty state).
    expect(screen.getByText(/Chords on A#/)).toBeInTheDocument();
    expect(chordNames()).not.toEqual(before);
    press(roll, 'ArrowUp', { shiftKey: true });
    expect(screen.getByText(/Chords on B \(B4\)/)).toBeInTheDocument();
    expect(chordNames().length).toBeGreaterThan(0);
    expect(ghosts('pinned').length).toBeGreaterThan(0);
    press(roll, 'ArrowDown', { shiftKey: true });
    press(roll, 'ArrowDown', { shiftKey: true });
    expect(screen.getByText(/Chords on A \(A4\)/)).toBeInTheDocument();
    expect(chordNames()).toEqual(before);
    // Time: never before 0, then by the grid step (a half quarter here).
    press(roll, 'ArrowLeft', { shiftKey: true });
    press(roll, 'Enter');
    expect(onsets()).toEqual([0]);
    clickAnchor(roll, 69, 10);
    press(roll, 'ArrowRight', { shiftKey: true });
    press(roll, 'Enter');
    expect(onsets()).toEqual([0, 0.5]);
  });

  it('Shift+Up stops at the top of the roll', async () => {
    const roll = await open();
    clickAnchor(roll, 127, 10);
    roll.focus();
    const before = screen.getByText(/Chords on/).textContent;
    press(roll, 'ArrowUp', { shiftKey: true });
    expect(screen.getByText(/Chords on/).textContent).toBe(before);
  });

  it('keys follow the preview gate: click mode sounds on navigation and voicing', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    press(roll, 'ArrowDown');
    await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
    press(roll, 'ArrowUp', { altKey: true });
    await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(2));
  });

  it('in ctrl-click mode the keys pin the ghost without sound', async () => {
    localStorage.setItem(DEVELOPER_OPTIONS_KEY, JSON.stringify({ chordPreviewGate: 'ctrl-click' }));
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    press(roll, 'ArrowDown');
    press(roll, 'ArrowUp', { altKey: true });
    press(roll, 'ArrowUp', { shiftKey: true });
    press(roll, 'ArrowUp', { shiftKey: true });
    expect(ghosts('pinned').length).toBeGreaterThan(0);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('fires nothing while typing in an input, and nothing when the tool is not Chords', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    const input = document.createElement('input');
    roll.parentElement!.appendChild(input);
    input.focus();
    press(input, 'i');
    press(input, 'Enter');
    press(input, 'ArrowDown', { altKey: true });
    expect(pressed('Continuous')).toBe(false);
    expect(pressed('Root pos.')).toBe(true);
    expect(noteCount()).toBe(0);
    input.remove();
    // Another tool: the picker is gone and these keys do not insert or toggle anything.
    roll.focus();
    press(roll, '1');
    press(roll, 'i');
    press(roll, 'Enter');
    press(roll, 'ArrowRight', { shiftKey: true });
    expect(noteCount()).toBe(0);
    expect(document.querySelector('[data-chord-picker]')).toBeNull();
  });

  it('Esc still closes the picker', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    press(roll, 'Escape');
    expect(document.querySelector('[data-chord-picker]')).toBeNull();
  });

  it('lists the shortcuts in a hint line and a ? button', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    expect(screen.getByText(/Keys: arrows browse/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});

describe('continuous insert', () => {
  it('the I key and the toggle switch it', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    expect(pressed('Continuous')).toBe(false);
    roll.focus();
    press(roll, 'i');
    expect(pressed('Continuous')).toBe(true);
    press(roll, 'I');
    expect(pressed('Continuous')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Continuous' }));
    expect(pressed('Continuous')).toBe(true);
  });

  it('on: Enter inserts, the anchor moves on by the chord length, the next Enter inserts there; one undo step each', async () => {
    const roll = await open();
    clickAnchor(roll, 69, 10);
    roll.focus();
    press(roll, 'i');
    press(roll, 'Enter');
    expect(noteCount()).toBe(3);
    expect(onsets()).toEqual([0]);
    // The chord stays pinned, now at the next step.
    expect(ghosts('pinned').length).toBeGreaterThan(0);
    press(roll, 'Enter');
    expect(noteCount()).toBe(6);
    expect(onsets()).toEqual([0, 0.5]);
    act(() => undo());
    expect(onsets()).toEqual([0]);
    expect(noteCount()).toBe(3);
    act(() => undo());
    expect(noteCount()).toBe(0);
  });

  it('keeps the voicing and the chord: the second insert is the same chord and inversion', async () => {
    const roll = await open();
    clickAnchor(roll, 69, 10);
    roll.focus();
    press(roll, 'ArrowUp', { altKey: true });
    press(roll, 'i');
    press(roll, 'Enter');
    press(roll, 'Enter');
    const at = (onset: number) =>
      pitches()
        .filter((entry) => rationalToNumber(entry.onset.quarterNotes) === onset)
        .map((entry) => entry.pitch);
    expect(at(0.5)).toEqual(at(0));
    expect(at(0)).not.toEqual([6900, 7200, 7600]);
  });

  it('Enter on a focused chord button advances too', async () => {
    const roll = await open();
    clickAnchor(roll, 69, 10);
    press(roll, 'i');
    const button = chord(chordNames()[0]!);
    button.focus();
    press(button, 'Enter');
    press(button, 'Enter');
    expect(onsets()).toEqual([0, 0.5]);
  });

  it('off: the anchor stays, so a second Enter adds nothing new', async () => {
    const roll = await open();
    clickAnchor(roll, 69, 10);
    roll.focus();
    press(roll, 'Enter');
    press(roll, 'Enter');
    expect(onsets()).toEqual([0]);
    expect(noteCount()).toBe(3);
  });
});

describe('review fixes (M6d)', () => {
  it('a second Enter at the same anchor writes no empty undo step', async () => {
    const roll = await open();
    clickAnchor(roll, 69, 10);
    roll.focus();
    press(roll, 'Enter');
    press(roll, 'Enter');
    expect(noteCount()).toBe(3);
    act(() => undo());
    expect(noteCount()).toBe(0);
  });

  it('ignores key repeat for Enter and I', async () => {
    const roll = await open();
    clickAnchor(roll, 69, 10);
    roll.focus();
    press(roll, 'i');
    press(roll, 'i', { repeat: true });
    expect(pressed('Continuous')).toBe(true);
    press(roll, 'Enter');
    press(roll, 'Enter', { repeat: true });
    expect(onsets()).toEqual([0]);
  });

  it('repeated arrows still navigate but do not sound', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    const before = stopName();
    press(roll, 'ArrowDown', { repeat: true });
    expect(ghosts('pinned').length).toBeGreaterThan(0);
    expect(stopName()).not.toBe(before);
    press(roll, 'ArrowUp', { shiftKey: true, repeat: true });
    expect(screen.getByText(/Chords on A#/)).toBeInTheDocument();
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('leaves arrows alone on a splitter or an accordion header, even with the picker open', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    const separator = document.createElement('div');
    separator.setAttribute('role', 'separator');
    separator.tabIndex = 0;
    document.body.appendChild(separator);
    const before = chordNames();
    const taken = fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(taken).toBe(true);
    const header = document.createElement('button');
    header.className = 'mantine-Accordion-control';
    document.body.appendChild(header);
    expect(fireEvent.keyDown(header, { key: 'ArrowDown' })).toBe(true);
    expect(chordNames()).toEqual(before);
    separator.remove();
    header.remove();
  });

  it('suppresses the Alt keyup after a handled Alt+arrow wherever focus is, but not a later plain Alt', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    press(roll, 'ArrowUp', { altKey: true });
    expect(fireEvent.keyUp(document.body, { key: 'Alt' })).toBe(false);
    expect(fireEvent.keyUp(document.body, { key: 'Alt' })).toBe(true);
  });
});

describe('Shift+Up/Down moves one EDO step', () => {
  const withEdo = (edo: number) =>
    localStorage.setItem(
      'hrifa.composition-workbench.settings.v1',
      JSON.stringify({ version: 1, edo })
    );
  it.each([12, 19, 31, 5])(
    'at %i-EDO the anchor moves by 1200/edo cents per press',
    async (edo) => {
      withEdo(edo);
      const roll = await open();
      clickAnchor(roll, 69, 10);
      roll.focus();
      const at = () => anchors.mock.calls.at(-1)![0].pitchMidicents as number;
      const start = at();
      press(roll, 'ArrowUp', { shiftKey: true });
      expect(at()).toBeCloseTo(start + 1200 / edo, 5);
      press(roll, 'ArrowDown', { shiftKey: true });
      press(roll, 'ArrowDown', { shiftKey: true });
      expect(at()).toBeCloseTo(start - 1200 / edo, 5);
    }
  );
});

describe('Alt+Up/Down inversion (hands-on report)', () => {
  const inversionPressed = () =>
    ['Root pos.', '1st inv.', '2nd inv.', '3rd inv.']
      .filter((name) => screen.queryByRole('button', { name }))
      .filter((name) => pressed(name));

  /** Inserts a chord (its notes are then selected), then opens the picker again at a pitch. */
  async function withSelectedNote(common: boolean) {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    press(roll, 'Enter');
    expect(noteCount()).toBe(3);
    if (common) {
      await user.click(screen.getByRole('button', { name: 'Common tone' }));
    }
    reclick(roll, 72);
    roll.focus();
    return roll;
  }

  it.each([
    ['root', false],
    ['common-tone', true],
  ])(
    'changes the inversion in %s mode with a note selected, never transposing it',
    async (_n, common) => {
      const roll = await withSelectedNote(common);
      const before = pitches();
      const sources: [string, () => Element][] = [
        ['roll', () => roll],
        ['picker', () => document.querySelector('[data-chord-button]')!],
        ['body', () => document.body],
      ];
      for (const [, source] of sources) {
        const start = inversionPressed();
        const target = source();
        if (target instanceof HTMLElement) {
          target.focus();
        }
        expect(fireEvent.keyDown(target, { key: 'ArrowUp', altKey: true })).toBe(false);
        expect(inversionPressed()).not.toEqual(start);
        expect(fireEvent.keyDown(target, { key: 'ArrowDown', altKey: true })).toBe(false);
        expect(inversionPressed()).toEqual(start);
      }
      expect(pitches()).toEqual(before);
    }
  );

  it('always consumes the key, even when the voicing cannot change', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    // A global capture listener stands in for anything else that would act on the key.
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    expect(fireEvent.keyDown(roll, { key: 'ArrowUp', altKey: true })).toBe(false);
    expect(seen).not.toHaveBeenCalled();
    window.removeEventListener('keydown', seen);
  });

  it('every Alt+Up/Down press moves the ghost, even when the list holds longer chords', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    const shape = () => [...ghosts('pinned')].map((ghost) => ghost.getAttribute('style')).join('|');
    press(roll, 'ArrowDown');
    // The chord's own tone count is its number of inversions (the list's longest chord has more).
    const tones = ghosts('pinned').length;
    const seen = [shape()];
    for (let index = 0; index < tones; index += 1) {
      press(roll, 'ArrowUp', { altKey: true });
      seen.push(shape());
    }
    expect(new Set(seen.slice(0, tones)).size).toBe(tones);
    expect(seen[tones]).toBe(seen[0]);
  });
});

describe('the current chord is marked (data-current)', () => {
  const current = () =>
    [...document.querySelectorAll<HTMLElement>('[data-chord-button][data-current]')].map(
      (button) => button.dataset.chordKey
    );

  it('follows arrow navigation from the roll without DOM focus on the chord, in the root grid', async () => {
    const roll = await open();
    clickAnchor(roll, 69);
    const names = chordNames();
    expect(current()).toEqual([names[0]]);
    roll.focus();
    press(roll, 'ArrowDown');
    expect(current()).toEqual([names[1]]);
    expect(chord(names[1]!)).toHaveAttribute('aria-current', 'true');
    expect(chord(names[1]!)).not.toHaveFocus();
    press(roll, 'ArrowRight');
    expect(current()).toEqual([names[2]]);
  });

  it('follows navigation in the common-tone columns and a click', async () => {
    const user = userEvent.setup();
    const roll = await open();
    clickAnchor(roll, 69);
    await user.click(screen.getByRole('button', { name: 'Common tone' }));
    const columns = [...document.querySelectorAll<HTMLElement>('[data-role-column]')];
    const inFirst = columns[0]!.querySelectorAll<HTMLElement>('[data-chord-button]');
    expect(current()).toEqual([inFirst[0]!.dataset.chordKey]);
    roll.focus();
    press(roll, 'ArrowDown');
    expect(current()).toEqual([inFirst[1]!.dataset.chordKey]);
    press(roll, 'ArrowRight');
    expect(current()).toHaveLength(1);
    expect(columns[1]!.querySelector('[data-current]')).not.toBeNull();
    const last = columns[0]!.querySelectorAll<HTMLElement>('[data-chord-button]')[2]!;
    await user.click(last);
    expect(current()).toEqual([last.dataset.chordKey]);
  });

  it('scrolls the current chord into view when navigation moves it', async () => {
    const scroll = vi.fn();
    const had = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    HTMLElement.prototype.scrollIntoView = scroll;
    const roll = await open();
    clickAnchor(roll, 69);
    roll.focus();
    scroll.mockClear();
    press(roll, 'ArrowDown');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(scroll.mock.contexts.at(-1)).toBe(chord(chordNames()[1]!));
    if (had) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', had);
    } else {
      // @ts-expect-error restoring jsdom's absence of the method
      delete HTMLElement.prototype.scrollIntoView;
    }
  });
});

describe('the hover cell ghost after a keyboard anchor move', () => {
  it('Shift+Right moves only the anchor ghost: one ghost at the new anchor, none at the old point', async () => {
    const roll = await open();
    const point = { clientX: 70, clientY: rowY(69), pointerId: 1 };
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    fireEvent.pointerMove(roll, point);
    fireEvent.pointerDown(roll, point);
    fireEvent.pointerUp(roll, point);
    fireEvent.pointerMove(roll, point);
    const before = [...ghosts('anchor')].map((ghost) => ghost.getAttribute('style'));
    expect(before).toHaveLength(1);
    press(roll, 'ArrowRight', { shiftKey: true });
    expect(ghosts('hover')).toHaveLength(0);
    expect(ghosts('anchor')).toHaveLength(1);
    expect(ghosts('anchor')[0]!.getAttribute('style')).not.toBe(before[0]);
    // The still pointer re-reporting the old cell shows nothing; another cell shows again.
    fireEvent.pointerMove(roll, point);
    expect(ghosts('hover')).toHaveLength(0);
    fireEvent.pointerMove(roll, { ...point, clientY: rowY(72) });
    expect(ghosts('hover')).toHaveLength(1);
  });
});
