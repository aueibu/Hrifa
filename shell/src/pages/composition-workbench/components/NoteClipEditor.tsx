import { useMemo, useState } from 'react';
import { Badge, Text, Title } from '@mantine/core';
import type { EditorAction, EditorTool } from '../../../components/EditorPalette';
import {
  defaultPianoRollView,
  PianoRoll,
  type PianoRollGridLine,
  type PianoRollNewNote,
  type PianoRollRange,
  type PianoRollViewState,
} from '../../../components/PianoRoll';
import { registerClipEditor, type ClipEditorProps } from '../clipTypes';
import { useCompositionSettings } from '../compositionSettings';
import { useDesk } from '../desk';
import type { DataPacket } from '../model';
import {
  addNote,
  changeVelocity,
  clipExtent,
  clipRollDuration,
  deleteNotes,
  moveNotes,
  newNoteItemId,
  NOTE_EDIT_OPERATION,
  packetRollNotes,
  resizeNotes,
} from '../noteClipEdits';
import {
  emptyNoteSelection,
  extendRange,
  followEdit,
  pruneSelection,
  selectIds,
  type NoteSelection,
} from '../noteSelection';
import { parseMeter } from '../transport';
import classes from './NoteClipEditor.module.css';

/** The editor id the Notes clip type names (clipTypes.ts). */
export const NOTE_EDITOR_ID = 'note-roll';

const VELOCITY_STEP = 0.1;

/** The grid is drawn this far (quarter notes) whatever the clip's length, so a wide view is covered. */
const GRID_REACH = 256;

const tools: EditorTool[] = [
  { id: 'select', label: 'Select', shortcut: 'v' },
  { id: 'draw', label: 'Draw', shortcut: 'b' },
  { id: 'erase', label: 'Erase', shortcut: 'e' },
];

/** Bar and beat lines for a meter such as 4/4, out to `duration` quarter notes. */
function gridLinesFor(meter: string, duration: number): PianoRollGridLine[] {
  const { numerator, denominator } = parseMeter(meter);
  const beatLength = 4 / denominator;
  const barLength = numerator * beatLength;
  const lines: PianoRollGridLine[] = [];
  let bar = 1;
  for (let barStart = 0; barStart <= duration; barStart += barLength) {
    lines.push({ at: barStart, kind: 'bar', label: String(bar) });
    for (let beat = 1; beat < numerator; beat += 1) {
      const at = barStart + beat * beatLength;
      if (at <= duration) {
        lines.push({ at, kind: 'beat' });
      }
    }
    bar += 1;
  }
  return lines;
}

/** A blank clip opens centered on middle C; a clip with notes is fitted to them by the roll. */
function openingView(packet: DataPacket): PianoRollViewState {
  if (packet.items.length > 0) {
    return defaultPianoRollView;
  }
  return {
    ...defaultPianoRollView,
    framed: true,
    scrollTop: (127 - 72) * defaultPianoRollView.pixelsPerSemitone,
  };
}

interface SelectionState {
  selection: NoteSelection;
  /** The packet the selection's range was computed against. */
  basis: DataPacket;
}

/** The selection against the packet on screen: pruned, and re-ranged if the packet is not its basis. */
function currentSelection(state: SelectionState, packet: DataPacket): NoteSelection {
  const pruned = pruneSelection(state.selection, packet);
  return state.basis === packet ? pruned : selectIds(packet, pruned.ids);
}

