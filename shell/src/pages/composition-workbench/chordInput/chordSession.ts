/**
 * The page-level chord session (design one-stage 7.2, 1.3): the chord picker's state, its keyboard
 * workflow (W-20), the hover cell, the audition and the claim model, in a store that lives above any
 * one host. Plain TypeScript, no React (the hooks and the provider are `ChordSessionProvider.tsx`).
 *
 * A HOST (the note clip editor today; a progression list, a module later) CLAIMS the session with a
 * `ChordTarget`: where a chord goes, how the host reads the project (pitch set, EDO, entry length),
 * and what to do on insert. The LAST claim wins; releasing the active claim reactivates the previous
 * one that is still held (its host never released it). With no claim there is no target and the
 * picker shows an empty state. The session RESETS whenever the active target changes.
 *
 * What stays OUTSIDE (M4b, not here): the pointer tracker and `pointerInside`, the clip editor's
 * selection chain and the panel commands. The key handler takes its scope check through the target
 * (`scope()`: the host's root element) plus the shared attributes `data-chord-picker` and
 * `data-chord-scope`; it never reads editor state.
 *
 * The session is the only caller of the picker's open and close (`showPicker`, `hidePicker`,
 * `reportPickerClosed` go through the target's adapter: `wantsPicker`, `openPicker`, `closePicker`).
 * Until M6 the picker lives in the editor's v1 Stage and the editor maps "the host wants the picker"
 * to its `pickerInStage` rule itself.
 */
import type { ProjectPitchSet } from '../compositionSettings';
import { readDeveloperOptions } from '../developerOptions';
import type { ChordPickerControl, ChordPickerMode } from './ChordPicker';
import type { Chord } from './chords';
import type { ChordTier } from './chordTemplates';
import { cycle, stepSpread } from './navigation';
import { chordNotes, DEFAULT_VOICING, pitchClassOf, snapToEdo, type PlacedNote } from './placement';
import type { VoicingSpec } from './voicing';

/** A grid cell: a pitch row and a span. */
export interface ChordCell {
  pitchMidicents: number;
  start: number;
  step: number;
}

/**
 * Where a chord goes. `note` is set when the click landed on an existing note (stack-on-note
 * context): the chord then takes that note's length and velocity. Any keyed move drops it.
 */
export interface ChordAnchor extends ChordCell {
  note?: { duration: number; velocity?: number; pitchMidicents: number };
}

/** What a host receives when a chord is inserted. */
export interface ChordInsertRequest {
  chord: Chord;
  anchor: ChordAnchor;
  voicing: VoicingSpec;
  /** The length of the placed chord (the stack note's, else the entry length, else one grid step). */
  length: number;
  /** Common-tone mode: the clicked pitch class (the anchored tone); absent in root mode. */
  anchorPc?: number;
  /** One note per voice at the anchor's onset: the default placement, before any host rule. */
  notes: PlacedNote[];
  entryVelocity?: number;
}

/**
 * What a host supplies when it claims the session. Fields read at call time (getters are fine), so
 * a stable object can follow a host that re-renders; call `claim.changed()` when a field that the
 * picker shows (pitchSet, edo, entry length, wantsPicker) changed.
 */
