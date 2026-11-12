import type { DataPacket } from './model';

/**
 * The shape of a clip-type action: something a clip's inspector (today) or a right-click menu
 * (later) can offer and run. An action is a pure function of the packet: it never touches the desk,
 * the selection state or the DOM, so the caller commits what it returns (its own version, through
 * the desk's `commitSnippetEditById`) and decides what to show on a refusal.
 */

/** What an action reads of the editor's selection. Same shape as the note editor's `NoteSelection`. */
export interface ClipActionSelection {
  /** Packet item ids; empty means nothing is selected (the action then acts on the whole clip). */
  ids: readonly string[];
  /** The selected time span in quarter notes, or null. */
  range: { start: number; end: number } | null;
  /** 'time' for a time selection: the action then acts on the notes overlapping `range`. */
  kind?: 'time';
}

export interface ClipActionContext {
  selection: ClipActionSelection;
  /**
   * The grid unit in quarter notes the actions snap to: the editor's effective snap unit (the chosen
   * grid, or on Auto what the roll uses at its current zoom). Undefined without an editor.
   */
  gridUnit?: number;
  /** A fresh item id, for actions that add items. */
  newId(): string;
}

/** One parameter an action takes, described so a menu can build its input. */
export interface ClipActionParam {
  id: string;
  label: string;
  /** `number`/`integer` are typed values, `choice` picks one of `options`. */
  type: 'number' | 'integer' | 'choice';
  default?: number | string;
  options?: readonly { value: string; label: string }[];
}

/** Values for an action's params, as typed (strings are parsed by the action). */
export type ClipActionParams = Readonly<Record<string, string | number | undefined>>;

/**
 * The selection the editor should hold after the edit. Left out, the editor keeps what was selected
 * (ids kept; a time selection keeps its range, a note selection's range follows its notes).
 */
export interface ClipActionSelectionResult {
  ids: string[];
  range: { start: number; end: number } | null;
  kind?: 'time';
}

export type ClipActionResult =
  | {
      ok: true;
      /** The edited packet; the SAME packet (by reference) when the action changed nothing. */
      packet: DataPacket;
      selection?: ClipActionSelectionResult;
    }
  /** A refusal: nothing was changed and `error` says why. Never a partial edit. */
  | { ok: false; error: string };

export interface ClipAction {
  /** Stable id; the version's operation is `transform-<id>`. */
  id: string;
  label: string;
  /** For grouping in a menu or the inspector (for example `Transform`). */
  group: string;
  params: readonly ClipActionParam[];
  /** Whether the action can run on this packet at all (the UI disables it otherwise). */
  applies(packet: DataPacket): boolean;
  run(packet: DataPacket, context: ClipActionContext, params: ClipActionParams): ClipActionResult;
}

/** The operation name a clip action's version is committed under. */
export const clipActionOperation = (id: string) => `transform-${id}`;
