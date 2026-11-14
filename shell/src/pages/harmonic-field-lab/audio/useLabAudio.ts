/**
 * Connects the voice engine to the lab: computer keys and dock keys hold voices, Play scale / Play chord schedule
 * timed notes, and whatever sounds is reported to the lab state (`sounding`), which every view lights green (H-2).
 *
 * Nothing is left sounding: window blur, the tab being hidden, switching to another tab (the field changes) and
 * unmounting all silence everything. The AudioContext is created by the engine on the first note, i.e. on a user gesture.
 */
import { useEffect, useMemo, useRef, type Dispatch } from 'react';
import type { LabAudio } from '../state/context';
import type { Base } from '../state/derive';
import type { Action, UiSettings } from '../state/labState';
import { VoiceEngine } from './engine';
import { isTyping, keyId, slotOfEvent } from './keymap';
import {
  LightCounter,
  absHz,
  chordPlan,
  fieldScalePlan,
  HOLD_DIGITS,
  modePreviewPlan,
  previewTargetKey,
  stripPreviewPlan,
  scalePlan,
  slotPitch,
  subsetChordPlan,
  type PitchBase,
  type Planned,
  type PreviewTarget,
} from './plan';

/** One note of a hold-1/2/3 preview: its voice, what it lights, and whether it is sounding now. */
interface HeldNote {
  vid: string;
  src: number;
  markOnly?: boolean;
  on: boolean;
}
/** A running hold-1/2/3 preview: its notes and the timers that step through a whole mode. */
interface HeldPreview {
  /** The digit that started it, to restart on another target. */
  digit: string;
  notes: HeldNote[];
  timers: number[];
}

interface Args {
  enabled: boolean;
  base: Base;
  ui: UiSettings;
  /** The highlighted chord (field indices); empty when none. */
  chord: ReadonlySet<number>;
  dispatch: Dispatch<Action>;
}

/** Delay (s) before a scheduled plan starts, so the first note is not clipped. */
const LEAD = 0.05;

export function useLabAudio({ enabled, base, ui, chord, dispatch }: Args): LabAudio {
  const engine = useRef<VoiceEngine | null>(null);
  const lights = useRef(new LightCounter());
  const markLights = useRef(new LightCounter());
  const timers = useRef(new Set<number>());
  const slotSrc = useRef(new Map<number, number>());
  /** Physical key (see `keyId`) to the slot it pressed, so a release finds it even when Shift changed `event.key`. */
  const held = useRef(new Map<string, number>());
  /** What the pointer / focus is on, for the hold-1/2/3 previews. */
  const target = useRef<PreviewTarget | null>(null);
  /** Running hold previews by physical key (see `keyId`). */
  const previews = useRef(new Map<string, HeldPreview>());
  /** Digit keys currently down (by physical key), whether or not they sound anything on the current target. */
  const heldDigits = useRef(new Map<string, string>());
  const applied = useRef({ volume: NaN, wave: '' });
  const latest = useRef({ base, ui, chord, enabled });
  useEffect(() => {
    latest.current = { base, ui, chord, enabled };
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

  const api = useMemo<LabAudio>(() => {
    const pitch = (): PitchBase => ({
      baseHz: latest.current.ui.baseHz,
      rootC: latest.current.base.rootC,
      modeAtBase: latest.current.ui.modeAtBase,
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
      dispatch({ type: 'sounding', idx: lights.current.lit(), marks: markLights.current.lit() });
    const light = (i: number, on: boolean, markOnly = false) => {
      if (i < 0) {
        return;
      }
      const c = markOnly ? markLights.current : lights.current;
      if (on ? c.on(i) : c.off(i)) {
        report();
      }
    };
    const schedule = (plan: Planned[]) => {
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
          light(n.src, true, n.markOnly);
        }, start);
        const off = window.setTimeout(
          () => {
            timers.current.delete(off);
            light(n.src, false, n.markOnly);
          },
          start + n.dur * 1000
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
      held.current.clear();
      previews.current.clear();
      heldDigits.current.clear();
      const had = lights.current.lit().length > 0 || markLights.current.lit().length > 0;
      lights.current.clear();
      markLights.current.clear();
      if (had) {
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
      p.timers.forEach((t) => {
        window.clearTimeout(t);
        timers.current.delete(t);
      });
      for (const n of p.notes) {
        if (n.on) {
          n.on = false;
          engine.current?.stop(n.vid);
          light(n.src, false, n.markOnly);
        }
      }
    };
    /**
     * Hold a preview: every note of the plan is a held voice that starts at its delay. A single note (delay 0) sounds
     * until `endHeld`; a whole mode also ends each step on its own timer, so the steps play in order and it stops at the end.
     */
    const startHeld = (id: string, plan: Planned[], stepped: boolean, digit: string) => {
      const eng = getEngine();
      if (!eng || plan.length === 0) {
        return;
      }
      endHeld(id);
      const p: HeldPreview = { digit, notes: [], timers: [] };
      previews.current.set(id, p);
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
          on: false,
        };
        p.notes.push(note);
        const begin = () => {
          if (eng.start(note.vid, n.hz, n.amp)) {
            note.on = true;
            light(n.src, true, n.markOnly);
          }
        };
        const end = () => {
          if (note.on) {
            note.on = false;
            eng.stop(note.vid);
            light(n.src, false, n.markOnly);
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
    const playTarget = (id: string, digit: string, t: PreviewTarget): boolean => {
      const kind = HOLD_DIGITS[digit];
      if (!kind) {
        return false;
      }
      endHeld(id);
      const { base: b, ui: u } = latest.current;
      if (t.kind === 'note' || t.kind === 'chord' || t.kind === 'scale') {
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
          startHeld(id, chordPlan(b.field, t.idx, pitch()), false, digit);
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
    return {
      enabled,
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
        if (!t || !HOLD_DIGITS[digit]) {
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
        const { base: b } = latest.current;
        const eng = getEngine();
        const p = slotPitch(slot, b.rel, b.repC, pitch());
        if (!eng || !p || slotSrc.current.has(slot)) {
          return;
        }
        if (eng.start(`k${slot}`, p.hz)) {
          slotSrc.current.set(slot, p.src);
          light(p.src, true);
        }
      },
      release: (slot) => {
        const src = slotSrc.current.get(slot);
        if (src === undefined) {
          return;
        }
        engine.current?.stop(`k${slot}`);
        slotSrc.current.delete(slot);
        light(src, false);
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
      playFieldChord: (idx) => {
        schedule(chordPlan(latest.current.base.field, idx, pitch()));
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
      slotSrc.current.size ||
      previews.current.size ||
      timers.current.size
    ) {
      api.stopAll();
    }
  }, [base.field, api]);

  // keyboard, and the safety nets: blur, hidden tab, unmount
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const down = (e: KeyboardEvent) => {
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
      if (e.key === '5' && !e.shiftKey) {
        // plain 5 switches Parallel | Relative mode playback; it is no note key
        e.preventDefault();
        dispatch({
          type: 'ui',
          patch: {
            modePlayback: latest.current.ui.modePlayback === 'relative' ? 'parallel' : 'relative',
          },
        });
        return;
      }
      if (HOLD_DIGITS[e.key] && api.holdPreview(keyId(e), e.key)) {
        e.preventDefault();
        return;
      }
      const slot = slotOfEvent(e);
      if (slot < 0) {
        return;
      }
      e.preventDefault();
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
