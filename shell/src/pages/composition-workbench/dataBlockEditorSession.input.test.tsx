import { act, fireEvent, render, screen, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesEditor } from './components/NotesEditor';
import { CompositionSettingsProvider } from './compositionSettings';
import type { DataBlock } from './dataBlock';
import { DeskProvider, useDesk } from './desk';
import { resetHistory } from './history';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: async () => undefined, subscribe: () => () => undefined }),
}));

let desk: ReturnType<typeof useDesk>;

function Harness() {
  desk = useDesk();
  const dataBlock = desk.dataBlocks[0];
  return dataBlock && <NotesEditor dataBlock={dataBlock} />;
}

function seedNote(id: string, start: number, midicents: number): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: musicalPosition(start),
      interOnset: musicalDuration(1),
      duration: musicalDuration(1),
      pitches: [midicents],
      velocity: 1,
    },
    label: id,
    provenance: [],
  };
}

function seededDataBlock(): DataBlock {
  return {
    schemaVersion: 1,
    id: 'seeded',
    name: 'Seeded',
    createdAt: '2026-11-11T00:00:00Z',
    packet: {
      ...packet('events', 'note', [
        seedNote('n1', 0, 6000),
        seedNote('n2', 2, 6400),
        seedNote('n3', 4, 6700),
      ]),
      frame: {
        topology: 'linear',
        unit: 'quarterNote',
        extent: 8,
        origin: 0,
        musicalExtent: musicalDuration(8),
        musicalOrigin: musicalPosition(0),
      },
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  resetHistory();
});

describe('the ramp Escape with only the pointer in the editor', () => {
  it('ends the ramp when the pointer is inside the editor and the focus is elsewhere', async () => {
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <Harness />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addDataBlock(seededDataBlock());
    });
    const roll = await screen.findByRole('group', { name: /Notes piano roll/ });
    act(() => screen.getByRole('radio', { name: 'Paint' }).click());
    const track = screen.getByRole('group', { name: 'Velocity lane' });
    const lane = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', x: number, y: number) =>
      fireEvent[type](track, { clientX: x, clientY: y, pointerId: 1 });
    lane('pointerDown', 0, 8);
    lane('pointerMove', 256, 76);
    lane('pointerUp', 256, 76);
    expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    try {
      outside.focus();
      // Neither the focus nor the pointer is in the editor: ignored.
      fireEvent.keyDown(outside, { key: 'Escape' });
      expect(screen.getByTestId('velocity-ramp')).toBeInTheDocument();
      // The pointer enters the editor; the focus stays outside: Escape now ends the ramp.
      fireEvent.pointerOver(roll);
      expect(document.activeElement).toBe(outside);
      fireEvent.keyDown(outside, { key: 'Escape' });
      expect(screen.queryByTestId('velocity-ramp')).toBeNull();
    } finally {
      outside.remove();
    }
  });
});
