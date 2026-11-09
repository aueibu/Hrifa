import type { BasicSoundBank } from 'spessasynth_core';
import { describe, expect, it, vi } from 'vitest';
import type { SoundfontPatch } from './soundfontLibrary';
import { renderSoundfont, type SoundfontNote, type SynthProcessorLike } from './soundfontSynth';

const bank = {} as BasicSoundBank;
const SR = 1000;

const melodic = (program: number, bankMSB = 0, bankLSB = 0): SoundfontPatch => ({
  bankMSB,
  bankLSB,
  program,
  isDrum: false,
});

type Call = { block: number; kind: string; args: number[] };

/** A processor that records what it is told and makes sound while a note is held plus a short tail. */
function fakeProcessor(options: { tailSamples?: number; failReady?: boolean } = {}) {
  const calls: Call[] = [];
  let block = 0;
  let held = 0;
  let tail = 0;
  const processor: SynthProcessorLike & {
    destroyed: boolean;
    stopped: boolean;
    added: unknown[];
    destroy: () => void;
  } = {
    destroyed: false,
    stopped: false,
    added: [],
    ready: options.failReady ? Promise.reject(new Error('no synth')) : Promise.resolve(),
    midiChannels: new Array(16).fill(null),
    soundBankManager: { addSoundBank: (b, id) => processor.added.push([b, id]) },
    createMIDIChannel: vi.fn(() => {
      processor.midiChannels.push(null);
    }),
    controllerChange: (channel, controller, value) =>
      calls.push({ block, kind: 'cc', args: [channel, controller, value] }),
    programChange: (channel, program) =>
      calls.push({ block, kind: 'program', args: [channel, program] }),
    pitchWheel: (channel, value) => calls.push({ block, kind: 'bend', args: [channel, value] }),
    noteOn: (channel, note, velocity) => {
      held++;
      calls.push({ block, kind: 'on', args: [channel, note, velocity] });
    },
    noteOff: (channel, note) => {
      held--;
      tail = options.tailSamples ?? 0;
      calls.push({ block, kind: 'off', args: [channel, note] });
    },
    process: (left, right, start, count) => {
      const sounding = held > 0 || tail > 0;
      for (let i = start; i < start + count; i++) {
        left[i] = sounding ? 0.1 : 0;
        right[i] = sounding ? 0.1 : 0;
      }
      if (held <= 0) {
        tail = Math.max(0, tail - count);
      }
      block++;
    },
    stopAll: () => {
      processor.stopped = true;
    },
    destroy: () => {
      processor.destroyed = true;
    },
  };
  return { processor, calls };
}

const note = (over: Partial<SoundfontNote> = {}): SoundfontNote => ({
  at: 0,
  durationSeconds: 0.5,
  midi: 60,
  velocity: 0.5,
  patch: melodic(53),
  ...over,
});

const render = (notes: SoundfontNote[], processor: SynthProcessorLike) =>
  renderSoundfont({ bank, notes, sampleRate: SR, createProcessor: () => processor });

