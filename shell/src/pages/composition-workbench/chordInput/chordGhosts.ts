/**
 * The ghost notes the Chords tool draws on a roll (hover cell, anchor, hovered and pinned chord),
 * from the chord session's values. Pure: the roll host feeds the result to the PianoRoll's
 * `ghostNotes`. Moved verbatim from the note clip editor (M4a).
 */
import type { PianoRollProps } from '../../../components/PianoRoll';
import { pitchLabel } from '../routeTreatments';
import type { ChordPickerMode } from './ChordPicker';
import type { Chord } from './chords';
import type { ChordAnchor, ChordCell } from './chordSession';
import { pitchClassOf, voiceAtAnchor } from './placement';
import type { VoicingSpec } from './voicing';

export type ChordGhostNotes = NonNullable<PianoRollProps['ghostNotes']>;

export interface ChordGhostInput {
  anchor: ChordAnchor | null;
  hoverCell: ChordCell | null;
  hoverChord: Chord | null;
  pinnedChord: Chord | null;
  voicing: VoicingSpec;
  /** The stored mode and whether Ctrl/Cmd+click opened common-tone mode for this click. */
  mode: ChordPickerMode;
  ctrlOpen: boolean;
  edo: number;
  entryLength: number | null | undefined;
  labelPlacement: 'on-note' | 'side';
}

export function buildChordGhosts(input: ChordGhostInput): ChordGhostNotes | undefined {
  const { anchor, hoverCell, hoverChord, pinnedChord, voicing, edo } = input;
  const effectiveMode: ChordPickerMode = input.ctrlOpen ? 'common' : input.mode;
  // The length of a placed chord and of its ghosts: the length the viewer last entered a note with,
  // else one grid step at the anchor.
  const chordLength = anchor?.note?.duration ?? input.entryLength ?? anchor?.step ?? 1;
  // Common-tone mode anchors the chord tone that has the clicked pitch class; root mode anchors the root.
  const anchorPc =
    effectiveMode === 'common' && anchor ? pitchClassOf(anchor.pitchMidicents, edo) : undefined;
  // One grid step under the pointer, before any click. Not shown while a picker chord is hovered
  // (its own ghosts are), nor over the anchor cell (the anchor ghost is there).
  // A note anchor covers its whole span and pitch row (also an off-grid or microtonal note's).
  const onAnchorCell =
    hoverCell !== null &&
    anchor !== null &&
    (anchor.note
      ? (Math.abs(hoverCell.pitchMidicents - anchor.pitchMidicents) <= 50 ||
          Math.abs(hoverCell.pitchMidicents - anchor.note.pitchMidicents) <= 50) &&
        hoverCell.start < anchor.start + anchor.note.duration - 1e-9 &&
        hoverCell.start + hoverCell.step > anchor.start + 1e-9
      : hoverCell.start === anchor.start && hoverCell.pitchMidicents === anchor.pitchMidicents);
  const cellGhost: ChordGhostNotes =
    hoverCell && !hoverChord && !onAnchorCell
      ? [
          {
            pitchMidicents: hoverCell.pitchMidicents,
            start: hoverCell.start,
            duration: hoverCell.step,
            variant: 'hover',
          },
        ]
      : [];
  if (!anchor) {
    return cellGhost.length > 0 ? cellGhost : undefined;
  }
  const ghosts: ChordGhostNotes = [
    ...cellGhost,
    {
      pitchMidicents: anchor.pitchMidicents,
      start: anchor.start,
      duration: chordLength,
      variant: 'anchor',
      label: pitchLabel(anchor.pitchMidicents),
      labelPlacement: input.labelPlacement,
    },
  ];
  const shown: [Chord | null, 'pinned' | 'hover'][] = [
    [pinnedChord, 'pinned'],
    [hoverChord && hoverChord.name === pinnedChord?.name ? null : hoverChord, 'hover'],
  ];
  shown.forEach(([chord, variant]) => {
    if (chord) {
      voiceAtAnchor(chord, anchor.pitchMidicents, voicing, anchorPc).forEach((pitchMidicents) =>
        ghosts.push({
          pitchMidicents,
          start: anchor.start,
          duration: chordLength,
          variant,
        })
      );
    }
  });
  return ghosts;
}
