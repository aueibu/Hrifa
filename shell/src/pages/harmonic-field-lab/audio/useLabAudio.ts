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
  scalePlan,
  slotPitch,
  subsetChordPlan,
  type PitchBase,
  type Planned,
} from './plan';

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
  const timers = useRef(new Set<number>());
  const slotSrc = useRef(new Map<number, number>());
  /** Physical key (see `keyId`) to the slot it pressed, so a release finds it even when Shift changed `event.key`. */
  const held = useRef(new Map<string, number>());
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
    const report = () => dispatch({ type: 'sounding', idx: lights.current.lit() });
    const light = (i: number, on: boolean) => {
      if (on ? lights.current.on(i) : lights.current.off(i)) {
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
          light(n.src, true);
        }, start);
        const off = window.setTimeout(
          () => {
            timers.current.delete(off);
            light(n.src, false);
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
      const had = lights.current.lit().length > 0;
      lights.current.clear();
      if (had) {
        report();
      }
    };
    return {
      enabled,
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
        schedule(scalePlan(b.rel, b.repC, pitch()));
      },
      playChord: () => {
        const { base: b, chord: c } = latest.current;
        schedule(c.size > 0 ? chordPlan(b.field, c, pitch()) : subsetChordPlan(b.rel, pitch()));
      },
      playFieldChord: (idx) => {
        schedule(chordPlan(latest.current.base.field, idx, pitch()));
      },
      stopAll,
      hzAt: (cents) => absHz(pitch(), cents),
    };
  }, [dispatch, enabled]);

  // everything sounding is silenced when the field changes (another tab, a regeneration): its lights would be wrong
  // (only when something is sounding or scheduled: a silent change must not touch voices that are fading out)
  useEffect(() => {
    if (lights.current.lit().length || slotSrc.current.size || timers.current.size) {
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