describe('renderSoundfont', () => {
  it('loads the bank and selects the bank and program before any note', async () => {
    const { processor, calls } = fakeProcessor();
    await render([note({ patch: melodic(53, 8, 2) })], processor);

    expect(processor.added).toEqual([[bank, 'main']]);
    const setup = calls.filter((c) => c.kind === 'cc' || c.kind === 'program');
    expect(setup).toEqual([
      { block: 0, kind: 'cc', args: [0, 0, 8] },
      { block: 0, kind: 'cc', args: [0, 32, 2] },
      { block: 0, kind: 'program', args: [0, 53] },
    ]);
  });

  it('turns velocity into MIDI 1 to 127', async () => {
    const { processor, calls } = fakeProcessor();
    await render(
      [note({ velocity: 0 }), note({ at: 1, velocity: 1 }), note({ at: 2, velocity: 0.4 })],
      processor
    );

    expect(calls.filter((c) => c.kind === 'on').map((c) => c.args[2])).toEqual([1, 127, 51]);
  });

  it('starts each note in the block it falls in and stops it when it ends', async () => {
    const { processor, calls } = fakeProcessor();
    // 1000 Hz: 0.3 s is sample 300 (block 2), a 0.2 s note ends at sample 500 (block 3)
    await render([note({ at: 0.3, durationSeconds: 0.2 })], processor);

    const on = calls.find((c) => c.kind === 'on')!;
    const off = calls.find((c) => c.kind === 'off')!;
    expect(on.block).toBe(Math.floor(300 / 128));
    expect(off.block).toBe(Math.floor(500 / 128));
  });

  it('stops a note before restarting the same note on the same sample', async () => {
    const { processor, calls } = fakeProcessor();
    await render(
      [note({ at: 0, durationSeconds: 0.5 }), note({ at: 0.5, durationSeconds: 0.5 })],
      processor
    );

    const order = calls.filter((c) => c.kind === 'on' || c.kind === 'off').map((c) => c.kind);
    expect(order).toEqual(['on', 'off', 'on', 'off']);
  });

  it('gives each distinct patch its own channel and keeps channel 10 for drums', async () => {
    const { processor, calls } = fakeProcessor();
    const notes = Array.from({ length: 11 }, (_, i) => note({ at: i * 0.01, patch: melodic(i) }));
    await render(
      [...notes, note({ patch: { bankMSB: 0, bankLSB: 0, program: 0, isDrum: true } })],
      processor
    );

    const channels = calls.filter((c) => c.kind === 'program').map((c) => c.args[0]);
    expect(channels.slice(0, 11)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11]);
    expect(channels[11]).toBe(9);
  });

  it('adds channels beyond sixteen when a plan uses more patches than that', async () => {
    const { processor, calls } = fakeProcessor();
    const notes = Array.from({ length: 17 }, (_, i) => note({ at: i * 0.01, patch: melodic(i) }));
    await render(notes, processor);

    expect(processor.createMIDIChannel).toHaveBeenCalled();
    const channels = calls.filter((c) => c.kind === 'program').map((c) => c.args[0]);
    expect(new Set(channels).size).toBe(17);
    expect(channels).not.toContain(9);
  });

  it('plays a fraction of a semitone as pitch bend on a channel of its own', async () => {
    const { processor, calls } = fakeProcessor();
    await render(
      [note({ midi: 60 }), note({ midi: 60.25, at: 0.01 }), note({ midi: 59.75, at: 0.02 })],
      processor
    );

    const on = calls.filter((c) => c.kind === 'on');
    // 60.25 rounds to note 60 with +25 cents; 59.75 rounds to note 60 with -25 cents
    expect(on.map((c) => c.args[1])).toEqual([60, 60, 60]);
    expect(new Set(on.map((c) => c.args[0])).size).toBe(3);
    const bends = calls.filter((c) => c.kind === 'bend').map((c) => c.args[1]);
    expect(bends).toEqual([8192 + 1024, 8192 - 1024]);
  });

  it('keeps rendering until the release dies away, then stops', async () => {
    const { processor } = fakeProcessor({ tailSamples: 2000 });
    const out = await render([note({ at: 0, durationSeconds: 0.5 })], processor);

    // the note ends at 500; the tail runs about 2000 more samples, then 0.35 s of silence confirms the end
    expect(out.left.length).toBeGreaterThan(500 + 2000);
    expect(out.left.length).toBeLessThan(500 + 2000 + 600);
    expect(out.right.length).toBe(out.left.length);
    expect(out.sampleRate).toBe(SR);
    const lastSound = [...out.left]
      .map((v, i) => (v > 0 ? i : -1))
      .reduce((a, b) => Math.max(a, b));
    expect(lastSound).toBeGreaterThan(500 + 1800);
  });

  it('stops at once for silent output with nothing left to play', async () => {
    const { processor } = fakeProcessor({ tailSamples: 0 });
    const out = await render([], processor);

    expect(out.left.length).toBeLessThanOrEqual(500);
  });

  it('stops its voices but never destroys the synthesizer, which would destroy the shared sound bank', async () => {
    const ok = fakeProcessor();
    await render([note()], ok.processor);
    expect(ok.processor.stopped).toBe(true);
    expect(ok.processor.destroyed).toBe(false);

    const failing = fakeProcessor({ failReady: true });
    await expect(render([note()], failing.processor)).rejects.toThrow('no synth');
    expect(failing.processor.stopped).toBe(true);
    expect(failing.processor.destroyed).toBe(false);
  });
});