export interface ChordTarget {
  /** Names the claim (the audition's source id is `chords:<id>`). */
  id: string;
  /** The project's pitch set the picker offers chords from. */
  pitchSet: ProjectPitchSet;
  edo: number;
  /** The length a placed chord takes when no note is stacked on; null or absent: one grid step. */
  entryLength?: number | null;
  entryVelocity?: number | null;
  /** The empty-state text while the host has no anchor yet. */
  hint?: string;
  /** The note a click on a cell means (stacking), or undefined. A list host has no notes. */
  noteAt?(cell: ChordCell): ChordNoteHit | undefined;
  /** Places the chord; `false` means nothing was placed (the session then keeps its anchor and ghosts). */
  insert(request: ChordInsertRequest): boolean | void;
  /** The anchor was set by a click or a key (today the page's `onChordAnchor`). */
  onAnchor?(anchor: { pitchMidicents: number; onset: number }): void;
  /** A keyed anchor move wants the host's view to follow (the roll scrolls). */
  revealAnchor?(range: {
    start: number;
    end: number;
    pitchMidicents: number;
    pitchEndMidicents: number;
  }): void;
  /** The root element of the host's key scope (the editor root); the picker frame and any
   * `[data-chord-scope]` element are always in scope. */
  scope?(): Element | null;
  /** Is the host's panel in front? Keys do nothing while it says no. Absent: yes. */
  visible?(): boolean;
  /** The picker adapter: does the host want the picker shown (the Chords tool is on)? Absent: yes. */
  wantsPicker?(): boolean;
  openPicker?(): void;
  /** The user closed the picker: the host leaves its tool. */
  onPickerClosed?(): void;
}

/** An existing note a click landed on. */
export interface ChordNoteHit {
  start: number;
  duration: number;
  velocity?: number;
  pitchMidicents: number;
}

export interface ChordSessionState {
  /** The active claim's target, or null (no claim). */
  target: ChordTarget | null;
  /** Bumped by `claim.changed()` and at every target change, so readers re-read the target. */
  targetVersion: number;
  /** Whether the active target wants the picker shown. */
  pickerWanted: boolean;
  anchor: ChordAnchor | null;
  /** The tool's own scale, or null for the project's. Never written to the project. */
  override: ProjectPitchSet | null;
  voicing: VoicingSpec;
  /** The stored mode: set only by the Root | Common tone buttons. */
  mode: ChordPickerMode;
  /** Ctrl/Cmd+click opens common-tone mode for that click only. */
  ctrlOpen: boolean;
  continuous: boolean;
  allPitches: boolean;
  tier: ChordTier;
  hoverChord: Chord | null;
  pinnedChord: Chord | null;
  /** The grid cell under the pointer (display only: a one-step ghost). */
  hoverCell: ChordCell | null;
}

const INITIAL: Omit<ChordSessionState, 'target' | 'targetVersion' | 'pickerWanted'> = {
  anchor: null,
  override: null,
  voicing: DEFAULT_VOICING,
  mode: 'root',
  ctrlOpen: false,
  continuous: false,
  allPitches: false,
  tier: 'simple',
  hoverChord: null,
  pinnedChord: null,
  hoverCell: null,
};

/** The release function of a claim; `changed()` tells the session the target's fields changed. */
export type ChordClaim = (() => void) & { changed(): void };

type AuditionSink = (notes: PlacedNote[], velocity?: number) => void;

const CHORD_SCOPE = '[data-chord-picker], [data-chord-scope]';
const ESCAPE_SCOPE = '[data-note-editor-scope], [data-chord-scope]';
const OPEN_OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"]';

