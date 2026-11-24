import type { PianoRollProps } from '../../components/PianoRoll';

/**
 * The page-level data-block editor session (design one-stage 7.2 item 1). It holds the open data-block's
 * transient editor state (tool, pick, ramp, rotation, view, selection with basis and moves, reveal,
 * announcement) in named slots, one state object per data-block id, created lazily on first read (reads
 * never dispose anything). Editors attach per data-block from an effect; a data-block's state is disposed when
 * its last editor detaches, so switching data-blocks gives the new data-block fresh state and reopening a data-block
 * starts fresh, equal in behaviour to `key={dataBlock.id}` but without any React key above the Stage. Nothing here is ever recorded in the history or written to a packet.
 *
 * It also carries the panel commands (7.3): `dispatch({ type: 'reveal' | 'clearAnchor' | 'focus' })`
 * reaches the handler the receiving panel registered with `onCommand`.
 */

/** The slot names of the open data-block's state. */
export const DATA_BLOCK_SLOT = {
  view: 'view',
  tool: 'tool',
  toolBeforeChords: 'toolBeforeChords',
  ramp: 'ramp',
  pick: 'pick',
  rotation: 'rotation',
  selection: 'selection',
  /** The selection the editor shows (pruned, derived), published for the read-only chain. */
  shownSelection: 'shownSelection',
  reveal: 'reveal',
  announcement: 'announcement',
} as const;

/** A one-shot reveal request; the roll scrolls once per new token (a repeat counts). */
export type RevealRequest = NonNullable<PianoRollProps['reveal']>;
export type RevealTarget = RevealRequest extends infer R
  ? R extends unknown
    ? Omit<R, 'token'>
    : never
  : never;

export type DataBlockEditorCommand =
  | { type: 'reveal'; target: RevealTarget }
  | { type: 'clearAnchor' }
  | { type: 'focus' };

export type DataBlockEditorCommandType = DataBlockEditorCommand['type'];
export type DataBlockEditorCommandOf<T extends DataBlockEditorCommandType> = Extract<
  DataBlockEditorCommand,
  { type: T }
>;

type Handler = (command: never) => void;

/** One data-block's state: its slots, its disposers and how many editors hold it. */
interface DataBlockState {
  slots: Map<string, unknown>;
  disposers: Set<() => void>;
  attached: number;
}

export class DataBlockEditorSession {
  private states = new Map<string, DataBlockState>();
  /** Data-blocks with a mounted editor, oldest first; the last one is the "open" data-block. */
  private attachOrder: string[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly handlers = new Map<DataBlockEditorCommandType, Set<Handler>>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  /** The most recently attached data-block that still has an editor, or null. */
  get openDataBlockId(): string | null {
    return this.attachOrder.at(-1) ?? null;
  }

  /** The data-block's state, created empty on first ask (idempotent, silent, never disposes anything). */
  private stateOf(dataBlockId: string): DataBlockState {
    let state = this.states.get(dataBlockId);
    if (!state) {
      state = { slots: new Map(), disposers: new Set(), attached: 0 };
      this.states.set(dataBlockId, state);
    }
    return state;
  }

  /**
   * A mounted editor for the data-block (called from an effect). The data-block's state is dropped, running its
   * disposers, when the last editor for it detaches, so a closed editor that is opened again starts
   * fresh, as a keyed remount does today. Other data-blocks' states are never touched. An editor that
   * remounts in the same commit sees the old state for its first render only: the old editor's
   * cleanup (count to 0) drops it before this attach, and the notify re-renders the new editor.
   */
  attach(dataBlockId: string): () => void {
    this.stateOf(dataBlockId).attached += 1;
    this.attachOrder.push(dataBlockId);
    return () => {
      const state = this.states.get(dataBlockId);
      const at = this.attachOrder.lastIndexOf(dataBlockId);
      if (at >= 0) {
        this.attachOrder.splice(at, 1);
      }
      if (!state) {
        return;
      }
      state.attached -= 1;
      if (state.attached <= 0) {
        this.states.delete(dataBlockId);
        [...state.disposers].forEach((run) => run());
        this.notify();
      }
    };
  }

  /** Registers cleanup that runs when the data-block's state is disposed. */
  onDispose(dataBlockId: string, run: () => void): () => void {
    const { disposers } = this.stateOf(dataBlockId);
    disposers.add(run);
    return () => {
      disposers.delete(run);
    };
  }

  /** One slot of the data-block's state (created by `init` on first read; a read never disposes). */
  read<T>(dataBlockId: string, key: string, init: () => T): T {
    const { slots } = this.stateOf(dataBlockId);
    if (!slots.has(key)) {
      slots.set(key, init());
    }
    return slots.get(key) as T;
  }

  /** A slot of the data-block if the slot exists; never creates anything. */
  get<T>(dataBlockId: string, key: string): T | undefined {
    return this.states.get(dataBlockId)?.slots.get(key) as T | undefined;
  }

  /** Replaces a slot (functional updates see the current value); unchanged values do not notify. */
  write<T>(dataBlockId: string, key: string, init: () => T, next: T | ((current: T) => T)) {
    const current = this.read(dataBlockId, key, init);
    const value = typeof next === 'function' ? (next as (current: T) => T)(current) : next;
    if (Object.is(value, current)) {
      return;
    }
    this.stateOf(dataBlockId).slots.set(key, value);
    this.notify();
  }

  /** Reads or writes a slot without notifying (a ref-like value such as `toolBeforeChords`). */
  peek<T>(dataBlockId: string, key: string, init: () => T): { current: T } {
    const load = () => this.read(dataBlockId, key, init);
    const store = (value: T) => {
      load();
      this.stateOf(dataBlockId).slots.set(key, value);
    };
    return {
      get current() {
        return load();
      },
      set current(value: T) {
        store(value);
      },
    };
  }

  // --- panel commands --------------------------------------------------------------------------

  /** Registers the receiving panel's handler for a command type; returns the removal. */
  onCommand<T extends DataBlockEditorCommandType>(
    type: T,
    handler: (command: DataBlockEditorCommandOf<T>) => void
  ): () => void {
    const set = this.handlers.get(type) ?? new Set<Handler>();
    this.handlers.set(type, set);
    set.add(handler as Handler);
    return () => {
      set.delete(handler as Handler);
    };
  }

  /** Sends a command to the receiving panel; returns whether a handler took it. */
  dispatch(command: DataBlockEditorCommand): boolean {
    const set = this.handlers.get(command.type);
    if (!set || set.size === 0) {
      return false;
    }
    [...set].forEach((handler) => handler(command as never));
    return true;
  }
}

/** The next reveal request for a target: a fresh token every time, so a repeat counts. */
export function nextReveal(current: RevealRequest | null, target: RevealTarget): RevealRequest {
  return { ...target, token: (current?.token ?? 0) + 1 };
}
