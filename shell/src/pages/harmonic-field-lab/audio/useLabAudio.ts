/**
 * Connects the voice engine to the lab: computer keys and dock keys hold voices, Play scale / Play chord schedule
 * timed notes, and whatever sounds is reported to the lab state (`sounding`), which every view lights green (H-2).
 *
 * Nothing is left sounding: window blur, the tab being hidden, switching to another tab (the field changes) and
 * unmounting all silence everything. The AudioContext is created by the engine on the first note, i.e. on a user gesture.
 */
import { useEffect, useMemo, useRef, type Dispatch } from 'react';
import {
  chordShape,
  parsePattern,
  placeShape,
  positionalLabel,
  sketchShape,
  type Note,
} from '../../../lib/harmonic-field';
import { chordPitchesFor, type ShelfChord } from '../state/chordShelf';
import type { LabAudio } from '../state/context';
import type { Base } from '../state/derive';
import { readDeveloperOptions } from '../state/developerOptions';
import { ghostCents, ghostKey } from '../state/ghosts';
import type { Action, KeysRuntime, UiSettings } from '../state/labState';
import { linkedPitch, linkedScaleOf, type LinkedScale } from '../state/linkedMelody';
import { heldHz, litIndex, retunerLive, type RetState } from '../state/retuner';
import { sendHasKey } from '../state/sendStore';
import { sketchChord, sketchPositionalPitches } from '../state/sketchChord';
import { VoiceEngine } from './engine';
import {
  CHORD_PAGE,
  chordSlotOfEvent,
  clampShift,
  isTyping,
  keyId,
  pageOfEvent,
  playsChords,
  playsMelody,
  shiftOfEvent,
  slotOfEvent,
  slotTarget,
} from './keymap';
import {
  LightCounter,
  absHz,
  chordPlan,
  fieldScalePlan,
  HOLD_DIGITS,
  ARMED_DIGITS,
  modePreviewPlan,
  pitchesPlan,
  framedCents,
  previewTargetKey,
  stripPreviewPlan,
  scalePlan,
  slotPitch,
  subsetChordPlan,
  type PitchBase,
  type Planned,
  type PreviewTarget,
} from './plan';
import { SHORTCUTS } from './shortcuts';

/** One note of a hold-1/2/3 preview: its voice, what it lights, and whether it is sounding now. */
interface HeldNote {
  vid: string;
  src: number;
  markOnly?: boolean;
  ghost?: number;
  /** The Hz it sounds at. */
  hz: number;
  on: boolean;
}
/** A running hold-1/2/3 preview: its notes and the timers that step through a whole mode. */
interface HeldPreview {
  /** The digit that started it, to restart on another target. */
  digit: string;
  notes: HeldNote[];
  timers: number[];
  /** Shelf chords it plays (lit on their cards while it sounds). */
  chords: readonly string[];
}

interface Args {
  enabled: boolean;
  base: Base;
  ui: UiSettings;
  /** The highlighted chord (field indices); empty when none. */
  chord: ReadonlySet<number>;
  /** The retuner: while it is live the keys are its held notes and its voices glide (see `syncRetuner`). */
  retuner: RetState;
  /** The Sketch row's armed template (hold 4 plays it on the hovered note); null when none. */
  sketch: {
    template: string | null;
    shape: Note[] | null;
    rootDeg: number;
    exact: boolean;
    /** M9: a positional pattern is picked (the chord is the pattern at `rootDeg`, not the template). */
    positional: { pattern: string } | null;
    /** M9: that positional chord's shape (intervals above its own root, root first); hold 4 and hold 5 both place it. */
    positionalShape: Note[] | null;
  };
  /** The shelf, in order: what the chord keys play (Chords and Split modes). */
  shelf: readonly ShelfChord[];
  /** The computer keys' runtime state: melody shift, shelf page, the chord the linked melody follows. */
  keys: KeysRuntime;
  dispatch: Dispatch<Action>;
}

/** Delay (s) before a scheduled plan starts, so the first note is not clipped. */
const LEAD = 0.05;

/** A sounding pitch's counter key: its Hz in hundredths of a cent (independent of the 1/1 setting, which may change while it sounds). */
const pitchKey = (hz: number): number => Math.round(1200 * Math.log2(hz) * 100);

