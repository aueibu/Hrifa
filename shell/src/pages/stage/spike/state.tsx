/**
 * Spike demo state shared by the realistic modules and the inspector: a few demo notes and clips and the current
 * selection. It is a React context provided above both the Stage and the inspector region, so a module in a portal and
 * a panel outside the Stage read the same thing. A module reads this (what is selected), never where it sits.
 * Throwaway: a real app would hold project state elsewhere.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface DemoNote {
  id: string;
  /** The clip the note belongs to (shown above the note in the inspector). */
  clipId: string;
  start: number;
  duration: number;
  /** MIDI note number (60 = middle C). */
  pitch: number;
  /** 0 to 1. */
  velocity: number;
  muted: boolean;
}

export type ClipMode = 'Ionian' | 'Dorian' | 'Aeolian';
export type ClipGrid = '1/4' | '1/8' | '1/16';

export interface DemoClip {
  id: string;
  name: string;
  bars: number;
  mode: ClipMode;
  grid: ClipGrid;
  loop: boolean;
}

export type Selection = { kind: 'note'; ids: string[] } | { kind: 'clip'; id: string } | null;

/**
 * The demo timeline is one row of clips in quarters: Verse bars 1 to 4 (0 to 16), Chorus bars 5 to 12 (16 to 48) and
 * Bridge bars 13 to 14 (48 to 56). Each note sits inside its clip's span.
 */
export const DEMO_NOTES: readonly DemoNote[] = [
  { id: 'n1', clipId: 'c1', start: 0, duration: 1, pitch: 60, velocity: 0.8, muted: false },
  { id: 'n2', clipId: 'c1', start: 4, duration: 1, pitch: 64, velocity: 0.7, muted: false },
  { id: 'n3', clipId: 'c1', start: 8, duration: 2, pitch: 67, velocity: 0.9, muted: false },
  { id: 'n4', clipId: 'c2', start: 16, duration: 1, pitch: 65, velocity: 0.6, muted: false },
  { id: 'n5', clipId: 'c2', start: 24, duration: 1, pitch: 62, velocity: 0.75, muted: false },
  { id: 'n6', clipId: 'c2', start: 32, duration: 2, pitch: 59, velocity: 0.85, muted: false },
  { id: 'n7', clipId: 'c3', start: 48, duration: 2, pitch: 57, velocity: 0.7, muted: false },
  { id: 'n8', clipId: 'c3', start: 52, duration: 2, pitch: 60, velocity: 0.8, muted: false },
];

export const DEMO_CLIPS: readonly DemoClip[] = [
  { id: 'c1', name: 'Verse', bars: 4, mode: 'Ionian', grid: '1/8', loop: false },
  { id: 'c2', name: 'Chorus', bars: 8, mode: 'Dorian', grid: '1/8', loop: true },
  { id: 'c3', name: 'Bridge', bars: 2, mode: 'Aeolian', grid: '1/16', loop: false },
];

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** "C4" for MIDI 60. */
export const pitchName = (pitch: number): string =>
  `${NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;

export interface SpikeState {
  notes: DemoNote[];
  clips: DemoClip[];
  selection: Selection;
  select(next: Selection): void;
  /** Asks the roll to bring a clip's notes into view (canvas to roll); `nonce` makes a repeat request count. */
  rollFocus: { clipId: string; nonce: number } | null;
  focusClip(clipId: string): void;
  updateNote(id: string, patch: Partial<Omit<DemoNote, 'id'>>): void;
  deleteNote(id: string): void;
  resetNote(id: string): void;
  updateClip(id: string, patch: Partial<Omit<DemoClip, 'id'>>): void;
  resetClip(id: string): void;
  duplicateClip(id: string): void;
}

const SpikeContext = createContext<SpikeState | null>(null);

export function useSpike(): SpikeState {
  const v = useContext(SpikeContext);
  if (!v) {
    throw new Error('useSpike needs a SpikeProvider');
  }
  return v;
}

function withoutId(ids: string[], id: string): Selection {
  const rest = ids.filter((x) => x !== id);
  return rest.length > 0 ? { kind: 'note', ids: rest } : null;
}

export function SpikeProvider({
  children,
  initialSelection = null,
}: {
  children: ReactNode;
  initialSelection?: Selection;
}) {
  const [notes, setNotes] = useState<DemoNote[]>(() => DEMO_NOTES.map((n) => ({ ...n })));
  const [clips, setClips] = useState<DemoClip[]>(() => DEMO_CLIPS.map((c) => ({ ...c })));
  const [selection, select] = useState<Selection>(initialSelection);
  const [rollFocus, setRollFocus] = useState<{ clipId: string; nonce: number } | null>(null);
  const focusClip = useCallback(
    (clipId: string) => setRollFocus((f) => ({ clipId, nonce: (f?.nonce ?? 0) + 1 })),
    []
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<Omit<DemoNote, 'id'>>) =>
      setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n))),
    []
  );
  const deleteNote = useCallback((id: string) => {
    setNotes((ns) => ns.filter((n) => n.id !== id));
    select((s) => (s?.kind === 'note' ? withoutId(s.ids, id) : s));
  }, []);
  const resetNote = useCallback((id: string) => {
    const original = DEMO_NOTES.find((n) => n.id === id);
    if (original) {
      setNotes((ns) => ns.map((n) => (n.id === id ? { ...original } : n)));
    }
  }, []);
  const updateClip = useCallback(
    (id: string, patch: Partial<Omit<DemoClip, 'id'>>) =>
      setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    []
  );
  const resetClip = useCallback((id: string) => {
    const original = DEMO_CLIPS.find((c) => c.id === id);
    if (original) {
      setClips((cs) => cs.map((c) => (c.id === id ? { ...original } : c)));
    }
  }, []);
  const duplicateClip = useCallback((id: string) => {
    setClips((cs) => {
      const src = cs.find((c) => c.id === id);
      if (!src) {
        return cs;
      }
      return [...cs, { ...src, id: `c${cs.length + 1}-copy`, name: `${src.name} copy` }];
    });
  }, []);

  const value = useMemo<SpikeState>(
    () => ({
      notes,
      clips,
      selection,
      select,
      rollFocus,
      focusClip,
      updateNote,
      deleteNote,
      resetNote,
      updateClip,
      resetClip,
      duplicateClip,
    }),
    [
      notes,
      clips,
      selection,
      rollFocus,
      focusClip,
      updateNote,
      deleteNote,
      resetNote,
      updateClip,
      resetClip,
      duplicateClip,
    ]
  );
  return <SpikeContext.Provider value={value}>{children}</SpikeContext.Provider>;
}
