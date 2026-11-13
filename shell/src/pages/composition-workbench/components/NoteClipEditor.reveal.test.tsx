import { act, fireEvent, render, screen, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionSettingsProvider } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { resetHistory } from '../history';
import { rational } from '../musicalTime';
import { NoteClipEditor } from './NoteClipEditor';

vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    play: async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined }),
    subscribe: () => () => undefined,
  }),
}));

// Records the `reveal` prop the roll is given, to see when the editor asks it to follow the anchor.
type Reveal = { token: number; start?: number; end?: number; pitchMidicents?: number } | null;
const seen: Reveal[] = [];
vi.mock('../../../components/PianoRoll', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../components/PianoRoll')>();
  return {
    ...original,
    PianoRoll: (props: Parameters<typeof original.PianoRoll>[0]) => {
      seen.push((props.reveal as Reveal) ?? null);
      return original.PianoRoll(props);
    },
  };
});

let desk: ReturnType<typeof useDesk>;
function Harness() {
  desk = useDesk();
  const clip = desk.snippets[0];
  return clip && <NoteClipEditor snippet={clip} />;
}

const rowY = (midi: number) => (127 - midi) * 22 + 11;
const latest = () => seen.at(-1);

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  seen.length = 0;
});

describe('the roll follows the chord anchor', () => {
  it('asks for a reveal on every key anchor move and continuous advance, not on a click', async () => {
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
    const roll = await screen.findByRole('group', { name: /Note clip piano roll/ });
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    fireEvent.pointerDown(roll, { clientX: 10, clientY: rowY(69), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 10, clientY: rowY(69), pointerId: 1 });
    // A click is on a visible point: no reveal.
    expect(latest()).toBeNull();
    fireEvent.keyDown(roll, { key: 'ArrowRight', shiftKey: true });
    const afterMove = latest();
    expect(afterMove?.token).toBe(1);
    expect(afterMove?.start).toBeCloseTo(0.5);
    fireEvent.keyDown(roll, { key: 'i' });
    fireEvent.keyDown(roll, { key: 'Enter' });
    const afterInsert = latest();
    expect(afterInsert?.token).toBe(2);
    // The anchor advanced by the chord length; the span covers this chord and the next one.
    expect(afterInsert!.start).toBeGreaterThan(afterMove!.start!);
    expect(afterInsert!.end! - afterInsert!.start!).toBeGreaterThan(0.5);
    // Many inserts walk the span along the timeline, one new token each.
    for (let index = 0; index < 8; index += 1) {
      fireEvent.keyDown(roll, { key: 'Enter' });
    }
    expect(latest()!.token).toBe(10);
    expect(latest()!.start).toBeGreaterThan(afterInsert!.start!);
  });
});
