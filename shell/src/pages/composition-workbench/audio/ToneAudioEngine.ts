import type { Gain, PolySynth } from 'tone';
import {
  addDuration,
  compareRational,
  musicalDurationToTicks,
  musicalPositionToTicks,
  musicalPositionToSeconds,
  rational,
} from '../musicalTime';
import { pitchFrequency } from '../pitch';
import { instrumentRegistry } from './instrumentRegistry';
import type {
  AudioEngine,
  MusicalPerformanceEvent,
  MusicalPerformancePlan,
  PlaybackRequest,
  PlaybackSession,
  PerformanceEvent,
  PerformancePlan,
  SecondsPerformanceEvent,
  SecondsPerformancePlan,
} from './types';

type ToneModule = typeof import('tone');

interface ActiveSession {
  id: string;
  sourceId: string;
  active: boolean;
  buses: Map<string, Gain>;
  instruments: Map<string, PolySynth>;
  timebaseKind: 'seconds' | 'musical';
  transportScheduleIds: number[];
  timer?: ReturnType<typeof globalThis.setTimeout>;
  onComplete?: () => void;
}

function sessionId(sourceId: string) {
  return `${sourceId}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function clampGain(gain: number) {
  return Math.max(0, Math.min(1, gain));
}

function isSecondsPlan(plan: PerformancePlan): plan is SecondsPerformancePlan {
  return plan.timebase.kind === 'seconds';
}

export class ToneAudioEngine implements AudioEngine {
  private tone?: ToneModule;
  private master?: Gain;
  private sessions = new Map<string, ActiveSession>();

  constructor(private readonly loadTone: () => Promise<ToneModule> = () => import('tone')) {}

  async play(request: PlaybackRequest): Promise<PlaybackSession> {
    this.stopSource(request.plan.sourceId);
    if (request.plan.timebase.kind === 'musical') {
      [...this.sessions.values()]
        .filter((session) => session.timebaseKind === 'musical')
        .forEach((session) => this.finishSession(session.id, false));
    }
    const tone = await this.ensureReady();
    const id = sessionId(request.plan.sourceId);
    const state: ActiveSession = {
      id,
      sourceId: request.plan.sourceId,
      active: true,
      buses: new Map(),
      instruments: new Map(),
      timebaseKind: request.plan.timebase.kind,
      transportScheduleIds: [],
      onComplete: request.onComplete,
    };
    this.sessions.set(id, state);

    if (isSecondsPlan(request.plan)) {
      const start = tone.now() + 0.06;
      [...request.plan.events]
        .sort((left, right) => left.atSeconds - right.atSeconds)
        .forEach((event) => this.scheduleSecondsEvent(tone, state, event, start, request.busGains));

      state.timer = globalThis.setTimeout(
        () => this.finishSession(id, true),
        (request.plan.durationSeconds + 0.3) * 1000
      );
    } else {
      this.scheduleMusicalPlan(tone, state, request.plan, request.busGains);
    }

    return {
      id,
      sourceId: state.sourceId,
      get active() {
        return state.active;
      },
      setBusGain: (busId, gain) => this.setBusGain(id, busId, gain),
      stop: () => this.finishSession(id, false),
    };
  }

  stopSource(sourceId: string) {
    [...this.sessions.values()]
      .filter((session) => session.sourceId === sourceId)
      .forEach((session) => this.finishSession(session.id, false));
  }

  stopAll() {
    [...this.sessions.keys()].forEach((id) => this.finishSession(id, false));
  }

  dispose() {
    this.stopAll();
    this.master?.dispose();
    this.master = undefined;
  }

  private async ensureReady() {
    this.tone ??= await this.loadTone();
    await this.tone.start();
    this.master ??= new this.tone.Gain(1).toDestination();
    return this.tone;
  }

  private scheduleSecondsEvent(
    tone: ToneModule,
    session: ActiveSession,
    event: SecondsPerformanceEvent,
    start: number,
    initialGains: Record<string, number> | undefined
  ) {
    const instrument = this.getInstrument(tone, session, event, initialGains);
    instrument.triggerAttackRelease(
      pitchFrequency(event.pitchMidicents),
      event.durationSeconds,
      start + event.atSeconds,
      Math.max(0, Math.min(1, event.velocity))
    );
  }

  private scheduleMusicalPlan(
    tone: ToneModule,
    session: ActiveSession,
    plan: MusicalPerformancePlan,
    initialGains: Record<string, number> | undefined
  ) {
    if (compareRational(plan.duration.quarterNotes, rational(0)) <= 0) {
      throw new Error('A musical performance plan requires a positive duration.');
    }
    musicalPositionToSeconds(
      { quarterNotes: plan.duration.quarterNotes },
      plan.timebase.timeline.tempoMap
    );
    plan.events.forEach((event) => {
      if (compareRational(event.at.quarterNotes, rational(0)) < 0) {
        throw new Error(`${event.id} begins before the musical timeline origin.`);
      }
      if (compareRational(event.duration.quarterNotes, rational(0)) <= 0) {
        throw new Error(`${event.id} requires a positive musical duration.`);
      }
      if (
        compareRational(
          addDuration(event.at, event.duration).quarterNotes,
          plan.duration.quarterNotes
        ) > 0
      ) {
        throw new Error(`${event.id} extends beyond the performance-plan duration.`);
      }
    });
    const transport = tone.getTransport();
    const ppq = transport.PPQ;
    const baseTicks = transport.ticks + Math.max(1, ppq / 16);
    const tempoChanges = [...plan.timebase.timeline.tempoMap].sort(
      (left, right) => musicalPositionToTicks(left.at, ppq) - musicalPositionToTicks(right.at, ppq)
    );
    transport.bpm.value = tempoChanges[0].bpm;

    tempoChanges.slice(1).forEach((change) => {
      const scheduleId = transport.schedule(
        (time) => transport.bpm.setValueAtTime(change.bpm, time),
        tone.Ticks(baseTicks + musicalPositionToTicks(change.at, ppq))
      );
      session.transportScheduleIds.push(scheduleId);
    });

    [...plan.events]
      .sort(
        (left, right) =>
          musicalPositionToTicks(left.at, ppq) - musicalPositionToTicks(right.at, ppq)
      )
      .forEach((event) =>
        this.scheduleMusicalEvent(tone, session, event, plan, baseTicks, ppq, initialGains)
      );

    const completionId = transport.schedule(
      (time) => {
        void time;
        globalThis.setTimeout(() => this.finishSession(session.id, true), 0);
      },
      tone.Ticks(baseTicks + musicalDurationToTicks(plan.duration, ppq))
    );
    session.transportScheduleIds.push(completionId);
    if (transport.state !== 'started') {
      transport.start(tone.now() + 0.06);
    }
  }

  private scheduleMusicalEvent(
    tone: ToneModule,
    session: ActiveSession,
    event: MusicalPerformanceEvent,
    plan: MusicalPerformancePlan,
    baseTicks: number,
    ppq: number,
    initialGains: Record<string, number> | undefined
  ) {
    const instrument = this.getInstrument(tone, session, event, initialGains);
    const end = addDuration(event.at, event.duration);
    const durationSeconds =
      musicalPositionToSeconds(end, plan.timebase.timeline.tempoMap) -
      musicalPositionToSeconds(event.at, plan.timebase.timeline.tempoMap);
    const scheduleId = tone
      .getTransport()
      .schedule(
        (time) =>
          instrument.triggerAttackRelease(
            pitchFrequency(event.pitchMidicents),
            durationSeconds,
            time,
            Math.max(0, Math.min(1, event.velocity))
          ),
        tone.Ticks(baseTicks + musicalPositionToTicks(event.at, ppq))
      );
    session.transportScheduleIds.push(scheduleId);
  }

  private getInstrument(
    tone: ToneModule,
    session: ActiveSession,
    event: PerformanceEvent,
    initialGains: Record<string, number> | undefined
  ) {
    const bus = this.getBus(tone, session, event.busId, initialGains?.[event.busId] ?? 1);
    const instrumentKey = `${event.busId}:${event.instrumentId}`;
    let instrument = session.instruments.get(instrumentKey);
    if (!instrument) {
      const definition = instrumentRegistry[event.instrumentId];
      instrument = new tone.PolySynth(tone.Synth, {
        oscillator: { type: definition.oscillator },
        envelope: definition.envelope,
      }).connect(bus);
      session.instruments.set(instrumentKey, instrument);
    }
    return instrument;
  }

  private getBus(tone: ToneModule, session: ActiveSession, busId: string, initialGain: number) {
    let bus = session.buses.get(busId);
    if (!bus) {
      bus = new tone.Gain(clampGain(initialGain)).connect(this.master!);
      session.buses.set(busId, bus);
    }
    return bus;
  }

  private setBusGain(sessionId: string, busId: string, gain: number) {
    const bus = this.sessions.get(sessionId)?.buses.get(busId);
    if (!bus) {
      return;
    }
    bus.gain.rampTo(clampGain(gain), 0.008);
  }

  private finishSession(id: string, completed: boolean) {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }
    session.active = false;
    if (session.timer !== undefined) {
      globalThis.clearTimeout(session.timer);
    }
    const transport = this.tone?.getTransport();
    session.transportScheduleIds.forEach((scheduleId) => transport?.clear(scheduleId));
    session.instruments.forEach((instrument) => {
      instrument.releaseAll();
      instrument.dispose();
    });
    session.buses.forEach((bus) => bus.dispose());
    this.sessions.delete(id);
    if (completed) {
      session.onComplete?.();
    }
  }
}
