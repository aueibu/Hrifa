import type { Gain, PolySynth } from 'tone';
import { volumePercentToGain } from '../audio';
import {
  addDuration,
  compareRational,
  musicalDurationToTicks,
  musicalPositionToTicks,
  musicalPositionToSeconds,
  rational,
  type Rational,
} from '../musicalTime';
import { pitchFrequency } from '../pitch';
import { defaultSoundSettings, type SoundSet } from '../sounds';
import {
  applyTransport,
  COUNT_IN_BUS,
  countInQuarterNotes,
  countInSeconds,
  defaultTransportSettings,
  METER_BUS,
  transportBusGain,
  type TransportSettings,
} from '../transport';
import { instrumentDefinition, type SampledInstrumentDefinition } from './instrumentRegistry';
import { soundfontVoice } from './soundfontLibrary';
import type { SoundfontNote } from './soundfontSynth';
import type {
  AudioEngine,
  InstrumentId,
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
type SamplerModule = typeof import('smplr');
type SoundfontRenderer = typeof import('./soundfontSynth');

/** Longest release a sampled voice is allowed to ring (the sampled players clamp their releases to this). */
const SAMPLED_TAIL_SECONDS = 4.5;
/** When a session is stopped by hand, sampled voices fade over this long instead of being cut. */
const STOP_FADE_SECONDS = 0.08;

/** What the engine needs from any voice, whether synthesized or sampled. */
interface Voice {
  triggerAttackRelease(
    frequency: number,
    durationSeconds: number,
    time: number,
    velocity: number
  ): void;
  releaseAll(): void;
  dispose(): void;
  /**
   * Sampled voices keep ringing after their last note ends. When a session finishes on its own, its buses
   * stay up this long so a note's release plays out instead of being cut at the plan's end.
   */
  tailSeconds?: number;
}

/**
 * A loaded sampled instrument. It outlives sessions (its samples are the expensive part), so it keeps its own
 * output gain and is routed to whichever session's bus is playing it; a session's `dispose` only unplugs it.
 */
/** The part of a `smplr` instrument the engine uses. */
interface SampleVoice {
  readonly ready: Promise<unknown>;
  start(event: {
    note: number;
    detune?: number;
    time?: number;
    duration?: number;
    velocity?: number;
  }): unknown;
  stop(): void;
}

interface SampledEntry {
  out: Gain;
  instrument: SampleVoice;
  /** The session bus `out` currently feeds. */
  bus?: Gain;
}

interface ActiveSession {
  id: string;
  sourceId: string;
  active: boolean;
  buses: Map<string, Gain>;
  instruments: Map<string, Voice>;
  timebaseKind: 'seconds' | 'musical';
  /** performance.now() when the material (not the count-in) starts sounding. */
  startedAtMs: number;
  /** True while this session holds the global transport in loop mode. */
  looping: boolean;
  /** Length of one pass in seconds when looping. */
  loopSeconds?: number;
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

/** A SoundFont note is rendered ahead of time rather than triggered on a voice. */
const isSoundfontEvent = (event: PerformanceEvent) =>
  instrumentDefinition(event.instrumentId).kind === 'soundfont';

interface SoundfontPlayback {
  busId: string;
  buffer: AudioBuffer;
  /** Length of the rendered audio, which includes the notes' release tails. */
  seconds: number;
}

function isSecondsPlan(plan: PerformancePlan): plan is SecondsPerformancePlan {
  return plan.timebase.kind === 'seconds';
}

export class ToneAudioEngine implements AudioEngine {
  private tone?: ToneModule;
  private master?: Gain;
  private sessions = new Map<string, ActiveSession>();
  private listeners = new Set<() => void>();
  private transport: TransportSettings = defaultTransportSettings;
  private metronomeSounds: SoundSet = defaultSoundSettings.metronome;
  private smplr?: SamplerModule;
  private sampled = new Map<InstrumentId, SampledEntry>();

  constructor(
    private readonly loadTone: () => Promise<ToneModule> = () => import('tone'),
    private readonly loadSampler: () => Promise<SamplerModule> = () => import('smplr'),
    private readonly loadSoundfontRenderer: () => Promise<SoundfontRenderer> = () =>
      import('./soundfontSynth')
  ) {}

  get playing() {
    return this.sessions.size > 0;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setTransport(settings: TransportSettings, metronomeSounds?: SoundSet) {
    this.transport = settings;
    this.metronomeSounds = metronomeSounds ?? this.metronomeSounds;
    this.sessions.forEach((session) =>
      [METER_BUS, COUNT_IN_BUS].forEach((busId) => {
        const gain = transportBusGain(busId, settings, volumePercentToGain);
        if (gain !== undefined) {
          this.setBusGain(session.id, busId, gain);
        }
      })
    );
  }

  clock(sourceId: string) {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.sourceId === sourceId
    );
    return session
      ? {
          startedAtMs: session.startedAtMs,
          ...(session.looping ? { loopSeconds: session.loopSeconds } : {}),
        }
      : undefined;
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  async play(original: PlaybackRequest): Promise<PlaybackSession> {
    if (original.loop && original.plan.timebase.kind !== 'musical') {
      throw new Error('Looping requires a musical performance plan.');
    }
    const request: PlaybackRequest = original.followTransport
      ? {
          ...original,
          plan: applyTransport(original.plan, this.transport, this.metronomeSounds),
          busGains: {
            ...original.busGains,
            [METER_BUS]: transportBusGain(METER_BUS, this.transport, volumePercentToGain)!,
            [COUNT_IN_BUS]: transportBusGain(COUNT_IN_BUS, this.transport, volumePercentToGain)!,
          },
        }
      : original;
    this.stopSource(request.plan.sourceId);
    if (request.plan.timebase.kind === 'musical') {
      [...this.sessions.values()]
        .filter((session) => session.timebaseKind === 'musical')
        .forEach((session) => this.finishSession(session.id, false));
    }
    const tone = await this.ensureReady();
    await this.loadSampledVoices(tone, request.plan);
    const soundfonts = await this.renderSoundfontEvents(tone, request.plan);
    if (original.loop && soundfonts.length) {
      throw new Error('SoundFont voices cannot be used in a looping plan yet.');
    }
    const id = sessionId(request.plan.sourceId);
    const state: ActiveSession = {
      id,
      sourceId: request.plan.sourceId,
      active: true,
      buses: new Map(),
      instruments: new Map(),
      timebaseKind: request.plan.timebase.kind,
      looping: false,
      // Both timebases start 60 ms ahead (see the scheduling below).
      startedAtMs:
        performance.now() +
        60 +
        (original.followTransport ? countInSeconds(this.transport) * 1000 : 0),
      transportScheduleIds: [],
      onComplete: request.onComplete,
    };
    this.sessions.set(id, state);
    this.notify();

    const players = soundfonts.map((playback, index) =>
      this.addSoundfontPlayer(tone, state, playback, index, request.busGains)
    );
    if (isSecondsPlan(request.plan)) {
      const start = tone.now() + 0.06;
      players.forEach((player) => player.start(start));
      request.plan.events
        .filter((event) => !isSoundfontEvent(event))
        .sort((left, right) => left.atSeconds - right.atSeconds)
        .forEach((event) => this.scheduleSecondsEvent(tone, state, event, start, request.busGains));

      state.timer = globalThis.setTimeout(
        () => this.finishSession(id, true),
        (request.plan.durationSeconds + 0.3) * 1000
      );
    } else {
      // One pass is the caller's own plan length; applyTransport lengthens the scheduled plan with
      // count-in and click tails, which must not become part of the loop.
      const loop = original.loop
        ? {
            start: original.followTransport ? countInQuarterNotes(this.transport) : rational(0),
            length: (original.plan as MusicalPerformancePlan).duration.quarterNotes,
          }
        : undefined;
      const playable = {
        ...request.plan,
        events: request.plan.events.filter((event) => !isSoundfontEvent(event)),
      };
      this.scheduleMusicalPlan(tone, state, playable, request.busGains, loop, (baseTicks) =>
        players.forEach((player) => {
          const scheduleId = tone
            .getTransport()
            .schedule((time) => player.start(time), tone.Ticks(baseTicks));
          state.transportScheduleIds.push(scheduleId);
        })
      );
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
    this.sampled.forEach((entry) => {
      entry.instrument.stop();
      entry.out.dispose();
    });
    this.sampled.clear();
    this.master?.dispose();
    this.master = undefined;
  }

  /** Download (once) every sampled instrument the plan uses, so scheduling never waits on the network. */
  private async loadSampledVoices(tone: ToneModule, plan: PerformancePlan) {
    const wanted = new Set<InstrumentId>(
      plan.events
        .map((event) => event.instrumentId)
        .filter((id) => instrumentDefinition(id).kind === 'sampled')
    );
    if (!wanted.size) {
      return;
    }
    this.smplr ??= await this.loadSampler();
    const smplr = this.smplr;
    const context = tone.getContext().rawContext as unknown as AudioContext;
    await Promise.all(
      [...wanted].map(async (id) => {
        let entry = this.sampled.get(id);
        if (!entry) {
          const definition = instrumentDefinition(id) as SampledInstrumentDefinition;
          const out = new tone.Gain(1);
          const destination = out.input as unknown as AudioNode;
          const instrument: SampleVoice = smplr.Soundfont(context, {
            instrument: definition.soundfont,
            destination,
          });
          entry = { out, instrument };
          this.sampled.set(id, entry);
        }
        try {
          await entry.instrument.ready;
        } catch (error) {
          // a failed download must not leave a dead instrument cached: the next play tries again
          this.sampled.delete(id);
          entry.out.dispose();
          throw error;
        }
      })
    );
  }

  /**
   * Render every SoundFont note of the plan to audio, one buffer per bus. The synthesizer runs ahead of
   * playback, so this finishes before the session is created and scheduling never waits on it.
   */
  private async renderSoundfontEvents(
    tone: ToneModule,
    plan: PerformancePlan
  ): Promise<SoundfontPlayback[]> {
    const events = plan.events.filter(isSoundfontEvent);
    if (!events.length) {
      return [];
    }
    const groups = new Map<
      string,
      {
        busId: string;
        voice: NonNullable<ReturnType<typeof soundfontVoice>>;
        notes: SoundfontNote[];
      }
    >();
    const tempoMap = isSecondsPlan(plan) ? undefined : plan.timebase.timeline.tempoMap;
    events.forEach((event) => {
      const voice = soundfontVoice(event.instrumentId);
      if (!voice) {
        throw new Error('The SoundFont for this sound is not loaded. Open the file again.');
      }
      const key = `${voice.fileId}|${event.busId}`;
      let group = groups.get(key);
      if (!group) {
        group = { busId: event.busId, voice, notes: [] };
        groups.set(key, group);
      }
      let at: number;
      let durationSeconds: number;
      if ('atSeconds' in event) {
        at = event.atSeconds;
        durationSeconds = event.durationSeconds;
      } else {
        at = musicalPositionToSeconds(event.at, tempoMap!);
        durationSeconds =
          musicalPositionToSeconds(addDuration(event.at, event.duration), tempoMap!) - at;
      }
      group.notes.push({
        at,
        durationSeconds,
        midi: event.pitchMidicents / 100,
        velocity: Math.max(0, Math.min(1, event.velocity)),
        patch: voice.patch,
      });
    });
    const renderer = await this.loadSoundfontRenderer();
    const context = tone.getContext();
    const sampleRate = context.sampleRate;
    return Promise.all(
      [...groups.values()].map(async (group) => {
        const rendered = await renderer.renderSoundfont({
          bank: group.voice.bank,
          notes: group.notes,
          sampleRate,
        });
        const buffer = context.rawContext.createBuffer(2, rendered.left.length, sampleRate);
        buffer.getChannelData(0).set(rendered.left);
        buffer.getChannelData(1).set(rendered.right);
        return { busId: group.busId, buffer, seconds: rendered.left.length / sampleRate };
      })
    );
  }

  /** Put a rendered SoundFont buffer on its bus. The session owns the player and its tail. */
  private addSoundfontPlayer(
    tone: ToneModule,
    session: ActiveSession,
    playback: SoundfontPlayback,
    index: number,
    initialGains: Record<string, number> | undefined
  ) {
    const bus = this.getBus(tone, session, playback.busId, initialGains?.[playback.busId] ?? 1);
    const player = new tone.Player(playback.buffer).connect(bus) as import('tone').Player;
    session.instruments.set(`soundfont:${index}`, {
      triggerAttackRelease: () => undefined,
      releaseAll: () => player.stop(),
      dispose: () => player.dispose(),
      // the rendered audio already holds the release tails; let a finished plan play them out
      tailSeconds: playback.seconds,
    });
    return player;
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
    initialGains: Record<string, number> | undefined,
    loop?: { start: Rational; length: Rational },
    onBaseTicks?: (baseTicks: number) => void
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

    let loopStartTicks = 0;
    if (loop) {
      // Loop points are whole ticks so every pass restarts on the same tick; a pass length that is
      // not a whole number of ticks (a 7-tuplet at 960 PPQ) is rounded, drifting under half a tick.
      loopStartTicks = Math.round(
        baseTicks + musicalDurationToTicks({ quarterNotes: loop.start }, ppq)
      );
      const loopEndTicks =
        loopStartTicks + Math.round(musicalDurationToTicks({ quarterNotes: loop.length }, ppq));
      if (loopEndTicks <= loopStartTicks) {
        throw new Error('A looping plan requires a pass of at least one tick.');
      }
      // Tone reads a bare number as seconds, so ticks go in as "<n>i" notation.
      transport.loopStart = `${loopStartTicks}i`;
      transport.loopEnd = `${loopEndTicks}i`;
      transport.loop = true;
      session.looping = true;
      session.loopSeconds = musicalPositionToSeconds(
        { quarterNotes: loop.length },
        plan.timebase.timeline.tempoMap
      );
      if (tempoChanges.length > 1) {
        // Each pass starts at the plan's opening tempo, not wherever the last pass left it.
        const resetId = transport.schedule(
          (time) => transport.bpm.setValueAtTime(tempoChanges[0].bpm, time),
          tone.Ticks(loopStartTicks)
        );
        session.transportScheduleIds.push(resetId);
      }
    }

    tempoChanges.slice(1).forEach((change) => {
      const scheduleId = transport.schedule(
        (time) => transport.bpm.setValueAtTime(change.bpm, time),
        tone.Ticks(baseTicks + musicalPositionToTicks(change.at, ppq))
      );
      session.transportScheduleIds.push(scheduleId);
    });

    onBaseTicks?.(baseTicks);

    [...plan.events]
      .sort(
        (left, right) =>
          musicalPositionToTicks(left.at, ppq) - musicalPositionToTicks(right.at, ppq)
      )
      .forEach((event) =>
        this.scheduleMusicalEvent(tone, session, event, plan, baseTicks, ppq, initialGains)
      );

    if (!loop) {
      const completionId = transport.schedule(
        (time) => {
          void time;
          globalThis.setTimeout(() => this.finishSession(session.id, true), 0);
        },
        tone.Ticks(baseTicks + musicalDurationToTicks(plan.duration, ppq))
      );
      session.transportScheduleIds.push(completionId);
    }
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
      const definition = instrumentDefinition(event.instrumentId);
      if (definition.kind === 'sampled') {
        const entry = this.sampled.get(event.instrumentId);
        if (!entry) {
          throw new Error(`Sampled instrument ${event.instrumentId} was not loaded.`);
        }
        // Re-route the shared output to this session's bus. A tail still ringing from an earlier session keeps
        // sounding, now through this bus.
        entry.out.disconnect();
        entry.out.connect(bus);
        entry.bus = bus;
        const voice: Voice = {
          triggerAttackRelease: (frequency, durationSeconds, time, velocity) => {
            const midi = 69 + 12 * Math.log2(frequency / 440);
            const note = Math.round(midi);
            entry.instrument.start({
              note,
              detune: (midi - note) * 100,
              time,
              duration: durationSeconds,
              velocity: Math.round(velocity * 127),
            });
          },
          // only stop and unplug while this session still owns the output; a later session may have taken it
          releaseAll: () => {
            if (entry.bus === bus) {
              entry.instrument.stop();
            }
          },
          dispose: () => {
            if (entry.bus === bus) {
              entry.out.disconnect();
              entry.bus = undefined;
            }
          },
          tailSeconds: SAMPLED_TAIL_SECONDS,
        };
        session.instruments.set(instrumentKey, voice);
        return voice;
      }
      if (definition.kind === 'soundfont') {
        throw new Error('SoundFont notes are rendered ahead of time, not triggered on a voice.');
      }
      instrument = (
        definition.kind === 'membrane'
          ? new tone.PolySynth(tone.MembraneSynth, {
              pitchDecay: definition.pitchDecay,
              octaves: definition.octaves,
              oscillator: { type: definition.oscillator },
              envelope: definition.envelope,
            })
          : new tone.PolySynth(tone.Synth, {
              oscillator: { type: definition.oscillator },
              envelope: definition.envelope,
            })
      ).connect(bus) as PolySynth;
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
    if (session.looping && transport) {
      transport.loop = false;
    }
    // Synth voices are released and disposed at once. Sampled voices ring on: after a natural finish their
    // release tails get time to play out, and after a manual stop they fade quickly, instead of being cut.
    const ringing: Voice[] = [];
    session.instruments.forEach((instrument) => {
      if (instrument.tailSeconds === undefined) {
        instrument.releaseAll();
        instrument.dispose();
      } else {
        ringing.push(instrument);
      }
    });
    const buses = [...session.buses.values()];
    if (ringing.length === 0) {
      buses.forEach((bus) => bus.dispose());
    } else {
      if (!completed) {
        buses.forEach((bus) => bus.gain.rampTo(0, STOP_FADE_SECONDS));
      }
      const wait = completed
        ? Math.max(...ringing.map((voice) => voice.tailSeconds ?? 0))
        : STOP_FADE_SECONDS + 0.04;
      globalThis.setTimeout(() => {
        ringing.forEach((voice) => {
          voice.releaseAll();
          voice.dispose();
        });
        buses.forEach((bus) => bus.dispose());
      }, wait * 1000);
    }
    this.sessions.delete(id);
    if (completed) {
      session.onComplete?.();
    }
    this.notify();
  }
}