export function useLabAudio({
  enabled,
  base,
  ui,
  chord,
  retuner,
  sketch,
  shelf,
  keys,
  dispatch,
}: Args): LabAudio {
  const engine = useRef<VoiceEngine | null>(null);
  const lights = useRef(new LightCounter());
  const markLights = useRef(new LightCounter());
  /** Sounding pitches that match no field note, reference counted by pitch (see `ghostKey`). */
  const ghostLights = useRef(new LightCounter());
  /** Every sounding pitch as played, reference counted by `pitchKey` of its Hz, and the field note it lights (-1 none). */
  const pitchLights = useRef(new LightCounter());
  const pitchSrc = useRef(new Map<number, number>());
  /** The Hz of a held melody key, to unlight its pitch on release. */
  const slotHz = useRef(new Map<number, number>());
  /** Shelf chords that sound, reference counted by id (a layered selection or a click over a hold counts twice). */
  const chordLights = useRef(new Map<string, number>());
  const timers = useRef(new Set<number>());
  const slotSrc = useRef(new Map<number, number>());
  /** The ghost a linked-melody key lights (its pitch matches no field note of the tab), to unlight it on release. */
  const slotGhost = useRef(new Map<number, number | undefined>());
  /** Physical key (see `keyId`) to the slot it pressed, so a release finds it even when Shift changed `event.key`. */
  const held = useRef(new Map<string, number>());
  /** What the pointer / focus is on, for the hold-1/2/3 previews. */
  const target = useRef<PreviewTarget | null>(null);
  /** Running hold previews by physical key (see `keyId`). */
  const previews = useRef(new Map<string, HeldPreview>());
  /** Digit keys currently down (by physical key), whether or not they sound anything on the current target. */
  const heldDigits = useRef(new Map<string, string>());
  const applied = useRef({ volume: NaN, wave: '' });
  /** The retuner's voices by slot: the pitch each sounds at and the field note it lights (-1 = none). */
  const rtVoices = useRef(new Map<number, { hz: number; src: number; ghost?: number }>());
  const latest = useRef({ base, ui, chord, enabled, retuner, sketch, shelf, keys });
  useEffect(() => {
    latest.current = { base, ui, chord, enabled, retuner, sketch, shelf, keys };
    // only on a change: setVolume schedules a ramp on the master gain
    if (engine.current && applied.current.volume !== ui.volume) {
      engine.current.setVolume(ui.volume);
      applied.current.volume = ui.volume;
    }
    if (engine.current && applied.current.wave !== ui.wave) {
      engine.current.setTimbre(ui.wave);
      applied.current.wave = ui.wave;
    }
  });

  const api = useMemo<
    LabAudio & {
      syncRetuner: () => void;
      refreshArmed: () => void;
      pressChord: (id: string, index: number) => boolean;
      linkedActive: () => boolean;
      endChordKeys: () => void;
    }
  >(() => {
    const pitch = (): PitchBase => ({
      baseHz: latest.current.ui.baseHz,
      rootC: latest.current.base.rootC,
      // one switch for everything (human, 2026-11-14): Parallel starts the mode root on the 1/1 Hz pitch, Relative on its own pitch
      modeAtBase: latest.current.ui.modePlayback !== 'relative',
    });
    const getEngine = (): VoiceEngine | null => {
      if (!latest.current.enabled) {
        return null;
      }
      if (!engine.current) {
        engine.current = new VoiceEngine();
        engine.current.setVolume(latest.current.ui.volume);
        engine.current.setTimbre(latest.current.ui.wave);
        applied.current = { volume: latest.current.ui.volume, wave: latest.current.ui.wave };
      }
      return engine.current;
    };
    const report = () =>
      dispatch({
        type: 'sounding',
        idx: lights.current.lit(),
        marks: markLights.current.lit(),
        ghosts: ghostLights.current
          .lit()
          .sort((a, b) => a - b)
          .map(ghostCents),
        pitches: pitchLights.current
          .lit()
          .sort((a, b) => a - b)
          .map((k) => ({
            c: ghostCents(k) - 1200 * Math.log2(latest.current.ui.baseHz),
            src: pitchSrc.current.get(k) ?? -1,
          })),
        chords: [...chordLights.current.keys()],
      });
    const light = (i: number, on: boolean, markOnly = false, ghost?: number, hz?: number) => {
      let changed = false;
      if (hz !== undefined && hz > 0) {
        const k = pitchKey(hz);
        if (on) {
          pitchSrc.current.set(k, i);
          changed = pitchLights.current.on(k) || changed;
        } else if (pitchLights.current.off(k)) {
          pitchSrc.current.delete(k);
          changed = true;
        }
      }
      if (i >= 0) {
        const c = markOnly ? markLights.current : lights.current;
        changed = (on ? c.on(i) : c.off(i)) || changed;
      }
      // a sound with no field light, or a target-only tone: a ghost mark at its pitch, counted so two sounds of one pitch
      // end together (the field light and the ghost are separate counters)
      if (ghost !== undefined && Number.isFinite(ghost)) {
        const k = ghostKey(ghost);
        changed = (on ? ghostLights.current.on(k) : ghostLights.current.off(k)) || changed;
      }
      if (changed) {
        report();
      }
    };
    /** A shelf chord starts or stops sounding: its card lights while the count is above zero. */
    const chordOn = (ids: readonly string[] | undefined, on: boolean) => {
      if (!ids?.length) {
        return;
      }
      const m = chordLights.current;
      let changed = false;
      for (const id of ids) {
        const n = (m.get(id) ?? 0) + (on ? 1 : -1);
        if (n <= 0) {
          changed = m.delete(id) || changed;
        } else {
          changed = !m.has(id) || changed;
          m.set(id, n);
        }
      }
      if (changed) {
        report();
      }
    };
    const schedule = (plan: Planned[], chords?: readonly string[]) => {
      const eng = getEngine();
      if (!eng) {
        return;
      }
      for (const n of plan) {
        if (!eng.blip(n.hz, LEAD + n.delay, n.dur, n.amp)) {
          continue;
        }
        const start = (LEAD + n.delay) * 1000;
        const on = window.setTimeout(() => {
          timers.current.delete(on);
          light(n.src, true, n.markOnly, n.ghost, n.hz);
        }, start);
        const off = window.setTimeout(
          () => {
            timers.current.delete(off);
            light(n.src, false, n.markOnly, n.ghost, n.hz);
          },
          start + n.dur * 1000
        );
        timers.current.add(on);
        timers.current.add(off);
      }
      if (chords?.length && plan.length) {
        const end = Math.max(...plan.map((n) => n.delay + n.dur));
        const on = window.setTimeout(() => {
          timers.current.delete(on);
          chordOn(chords, true);
        }, LEAD * 1000);
        const off = window.setTimeout(
          () => {
            timers.current.delete(off);
            chordOn(chords, false);
          },
          (LEAD + end) * 1000
        );
        timers.current.add(on);
        timers.current.add(off);
      }
    };
    const stopAll = () => {
      engine.current?.stopAll();
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current.clear();
      slotSrc.current.clear();
      slotGhost.current.clear();
      slotHz.current.clear();
      held.current.clear();
      previews.current.clear();
      heldDigits.current.clear();
      rtVoices.current.clear();
      // the retuner's keys are released too (its voices are already faded by the panic above)
      if (latest.current.retuner.held.length) {
        dispatch({ type: 'ret/release' });
        // the sync effect of this same flush must not restart them from the stale held set
        latest.current.retuner = { ...latest.current.retuner, held: [] };
      }
      const had =
        lights.current.lit().length > 0 ||
        markLights.current.lit().length > 0 ||
        ghostLights.current.lit().length > 0 ||
        pitchLights.current.lit().length > 0;
      lights.current.clear();
      pitchLights.current.clear();
      pitchSrc.current.clear();
      markLights.current.clear();
      ghostLights.current.clear();
      const hadChords = chordLights.current.size > 0;
      chordLights.current.clear();
      if (had || hadChords) {
        report();
      }
    };
    /** Stop a hold preview: cancel its pending steps, release its voices, unlight them. */
    const endHeld = (id: string) => {
      const p = previews.current.get(id);
      if (!p) {
        return;
      }
      previews.current.delete(id);
      chordOn(p.chords, false);
      p.timers.forEach((t) => {
        window.clearTimeout(t);
        timers.current.delete(t);
      });
      for (const n of p.notes) {
        if (n.on) {
          n.on = false;
          engine.current?.stop(n.vid);
          light(n.src, false, n.markOnly, n.ghost, n.hz);
        }
      }
    };
    /**
     * Hold a preview: every note of the plan is a held voice that starts at its delay. A single note (delay 0) sounds
     * until `endHeld`; a whole mode also ends each step on its own timer, so the steps play in order and it stops at the end.
     */
    const startHeld = (
      id: string,
      plan: Planned[],
      stepped: boolean,
      digit: string,
      chords: readonly string[] = []
    ) => {
      const eng = getEngine();
      if (!eng || plan.length === 0) {
        return;
      }
      endHeld(id);
      const p: HeldPreview = { digit, notes: [], timers: [], chords };
      previews.current.set(id, p);
      chordOn(chords, true);
      const after = (fn: () => void, ms: number) => {
        const t = window.setTimeout(() => {
          timers.current.delete(t);
          fn();
        }, ms);
        timers.current.add(t);
        p.timers.push(t);
      };
      plan.forEach((n, k) => {
        const note: HeldNote = {
          vid: `pv:${id}:${k}`,
          src: n.src,
          markOnly: n.markOnly,
          ghost: n.ghost,
          hz: n.hz,
          on: false,
        };
        p.notes.push(note);
        const begin = () => {
          if (eng.start(note.vid, n.hz, n.amp)) {
            note.on = true;
            light(n.src, true, n.markOnly, n.ghost, n.hz);
          }
        };
        const end = () => {
          if (note.on) {
            note.on = false;
            eng.stop(note.vid);
            light(n.src, false, n.markOnly, n.ghost, n.hz);
          }
        };
        if (n.delay <= 0) {
          begin();
        } else {
          after(begin, n.delay * 1000);
        }
        if (stepped) {
          after(end, (n.delay + n.dur) * 1000);
        }
      });
    };
    /**
     * Playing a chord chip (ratio chip, CPS chip, positional row) arms its template or pattern and its shape in the Sketch row.
     * Hold 1 (`withRoot`) also moves a positional row's root degree there; hold 4 / 5 arm the same chord type but never move
     * the Sketch root (the chord sounds on the stepper root).
     */
    const armFrom = (t: PreviewTarget, withRoot: boolean) => {
      const b = latest.current.base;
      if (t.kind === 'chord' && t.template) {
        dispatch({
          type: 'sketch/arm',
          template: t.template,
          shape: t.rootIdx !== undefined ? chordShape(b.field, b.rep, t.rootIdx, t.idx) : null,
        });
      } else if (t.kind === 'pitches' && t.positional) {
        dispatch({
          type: 'sketch/armPositional',
          pattern: t.positional.pattern,
          ...(withRoot ? { rootDeg: t.positional.rootDeg } : {}),
          shape: [...t.positional.shape],
        });
      }
    };
    const armedAt = { current: '' };
    /** What a chord chip's held sound depends on besides the chip: the Sketch root, the playback frame, the subset and its mode. */
    const soundKey = () => {
      const { sketch: sk, ui: u, base: b } = latest.current;
      return `${sk.rootDeg}:${u.modePlayback}:${b.rootC}:${b.idx.join(',')}:${b.mode}`;
    };
    const playTarget = (id: string, digit: string, t: PreviewTarget): boolean => {
      const kind = HOLD_DIGITS[digit];
      if (!kind && !ARMED_DIGITS[digit]) {
        return false;
      }
      endHeld(id);
      const { base: b, ui: u } = latest.current;
      if (ARMED_DIGITS[digit]) {
        armFrom(t, false);
        armedAt.current = soundKey();
        // hold 4 (as in the field) / hold 5 (exact): the armed chord on the pointed note (a strip mark is its note);
        // nothing elsewhere
        const i = t.kind === 'note' || t.kind === 'strip' ? t.i : -1;
        const sk = latest.current.sketch;
        const skRoot = b.rel.length ? b.field[b.rel[sk.rootDeg % b.rel.length].src] : undefined;
        // M8e: on a chord chip (ratio chip, CPS chip, positional row) hold 4 / 5 plays that chip's chord on the Sketch row's
        // root (the stepper degree, wrapped); the chip's own shape for 4 (and for a chip with no exact form), its exact ratios for 5
        const chipShape =
          t.kind === 'chord' && t.rootIdx !== undefined
            ? sketchShape(
                b.field,
                b.rep,
                skRoot,
                t.template ?? '',
                chordShape(b.field, b.rep, t.rootIdx, t.idx),
                u.tol,
                t.noExact || !t.template ? 'field' : ARMED_DIGITS[digit]
              )
            : t.kind === 'pitches' && t.positional
              ? [...t.positional.shape]
              : null;
        const root = chipShape ? skRoot : b.field[i];
        const shape = chipShape
          ? chipShape
          : sk.positional
            ? root
              ? sk.positionalShape
              : null
            : root && sk.template
              ? sketchShape(
                  b.field,
                  b.rep,
                  skRoot,
                  sk.template,
                  sk.shape,
                  u.tol,
                  ARMED_DIGITS[digit]
                )
              : null;
        const pitches = root && shape ? placeShape(root, shape) : null;
        if (pitches) {
          startHeld(
            id,
            pitchesPlan(
              b.field,
              b.repC,
              pitches.map((n) => framedCents(pitch(), n.c)),
              pitch(),
              1.8,
              pitches.map((n) => n.c)
            ),
            false,
            digit
          );
        }
        return true;
      }
      if (t.kind === 'note' || t.kind === 'chord' || t.kind === 'scale' || t.kind === 'pitches') {
        // these play on 1 only; 2 and 3 are swallowed (they are not note keys)
        if (kind !== 'listed') {
          return true;
        }
        if (t.kind === 'note') {
          const f = b.field[t.i];
          if (f) {
            startHeld(
              id,
              [{ hz: absHz(pitch(), f.c), src: t.i, delay: 0, dur: 0.6, amp: 1 }],
              false,
              digit
            );
          }
        } else if (t.kind === 'chord') {
          armFrom(t, true);
          startHeld(id, chordPlan(b.field, t.idx, pitch(), t.rootIdx), false, digit);
        } else if (t.kind === 'pitches') {
          armFrom(t, true);
          startHeld(
            id,
            pitchesPlan(b.field, b.repC, t.cents, pitch(), 1.8, t.light),
            false,
            digit,
            t.chords
          );
        } else {
          startHeld(
            id,
            fieldScalePlan(b.field, t.idx, b.repC, pitch(), u.scalePreview),
            true,
            digit
          );
        }
        return true;
      }
      const plan =
        t.kind === 'strip'
          ? stripPreviewPlan(b.field, t.i, t.dev, pitch(), kind)
          : modePreviewPlan(
              b.field,
              b.idx,
              t.mode,
              b.rep,
              b.repC,
              pitch(),
              kind,
              u.scalePreview,
              t.kind === 'tile' ? t.degree : undefined,
              u.modePlayback === 'relative'
            );
      startHeld(id, plan, t.kind === 'mode', digit);
      return true;
    };
    /**
     * Make the voices match the retuner's held keys: a new key starts a voice at the active card's pitch, a key that went
     * up stops its voice, and a voice whose pitch moved (a retune) glides there over the glide setting. What sounds lights
     * the tab's field note it coincides with (see `litIndex`), if any; the retuned pitch need not be a field note.
     */
    const syncRetuner = () => {
      const { retuner: r, ui: u, base: b } = latest.current;
      const want = new Map<number, number>();
      if (retunerLive(r)) {
        for (const h of r.held) {
          const hz = heldHz(r, h, u.baseHz);
          if (hz !== null) {
            want.set(h.key, hz);
          }
        }
      }
      for (const [slot, v] of [...rtVoices.current]) {
        if (!want.has(slot)) {
          engine.current?.stop(`rt${slot}`);
          rtVoices.current.delete(slot);
          light(v.src, false, false, v.ghost, v.hz);
        }
      }
      for (const [slot, hz] of want) {
        const cur = rtVoices.current.get(slot);
        // as the tab's own keys do (relHz): Parallel puts the tab's mode root on 1/1 Hz, so a pitch p above 1/1 is the
        // field note at p + rootC; Relative keeps absolute pitch
        const at = 1200 * Math.log2(hz / u.baseHz) + (u.modePlayback === 'relative' ? 0 : b.rootC);
        const src = litIndex(
          b.field.map((n) => n.c),
          b.repC,
          at
        );
        const ghost = src < 0 ? at : undefined;
        if (!cur) {
          const eng = getEngine();
          if (eng?.start(`rt${slot}`, hz)) {
            rtVoices.current.set(slot, { hz, src, ghost });
            light(src, true, false, ghost, hz);
          }
        } else if (Math.abs(cur.hz - hz) > 1e-9) {
          engine.current?.glideTo(`rt${slot}`, hz, r.settings.glideMs);
          // the pitch moved (so the Live roughness view follows the glide's target), whether or not the lit note changed
          light(cur.src, false, false, cur.ghost, cur.hz);
          light(src, true, false, ghost, hz);
          rtVoices.current.set(slot, { hz, src, ghost });
        }
      }
    };
    /**
     * The sound of melody key `slot` when the linked melody is on and a chord key has been pressed whose chord has a source
     * subset (Hz in the frame the Parallel | Relative switch says, and its field-absolute pitch for the lights); else null,
     * and the key plays the active subset.
     */
    const linkedSound = (slot: number): { hz: number; abs: number } | null => {
      const { ui: u, keys: k, shelf: sh } = latest.current;
      // the retuner owns the melody keys while it is live: the linked melody gives way to it
      if (
        !u.linkedMelody ||
        !playsChords(u.keyboardMode) ||
        k.link === null ||
        retunerLive(latest.current.retuner)
      ) {
        return null;
      }
      const sc: LinkedScale | null = linkedScaleOf(
        sh.find((c) => c.id === k.link),
        u.linkedRoot ?? readDeveloperOptions().linkedRootDefault
      );
      return sc ? linkedPitch(sc, slot, k.shift, u.modePlayback, u.baseHz) : null;
    };
    /** A chord key goes down: play shelf slot `index` of the current page as the shelf's own slot does, held until `endHeld(id)`. */
    const pressChord = (id: string, index: number): boolean => {
      const { base: b, ui: u, shelf: sh, keys: k } = latest.current;
      const last = Math.max(0, Math.ceil(sh.length / CHORD_PAGE) - 1);
      const chord = sh[Math.min(k.page, last) * CHORD_PAGE + index];
      if (!chord || chord.pitches.length === 0) {
        return false;
      }
      startHeld(
        id,
        pitchesPlan(
          b.field,
          b.repC,
          chordPitchesFor(chord, u.modePlayback).map((p) => p.c),
          pitch(),
          1.8,
          chord.pitches.map((p) => p.c)
        ),
        false,
        'chord',
        [chord.id]
      );
      if (u.linkedMelody) {
        dispatch({ type: 'keys/link', id: chord.id });
        latest.current.keys = { ...latest.current.keys, link: chord.id };
      }
      return true;
    };
    /** End every held chord key (a page change or a shelf edit moves what the keys mean). */
    const endChordKeys = () => {
      for (const [id, p] of [...previews.current]) {
        if (p.digit === 'chord') {
          endHeld(id);
        }
      }
    };
    /** The frame, the armed shape or the template changed under a resting pointer: a held 4 / 5 plays the new chord. */
    const refreshArmed = () => {
      const t = target.current;
      if (!t) {
        return;
      }
      // a chord chip's sound does not depend on the armed chord: arming it by this very hold must not restart the sound
      const chip =
        (t.kind === 'chord' && t.rootIdx !== undefined) || (t.kind === 'pitches' && t.positional);
      const now = soundKey();
      if (chip && armedAt.current === now) {
        return;
      }
      for (const [id, d] of heldDigits.current) {
        if (ARMED_DIGITS[d]) {
          playTarget(id, d, t);
        }
      }
    };
    return {
      enabled,
      syncRetuner,
      refreshArmed,
      pressChord,
      endChordKeys,
      linkedActive: () => linkedSound(0) !== null,
      setPreviewTarget: (t) => {
        const cur = target.current;
        // a note under a strip mark of the same note is the same pointer position: keep the strip target
        if (t && t.kind === 'note' && cur && cur.kind === 'strip' && cur.i === t.i) {
          return;
        }
        if (t && cur && previewTargetKey(t) === previewTargetKey(cur)) {
          target.current = t;
          return;
        }
        target.current = t;
        // while a digit is held, pointing at another target moves the sound there
        if (t) {
          for (const [id, digit] of heldDigits.current) {
            playTarget(id, digit, t);
          }
        }
      },
      clearPreviewTarget: (t) => {
        if (target.current && previewTargetKey(target.current) === previewTargetKey(t)) {
          target.current = null;
        }
      },
      holdPreview: (id, digit) => {
        const t = target.current;
        if (!t || (!HOLD_DIGITS[digit] && !ARMED_DIGITS[digit])) {
          return false;
        }
        heldDigits.current.set(id, digit);
        return playTarget(id, digit, t);
      },
      releasePreview: (id) => {
        heldDigits.current.delete(id);
        endHeld(id);
      },
      press: (slot) => {
        const { base: b, keys: k } = latest.current;
        if (retunerLive(latest.current.retuner)) {
          // the retuner owns the keys: the key goes into its held set, the effect below sounds it (the melody shift applies)
          dispatch({ type: 'ret/down', slot, t: performance.now(), shift: k.shift });
          return;
        }
        const eng = getEngine();
        if (!eng || slotSrc.current.has(slot)) {
          return;
        }
        const linked = linkedSound(slot);
        if (linked) {
          // the linked chord's source subset: audio only, it lights where it coincides with a field note of this tab
          const src = litIndex(
            b.field.map((n) => n.c),
            b.repC,
            linked.abs
          );
          const ghost = src < 0 ? linked.abs : undefined;
          if (eng.start(`k${slot}`, linked.hz)) {
            slotSrc.current.set(slot, src);
            slotGhost.current.set(slot, ghost);
            slotHz.current.set(slot, linked.hz);
            light(src, true, false, ghost, linked.hz);
          }
          return;
        }
        const p = slotPitch(slot, b.rel, b.repC, pitch(), k.shift);
        if (!p) {
          return;
        }
        if (eng.start(`k${slot}`, p.hz)) {
          slotSrc.current.set(slot, p.src);
          slotHz.current.set(slot, p.hz);
          light(p.src, true, false, undefined, p.hz);
        }
      },
      release: (slot) => {
        // always sent: the reducer ignores a slot that is not held
        dispatch({ type: 'ret/up', slot });
        const src = slotSrc.current.get(slot);
        if (src === undefined) {
          return;
        }
        engine.current?.stop(`k${slot}`);
        slotSrc.current.delete(slot);
        const ghost = slotGhost.current.get(slot);
        slotGhost.current.delete(slot);
        const hz = slotHz.current.get(slot);
        slotHz.current.delete(slot);
        light(src, false, false, ghost, hz);
      },
      playNote: (i) => {
        const f = latest.current.base.field[i];
        if (f) {
          schedule([{ hz: absHz(pitch(), f.c), src: i, delay: 0, dur: 0.6, amp: 1 }]);
        }
      },
      playScale: () => {
        const { base: b } = latest.current;
        schedule(scalePlan(b.rel, b.repC, pitch(), latest.current.ui.scalePreview));
      },
      playFieldScale: (idx) => {
        const { base: b, ui: u } = latest.current;
        schedule(fieldScalePlan(b.field, idx, b.repC, pitch(), u.scalePreview));
      },
      playChord: () => {
        const { base: b, chord: c } = latest.current;
        schedule(c.size > 0 ? chordPlan(b.field, c, pitch()) : subsetChordPlan(b.rel, pitch()));
      },
      playFieldChord: (idx, rootIdx) => {
        schedule(chordPlan(latest.current.base.field, idx, pitch(), rootIdx));
      },
      playCents: (cents, light, chords) => {
        const { base: b } = latest.current;
        schedule(pitchesPlan(b.field, b.repC, cents, pitch(), 1.8, light), chords);
      },
      playModePreview: (mode, kind, degree) => {
        const { base: b, ui: u } = latest.current;
        schedule(
          modePreviewPlan(
            b.field,
            b.idx,
            mode,
            b.rep,
            b.repC,
            pitch(),
            kind,
            u.scalePreview,
            degree,
            u.modePlayback === 'relative'
          )
        );
      },
      playStripPreview: (i, dev, kind) => {
        schedule(stripPreviewPlan(latest.current.base.field, i, dev, pitch(), kind));
      },
      stopAll,
      hzAt: (cents) => absHz(pitch(), cents),
    };
  }, [dispatch, enabled]);

  // everything sounding is silenced when the field changes (another tab, a regeneration): its lights would be wrong
  // (only when something is sounding or scheduled: a silent change must not touch voices that are fading out)
  useEffect(() => {
    if (
      lights.current.lit().length ||
      markLights.current.lit().length ||
      ghostLights.current.lit().length ||
      chordLights.current.size ||
      slotSrc.current.size ||
      rtVoices.current.size ||
      previews.current.size ||
      timers.current.size
    ) {
      api.stopAll();
    }
  }, [base.field, api]);

  // the retuner's voices follow its held keys, roots and glide, and what the pitches and lights are computed from (the
  // field, the 1/1 Hz setting). A field change panics first (above), which empties the held set this effect reads.
  useEffect(() => {
    api.syncRetuner();
  }, [
    api,
    retuner.held,
    retuner.active,
    retuner.bases,
    retuner.on,
    retuner.cards,
    base.field,
    base.rel,
    base.rootC,
    ui.baseHz,
    ui.modePlayback,
  ]);

  // a page change or a shelf that changed size ends the chord keys that are held (their cards go dark with them)
  useEffect(() => {
    api.endChordKeys();
  }, [api, keys.page, shelf.length]);

  useEffect(() => {
    api.refreshArmed();
  }, [api, ui.modePlayback, sketch.shape, sketch.template, sketch.rootDeg, sketch.positionalShape]);

  // keyboard, and the safety nets: blur, hidden tab, unmount
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const down = (e: KeyboardEvent) => {
      // the send popup (`-`) takes the digits first, and anything it already took
      if (sendHasKey(e)) {
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && !isTyping(e.target)) {
        const d = parseInt(e.key, 10);
        if (d >= 1 && d <= 9) {
          e.preventDefault();
          dispatch({ type: 'tab/switch', index: d - 1 });
        }
        return;
      }
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) {
        return;
      }
      if (e.key === SHORTCUTS.modePlayback && !e.shiftKey) {
        // plain 0 switches Parallel | Relative mode playback; it is no note key (4 and 5 are the armed-chord holds)
        e.preventDefault();
        dispatch({
          type: 'ui',
          patch: {
            modePlayback: latest.current.ui.modePlayback === 'relative' ? 'parallel' : 'relative',
          },
        });
        return;
      }
      if (e.code === 'Equal' || e.key === SHORTCUTS.stash || e.key === '+') {
        // = (or +, the same physical key) stashes the current Sketch, as the Stash button does
        const { base: b, ui: u, sketch: sk } = latest.current;
        const posPitches = sk.positional
          ? sketchPositionalPitches(b.field, b.rep, b.idx, b.mode, sk)
          : null;
        const posSteps = sk.positional ? parsePattern(sk.positional.pattern) : null;
        if (sk.positional) {
          // M9: a positional chord stashes its pattern (template = the display text, `2-2 on 4`)
          if (posPitches && posSteps && b.rel.length) {
            const deg = sk.rootDeg % b.rel.length;
            e.preventDefault();
            dispatch({
              type: 'shelf/stash',
              stash: {
                pitches: posPitches,
                template: positionalLabel(posSteps, deg),
                pattern: sk.positional.pattern,
                rootDeg: deg,
                date: new Date().toISOString(),
              },
            });
          }
          return;
        }
        const made = sketchChord(b.field, b.rep, b.rel, sk, u.tol);
        if (made) {
          e.preventDefault();
          dispatch({
            type: 'shelf/stash',
            stash: {
              pitches: made.pitches,
              template: sk.template,
              rootDeg: made.deg,
              date: new Date().toISOString(),
            },
          });
        }
        return;
      }
      if ((HOLD_DIGITS[e.key] || ARMED_DIGITS[e.key]) && api.holdPreview(keyId(e), e.key)) {
        e.preventDefault();
        return;
      }
      const sh = shiftOfEvent(e);
      if (sh !== 0) {
        // , / . shift the melody by one repeat (every mode); held voices keep their pitch
        e.preventDefault();
        dispatch({ type: 'keys/shift', by: sh });
        latest.current.keys = {
          ...latest.current.keys,
          shift: clampShift(latest.current.keys.shift + sh),
        };
        return;
      }
      const mode = latest.current.ui.keyboardMode;
      if (playsChords(mode)) {
        const pg = pageOfEvent(e);
        if (pg !== 0) {
          e.preventDefault();
          dispatch({ type: 'keys/page', by: pg });
          return;
        }
        const ck = chordSlotOfEvent(e);
        if (ck >= 0) {
          e.preventDefault();
          api.pressChord(keyId(e), ck);
          return;
        }
      }
      if (!playsMelody(mode)) {
        // M8f: in Chords mode the melody keys are SILENT root keys: they move the Sketch root stepper to the key's degree of
        // this tab (never the linked melody's) and make no sound, no voice and no `held` entry
        const rs = slotOfEvent(e);
        const rt = rs < 0 ? null : slotTarget(rs, latest.current.base.rel.length);
        if (rt) {
          e.preventDefault();
          dispatch({ type: 'sketch/set', patch: { rootDeg: rt.deg } });
        }
        return;
      }
      const slot = slotOfEvent(e);
      if (slot < 0) {
        return;
      }
      e.preventDefault();
      // a melody key also moves the Sketch row's root to that key's degree (octave repeats are the same degree)
      // (not when the linked melody plays another subset: its degrees are not this tab's)
      const t = slotTarget(slot, latest.current.base.rel.length);
      if (t && !api.linkedActive()) {
        dispatch({ type: 'sketch/set', patch: { rootDeg: t.deg } });
      }
      held.current.set(keyId(e), slot);
      api.press(slot);
    };
    const up = (e: KeyboardEvent) => {
      const id = keyId(e);
      api.releasePreview(id);
      const slot = held.current.get(id);
      if (slot !== undefined) {
        held.current.delete(id);
        api.release(slot);
      }
    };
    const silence = () => api.stopAll();
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        api.stopAll();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', silence);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', silence);
      document.removeEventListener('visibilitychange', hidden);
      api.stopAll();
      engine.current?.dispose();
      engine.current = null;
    };
  }, [api, dispatch, enabled]);

  return api;
}