function NoteClipEditorBody({ snippet }: ClipEditorProps) {
  const { commitSnippetEditById, loading, locked } = useDesk();
  const { settings } = useCompositionSettings();
  const { packet } = snippet;
  // Transient view state: tool, selection (events and the time they occupy), zoom and scroll live in
  // this component only. They are never recorded in the history and never written to the packet.
  const [view, setView] = useState(() => openingView(packet));
  const [tool, setTool] = useState(() => (packet.items.length > 0 ? 'select' : 'draw'));
  // The selection remembers the packet it was last computed against (`basis`). When the packet is
  // something else (an undo of a move, another tab's change), the range falls back to the time the
  // selected notes now occupy instead of showing a stale band.
  const [selectionState, setSelectionState] = useState<SelectionState>(() => ({
    selection: emptyNoteSelection,
    basis: packet,
  }));
  const [notice, setNotice] = useState<string | null>(null);
  const selection = useMemo(
    () => currentSelection(selectionState, packet),
    [selectionState, packet]
  );

  // Functional, because one roll event can change the selection twice (a marquee sets the ids, then
  // widens the range).
  function setSelection(change: (current: NoteSelection) => NoteSelection) {
    setSelectionState((state) => ({
      selection: change(currentSelection(state, packet)),
      basis: packet,
    }));
  }

  const notes = useMemo(() => packetRollNotes(packet), [packet]);
  const extent = clipExtent(packet);
  const { numerator, denominator } = parseMeter(settings.transport.meter);
  const barLength = (numerator * 4) / denominator;
  // The roll shows the clip and any note past its end, plus a bar of room to draw into.
  const duration = useMemo(() => clipRollDuration(packet) + barLength, [packet, barLength]);
  const gridLines = useMemo(
    () => gridLinesFor(settings.transport.meter, Math.max(duration, GRID_REACH)),
    [settings.transport.meter, duration]
  );
  const refusal = loading
    ? 'The desk is still loading, so the clip cannot be edited yet.'
    : locked
      ? 'The saved desk could not be read, so changes to it are turned off.'
      : null;

  /**
   * Applies one edit through the desk as a hand edit: the clip keeps its id, a run of edits is one
   * version, and each call is one undo step (the roll reports a drag once, on release).
   */
  function commit(
    edit: (current: DataPacket) => DataPacket,
    after?: (next: DataPacket) => NoteSelection
  ) {
    if (refusal) {
      setNotice(refusal);
      return;
    }
    const next = edit(packet);
    if (next === packet) {
      return;
    }
    const result = commitSnippetEditById(snippet.id, next, NOTE_EDIT_OPERATION, { handEdit: true });
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setNotice(null);
    setSelectionState({
      selection: after ? after(next) : followEdit(selection, packet, next),
      basis: result.snippet.packet,
    });
  }

  function draw(note: PianoRollNewNote) {
    const id = newNoteItemId(snippet.id);
    commit(
      (current) => addNote(current, note, id),
      (next) => selectIds(next, [id])
    );
  }

  function remove(ids: string[]) {
    commit(
      (current) => deleteNotes(current, ids),
      (next) => pruneSelection(selection, next)
    );
  }

  const actions: EditorAction[] = [
    {
      id: 'delete',
      label: 'Delete',
      shortcut: 'Delete',
      run: ({ selectedIds }) => remove(selectedIds),
    },
    {
      id: 'louder',
      label: 'Louder',
      shortcut: ']',
      run: ({ selectedIds }) =>
        commit((current) => changeVelocity(current, selectedIds, VELOCITY_STEP)),
    },
    {
      id: 'softer',
      label: 'Softer',
      shortcut: '[',
      run: ({ selectedIds }) =>
        commit((current) => changeVelocity(current, selectedIds, -VELOCITY_STEP)),
    },
  ];

  return (
    <div className={classes.editor}>
      <div className={classes.header}>
        <div className={classes.title}>
          <Title order={2} size="xs">
            {snippet.name}
          </Title>
          <Badge variant="outline">{packet.items.length} notes</Badge>
        </div>
        <Text size="xs" c="dimmed" aria-live="polite">
          {notice ??
            (packet.items.length === 0
              ? 'Empty clip. Draw notes on the grid with the Draw tool.'
              : '')}
        </Text>
      </div>
      {/* The roll fills this area. The velocity lane (K5a) goes below it, inside the same column. */}
      <div className={classes.rollArea}>
        <PianoRoll
          ariaLabel="Note clip piano roll"
          fill
          ghostDrag
          wheelZoom
          endMarker={extent > 0 ? extent : undefined}
          notes={notes}
          duration={duration}
          gridLines={gridLines}
          view={view}
          onViewChange={setView}
          selectedIds={selection.ids}
          onSelectionChange={(ids) => setSelection(() => selectIds(packet, ids))}
          onMarqueeRange={(range: PianoRollRange) =>
            setSelection((current) => extendRange(current, range))
          }
          selectedRange={selection.range}
          tools={tools}
          activeTool={tool}
          onToolChange={setTool}
          actions={actions}
          onAddNote={draw}
          onMoveNotes={(ids, delta) => commit((current) => moveNotes(current, ids, delta))}
          onResizeNotes={(ids, delta) => commit((current) => resizeNotes(current, ids, delta))}
          onDeleteNotes={remove}
          onVelocityChange={(ids, delta) =>
            commit((current) => changeVelocity(current, ids, delta))
          }
        />
      </div>
    </div>
  );
}

/** The piano-roll editor for note clips. Keyed by clip, so switching clips resets the view state. */
export function NoteClipEditor({ snippet }: ClipEditorProps) {
  return <NoteClipEditorBody key={snippet.id} snippet={snippet} />;
}

registerClipEditor(NOTE_EDITOR_ID, NoteClipEditor);