function isTyping(target: HTMLElement | null): boolean {
  return (
    !!target &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export class ChordSession {
  private state: ChordSessionState = {
    ...INITIAL,
    target: null,
    targetVersion: 0,
    pickerWanted: false,
  };
  private listeners = new Set<() => void>();
  private claims: { target: ChordTarget }[] = [];

  /** The picker's handle on its own keyboard navigation (set by the mounted picker). */
  readonly controlRef: { current: ChordPickerControl | null } = { current: null };
  /** The cell under a still pointer when the anchor was last moved by keys: its hover ghost stays
   * hidden until the pointer reports another cell (or leaves the roll). Not reactive. */
  hoverBlocked: { pitchMidicents: number; start: number } | null = null;
  /** Set by a Shift+arrow anchor move: once the picker has re-listed, the current chord is re-pinned. */
  reselect = false;
  /** False while a Shift+arrow is auto-repeating: the anchor still moves, the chord does not sound. */
  reselectSounds = true;
  /** An Alt+arrow was handled since Alt went down: its keyup must not reach the browser menu bar. */
  altArrowHandled = false;
  /** Registered by the mounted audition component (`ChordAudition`); null when nothing can sound. */
  auditionSink: AuditionSink | null = null;

  // --- the store -----------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): ChordSessionState => this.state;

  private set(patch: Partial<ChordSessionState>) {
    const keys = Object.keys(patch) as (keyof ChordSessionState)[];
    if (keys.every((key) => Object.is(this.state[key], patch[key]))) {
      return;
    }
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  // --- the claim model -----------------------------------------------------------------------

  /** The last claim wins; the returned function releases it (idempotent). */
  claimChordTarget = (target: ChordTarget): ChordClaim => {
    const entry = { target };
    this.claims.push(entry);
    this.activate();
    const release = (() => {
      const index = this.claims.indexOf(entry);
      if (index < 0) {
        return;
      }
      this.claims.splice(index, 1);
      this.activate();
    }) as ChordClaim;
    release.changed = () => {
      if (this.state.target === target) {
        this.set({
          targetVersion: this.state.targetVersion + 1,
          pickerWanted: target.wantsPicker?.() ?? true,
        });
      }
    };
    return release;
  };

  /** Makes the last held claim active; a different target resets the session. */
  private activate() {
    const target = this.claims.at(-1)?.target ?? null;
    if (target === this.state.target) {
      return;
    }
    this.hoverBlocked = null;
    this.reselect = false;
    this.reselectSounds = true;
    this.altArrowHandled = false;
    this.state = {
      ...INITIAL,
      target,
      targetVersion: this.state.targetVersion + 1,
      pickerWanted: target ? (target.wantsPicker?.() ?? true) : false,
    };
    this.listeners.forEach((listener) => listener());
  }

  // --- the picker adapter (the session is the only caller) -------------------------------------

  showPicker() {
    this.state.target?.openPicker?.();
  }

  hidePicker() {
    this.state.target?.onPickerClosed?.();
  }

  /** The user closed the picker's tab or frame: the host leaves its tool. */
  reportPickerClosed(): boolean {
    const target = this.state.target;
    if (!target?.onPickerClosed) {
      return false;
    }
    target.onPickerClosed();
    return true;
  }

  // --- derived values --------------------------------------------------------------------------

  private effectiveMode(): ChordPickerMode {
    return this.state.ctrlOpen ? 'common' : this.state.mode;
  }

  private chordLength(): number {
    const { anchor, target } = this.state;
    return anchor?.note?.duration ?? target?.entryLength ?? anchor?.step ?? 1;
  }

  /** Common-tone mode anchors the chord tone that has the clicked pitch class; root mode, the root. */
  private anchorPc(): number | undefined {
    const { anchor, target } = this.state;
    return this.effectiveMode() === 'common' && anchor && target
      ? pitchClassOf(anchor.pitchMidicents, target.edo)
      : undefined;
  }

  // --- plain setters (the picker's props) ------------------------------------------------------

  setOverride = (override: ProjectPitchSet | null) => {
    this.set({ override, hoverChord: null, pinnedChord: null });
  };
  setContinuous = (continuous: boolean) => this.set({ continuous });
  /** The Root | Common tone buttons: commit the stored mode, the open picker follows it. */
  setMode = (mode: ChordPickerMode) => {
    this.set({ mode, ctrlOpen: false, hoverChord: null, pinnedChord: null });
  };
  setTier = (tier: ChordTier) => {
    // A pinned or hovered chord may no longer be listed: fall back to the first.
    this.set({ tier, hoverChord: null, pinnedChord: null });
  };
  setAllPitches = (allPitches: boolean) => {
    this.set({ allPitches, hoverChord: null, pinnedChord: null });
  };
  setHoverChord = (hoverChord: Chord | null) => this.set({ hoverChord });
  setHoverCell = (hoverCell: ChordCell | null) => this.set({ hoverCell });
  clearGhosts = () => this.set({ hoverChord: null, pinnedChord: null });
  /** Clears the anchor and the ghosts (Esc, the Close button, leaving the tool). */
  closePicker = () => this.set({ anchor: null, hoverChord: null, pinnedChord: null });
  /** The host's tool changed: no hover ghost, no anchor. */
  leaveTool = () =>
    this.set({ hoverCell: null, anchor: null, hoverChord: null, pinnedChord: null });

  // --- the roll's gestures ---------------------------------------------------------------------

  /** The roll's hover (only with the Chords tool): snapped to the EDO grid, the blocked-cell rule here. */
  hoverFromRoll = (anchor: ChordCell | null) => {
    const edo = this.state.target?.edo;
    const cell =
      anchor && edo !== undefined
        ? { ...anchor, pitchMidicents: snapToEdo(anchor.pitchMidicents, edo) }
        : null;
    const blocked = this.hoverBlocked;
    if (
      cell &&
      blocked &&
      cell.start === blocked.start &&
      cell.pitchMidicents === blocked.pitchMidicents
    ) {
      return;
    }
    this.hoverBlocked = null;
    this.set({ hoverCell: cell });
  };

  /** A click on the roll: snapped to the project EDO grid before anything sees it; a note under it is stacked on. */
  anchorFromRoll = (click: ChordCell & { ctrlKey?: boolean }) => {
    const target = this.state.target;
    if (!target) {
      return;
    }
    const snapped: ChordAnchor = {
      pitchMidicents: snapToEdo(click.pitchMidicents, target.edo),
      start: click.start,
      step: click.step,
    };
    const hit = target.noteAt?.(click);
    if (hit) {
      // Stacking on an existing note: its exact pitch and actual onset, its own length and velocity.
      snapped.pitchMidicents = snapToEdo(hit.pitchMidicents, target.edo);
      snapped.start = hit.start;
      snapped.note = {
        duration: hit.duration,
        velocity: hit.velocity,
        pitchMidicents: hit.pitchMidicents,
      };
    }
    this.setAnchor(snapped, { ctrl: click.ctrlKey === true });
  };

  /**
   * Sets the anchor (a click, or a host choosing its own position). A plain click opens the stored
   * mode; `ctrl` opens common-tone mode for this click only.
   */
  setAnchor = (anchor: ChordAnchor, { ctrl = false }: { ctrl?: boolean } = {}) => {
    this.set({ anchor, ctrlOpen: ctrl, hoverChord: null, pinnedChord: null });
    this.state.target?.onAnchor?.({ pitchMidicents: anchor.pitchMidicents, onset: anchor.start });
  };

  /** Moves the anchor (keys, continuous insert) and tells the host, like a click on the roll. */
  private setAnchorTo(moved: ChordCell) {
    const length = this.chordLength();
    const continuous = this.state.continuous;
    // Keyed and continuous moves are ordinary empty-cell anchors: callers spread the old anchor, so
    // the stack-on-note context is dropped here.
    const next = { pitchMidicents: moved.pitchMidicents, start: moved.start, step: moved.step };
    const start = Number(next.start.toFixed(9));
    // A keyboard move leaves the pointer where it was: its cell ghost would sit at the old point.
    this.hoverBlocked = this.state.hoverCell ?? this.hoverBlocked;
    this.set({ hoverCell: null, anchor: { ...next, start } });
    const target = this.state.target;
    // The view follows the anchor: the minimum scroll that shows this chord, the next one when
    // inserting continuously, and some pitch room around it for the ghost.
    target?.revealAnchor?.({
      start,
      end: start + length * (continuous ? 2 : 1),
      pitchMidicents: Math.max(0, next.pitchMidicents - 600),
      pitchEndMidicents: Math.min(12700, next.pitchMidicents + 600),
    });
    target?.onAnchor?.({ pitchMidicents: next.pitchMidicents, onset: start });
  }

  // --- insert, pin, audition -------------------------------------------------------------------

  audition = (notes: PlacedNote[], velocity?: number) => {
    this.auditionSink?.(notes, velocity);
  };

  /** Places a chord at the anchor through the host (one insert, one undo step for a roll host). */
  insertChord = (chord: Chord) => {
    const { anchor, target, voicing, continuous } = this.state;
    if (!anchor || !target) {
      return;
    }
    const length = this.chordLength();
    const anchorPc = this.anchorPc();
    const placed = target.insert({
      chord,
      anchor,
      voicing,
      length,
      anchorPc,
      notes: chordNotes(chord, anchor, voicing, length, anchorPc),
      entryVelocity: target.entryVelocity ?? undefined,
    });
    if (placed === false) {
      return;
    }
    if (continuous) {
      // The anchor moves on by the chord's length (same pitch); the chord and voicing stay pinned,
      // so the next Enter places the next one there.
      this.setAnchorTo({ ...anchor, start: anchor.start + length });
      this.set({ pinnedChord: chord });
    } else {
      this.clearGhosts();
    }
  };

  /** Pins a chord's ghost; sounds it only when asked. */
  pinChord = (chord: Chord, { audition }: { audition: boolean }) => {
    const { anchor, target, voicing } = this.state;
    if (!anchor) {
      return;
    }
    this.set({ pinnedChord: chord });
    if (audition) {
      this.audition(
        chordNotes(chord, anchor, voicing, this.chordLength(), this.anchorPc()),
        target?.entryVelocity ?? undefined
      );
    }
  };

  /**
   * A spread or inversion click: takes the new voicing and, on the current chord (the pinned one,
   * else the hovered one, else the first offered), moves the pinned ghost to it and, when the gate
   * allows, auditions it with that voicing. With no chord at all it only changes the voicing.
   */
  changeVoicing = (
    next: VoicingSpec,
    { audition, fallback }: { audition: boolean; fallback: Chord | null }
  ) => {
    this.set({ voicing: next });
    const { anchor, target, pinnedChord, hoverChord } = this.state;
    const chord = pinnedChord ?? hoverChord ?? fallback;
    if (!chord || !anchor) {
      return;
    }
    this.set({ pinnedChord: chord });
    if (audition) {
      this.audition(
        chordNotes(chord, anchor, next, this.chordLength(), this.anchorPc()),
        target?.entryVelocity ?? undefined
      );
    }
  };

  /** Shift+arrows: the anchor moves by the grid step in time (never before 0) or one EDO step in pitch. */
  private moveAnchor(dx: number, dy: number, allowAudition = true) {
    const { anchor, target } = this.state;
    if (!anchor || !target) {
      return;
    }
    const start = Math.max(0, anchor.start + dx * anchor.step);
    // One EDO step (100 cents at 12-EDO), from the snapped anchor, clamped to the roll's range.
    const stepCents = 1200 / target.edo;
    const pitchMidicents = Math.max(
      0,
      Math.min(12700, snapToEdo(anchor.pitchMidicents, target.edo) - dy * stepCents)
    );
    if (start === anchor.start && pitchMidicents === anchor.pitchMidicents) {
      return;
    }
    this.reselect = true;
    this.reselectSounds = allowAudition;
    this.set({ hoverChord: null });
    this.setAnchorTo({ ...anchor, start, pitchMidicents });
  }

  /**
   * Alt+arrows: the same voicing change the Inversion and Spread buttons make, but cycling: after
   * the last spread comes the first, and the inversion wraps within the current chord's own
   * inversions (a triad has three), so every press moves the ghost.
   */
  private stepVoicing(inversionDelta: number, spreadDelta: number, allowAudition = true) {
    const control = this.controlRef.current;
    const { pinnedChord, hoverChord, voicing } = this.state;
    const current = pinnedChord ?? hoverChord ?? control?.current() ?? null;
    const count = Math.max(1, current?.steps.length ?? control?.inversions() ?? 1);
    const inversion = cycle(Math.min(voicing.inversion, count - 1) + inversionDelta, count);
    const spread = stepSpread(voicing.spread, spreadDelta);
    if (inversion === voicing.inversion && spread === voicing.spread) {
      return;
    }
    this.changeVoicing(
      { inversion, spread },
      {
        audition: allowAudition && readDeveloperOptions().chordPreviewGate === 'click',
        fallback: control?.current() ?? null,
      }
    );
  }

  /**
   * After a Shift+arrow anchor move the picker has re-listed the chords for the new pitch: pin the
   * chord it is on (the same one while it is still offered, else the first) and sound it per the
   * gate. The provider calls this from an effect on the anchor, after the picker's own effects.
   */
  afterAnchorChange = () => {
    if (!this.reselect) {
      return;
    }
    this.reselect = false;
    const chord = this.controlRef.current?.current() ?? null;
    if (chord) {
      this.pinChord(chord, {
        audition: this.reselectSounds && readDeveloperOptions().chordPreviewGate === 'click',
      });
    } else {
      this.set({ pinnedChord: null });
    }
  };

  // --- the keyboard workflow (W-20) -------------------------------------------------------------

  /**
   * The Chords tool's key map, one handler for the whole host (focus on the roll or in the picker,
   * in the dock or the takeover). Not for text fields, comboboxes, open dialogs or menus; Ctrl/Cmd
   * keys are never ours; a key is only consumed when it is handled. Installed by the provider in
   * the capture phase while an active claim wants the picker and an anchor exists.
   */
  handleKey = (event: KeyboardEvent) => {
    const host = this.state.target;
    if (!host || host.visible?.() === false) {
      return;
    }
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const inScope =
      !(target instanceof Element) ||
      target === document.body ||
      target === document.documentElement ||
      !!host.scope?.()?.contains(target) ||
      !!target.closest(CHORD_SCOPE);
    if (
      !inScope ||
      // Controls with their own arrow keys (splitters, sliders, tabs, menus, accordions).
      target?.closest?.(
        '[role="separator"], [role="slider"], [role="tablist"], [role="menu"], [role="menuitem"], [data-accordion-control], .mantine-Accordion-control'
      ) ||
      target?.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '') ||
      target?.closest?.('[role="combobox"], [role="listbox"], [role="option"]') ||
      document.querySelector(OPEN_OVERLAY)
    ) {
      return;
    }
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (dx || dy) {
      if (event.altKey && event.shiftKey) {
        return;
      }
      handled();
      if (event.altKey) {
        // Alt+Left/Right is also the browser's Back/Forward; its keyup must not open the menu bar.
        this.altArrowHandled = true;
        this.stepVoicing(dy, dx, !event.repeat);
      } else if (event.shiftKey) {
        this.moveAnchor(dx, dy, !event.repeat);
      } else {
        this.controlRef.current?.navigate(
          dx,
          dy,
          target?.closest<HTMLElement>('[data-chord-key]')?.dataset.chordKey ?? null,
          !event.repeat
        );
      }
    } else if (event.key === 'Enter' && !event.altKey && !event.shiftKey) {
      // Enter on a button (a chord inserts itself; Root, Spread ... activate) is the button's.
      if (target?.closest?.('button, a, summary, [role="button"]')) {
        return;
      }
      const chord =
        this.state.pinnedChord ??
        this.state.hoverChord ??
        this.controlRef.current?.current() ??
        null;
      if (chord) {
        handled();
        if (event.repeat) {
          return;
        }
        this.insertChord(chord);
      }
    } else if (event.key.toLowerCase() === 'i' && !event.altKey && !event.shiftKey) {
      handled();
      if (event.repeat) {
        return;
      }
      this.set({ continuous: !this.state.continuous });
    }
  };

  /** The Alt of a handled Alt+arrow must not reach the browser menu bar wherever focus is. */
  handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Alt' && this.altArrowHandled) {
      this.altArrowHandled = false;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  /** Escape closes the picker (clears its anchor and ghosts) from the host, the picker or the page body, never from a text field. */
  handleEscape = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const inScope =
      !(target instanceof Element) ||
      !!target.closest(ESCAPE_SCOPE) ||
      target === document.body ||
      target === document.documentElement;
    if (
      event.key === 'Escape' &&
      !isTyping(target) &&
      inScope &&
      // An open menu or dialog owns Escape.
      !document.querySelector(OPEN_OVERLAY)
    ) {
      this.closePicker();
    }
  };
}
