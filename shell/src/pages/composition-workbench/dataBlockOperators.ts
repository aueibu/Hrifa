import type { DataPacket } from './model';
import type { NoteClipboard } from './noteClipboard';
import type { RotationSessionCore } from './rotationSession';

/**
 * The shape of a data-block type action: something a data-block's inspector (today) or a right-click menu
 * (later) can offer and run. An action is a pure function of the packet: it never touches the desk,
 * the selection state or the DOM, so the caller commits what it returns (its own version, through
 * the desk's `commitDataBlockEditById`) and decides what to show on a refusal.
 */

/** What an action reads of the editor's selection. Same shape as the note editor's `NoteSelection`. */
export interface OperatorSelection {
  /** Packet item ids; empty means nothing is selected (the action then acts on the whole data-block). */
  ids: readonly string[];
  /** The selected time span in quarter notes, or null. */
  range: { start: number; end: number } | null;
  /** 'time' for a time selection: the action then acts on the notes overlapping `range`. */
  kind?: 'time';
}

export interface OperatorContext {
  selection: OperatorSelection;
  /**
   * The grid unit in quarter notes the actions snap to: the editor's effective snap unit (the chosen
   * grid, or on Auto what the roll uses at its current zoom). Undefined without an editor.
   */
  gridUnit?: number;
  /** A fresh item id, for actions that add items. */
  newId(): string;
  /**
   * What the viewer last copied (noteClipboard.ts), for actions that paste. The caller reads it from
   * the in-memory store; an action never reads that store itself, so it stays a pure function.
   */
  clipboard?: NoteClipboard | null;
  /**
   * The editor's live rotation session (rotationSession.ts), when its packet and selection are still
   * the ones the last rotate left. Only "rotate in time" reads it.
   */
  rotation?: RotationSessionCore | null;
}

/** One parameter an action takes, described so a menu can build its input. */
export interface OperatorParam {
  id: string;
  label: string;
  /**
   * `number`/`integer` are typed values, `duration` is a typed note length (a plain number is quarter
   * notes, `a/b` a note value: `1/8` is an eighth), `choice` picks one of `options`. `pick-pitch` is a pitch row
   * the user clicks in the editor (a two-part gesture): the value passed to `run` is that pitch in
   * midicents (a whole semitone, `midi * 100`).
   */
  type: 'number' | 'integer' | 'duration' | 'choice' | 'pick-pitch';
  default?: number | string;
  /**
   * The param may be left out: the action then uses its own default (inversion's axis is the middle
   * of the notes). Without it a missing value is a refusal.
   */
  optional?: boolean;
  options?: readonly { value: string; label: string }[];
}

/** Values for an action's params, as typed (strings are parsed by the action). */
export type OperatorParams = Readonly<Record<string, string | number | undefined>>;

/**
 * The selection the editor should hold after the edit. Left out, the editor keeps what was selected
 * (ids kept; a time selection keeps its range, a note selection's range follows its notes).
 */
export interface OperatorSelectionResult {
  ids: string[];
  range: { start: number; end: number } | null;
  kind?: 'time';
}

export type OperatorResult =
  | {
      ok: true;
      /** The edited packet; the SAME packet (by reference) when the action changed nothing. */
      packet: DataPacket;
      selection?: OperatorSelectionResult;
      /** A copy action's result: the caller keeps it as the viewer's clipboard (the packet is unchanged). */
      clipboard?: NoteClipboard;
      /** "Rotate in time": the session the editor should keep for the next press. */
      rotation?: RotationSessionCore;
      /** Something to tell the user after a successful run (for example what was copied). */
      message?: string;
    }
  /** A refusal: nothing was changed and `error` says why. Never a partial edit. */
  | { ok: false; error: string };

export interface Operator {
  /** Stable id; the version's operator name is `transform-<id>`. */
  id: string;
  label: string;
  /** For grouping in a menu or the inspector (for example `Transform`). */
  group: string;
  params: readonly OperatorParam[];
  /** Whether the action can run on this packet at all (the UI disables it otherwise). */
  applies(packet: DataPacket): boolean;
  run(packet: DataPacket, context: OperatorContext, params: OperatorParams): OperatorResult;
}

/** The operator name an operator's version is committed under. */
export const operatorOperation = (id: string) => `transform-${id}`;
