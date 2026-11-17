/**
 * A1 (H-31): the Sound settings popover's reverb controls, the impulse loader, the Developer toggle for the partials link, and
 * the engine wiring through the page. The numbers are the rows of `arcs/harmonic-field-lab/SCENARIOS.A1.md`. jsdom has no real audio: these
 * tests prove the wiring against the fake context; what the reverb and the partials SOUND like is judged by ear.
 * (Written in the A1 build without being run: the human asked for no test runs while the sound is being tuned.)
 */
import { act, fireEvent, render, screen } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeBuffer, FakeCtx } from './audio/fakeContext';
import { resetImpulseStore } from './audio/impulseStore';
import { useLab } from './components/ui';
import type { Lab } from './state/context';
import {
  LAB_DEVELOPER_KEY,
  resetDeveloperOptionsCache,
  writeDeveloperOptions,
} from './state/developerOptions';
import { LabProvider } from './state/LabProvider';
import type { Action } from './state/labState';
import { KEY_SETTINGS } from './state/persist';

vi.setConfig({ testTimeout: 30_000 });

const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown;

let contexts: FakeCtx[] = [];
/** What the next created context's `decodeAudioData` returns (a test sets it before loading a file). */
let decoded: FakeBuffer | null = null;
const win = window as unknown as { AudioContext?: unknown };

beforeEach(() => {
  window.localStorage.clear();
  resetDeveloperOptionsCache();
  resetImpulseStore();
  contexts = [];
  decoded = null;
  class TestCtx extends FakeCtx {
    constructor() {
      super();
      this.decoded = decoded;
      contexts.push(this);
    }
  }
  win.AudioContext = TestCtx;
});
afterEach(() => {
  delete win.AudioContext;
  window.localStorage.clear();
  resetImpulseStore();
});

const key = (k: string, type: 'keyDown' | 'keyUp' = 'keyDown') =>
  fireEvent[type](document.body, { key: k, code: `Key${k.toUpperCase()}` });
const openSound = () => fireEvent.click(screen.getByRole('button', { name: 'Sound settings' }));
const preset = () => screen.getByRole('combobox', { name: 'Reverb' }) as HTMLSelectElement;

describe('the reverb controls in the Sound settings popover', () => {
  it('row 1: a fresh browser is Dry, mix 0, the mix slider is disabled and a note makes no wet path', () => {
    render(<HarmonicFieldLabPage />);
    openSound();
    expect(preset().value).toBe('dry');
    expect(screen.getByRole('slider', { name: 'Reverb mix' })).toHaveAttribute('data-disabled');
    key('z');
    expect(contexts[0].convolvers).toHaveLength(0);
    expect(contexts[0].gains).toHaveLength(2);
    expect(stored(KEY_SETTINGS)).toBeNull();
  });

  it('rows 2 and 14: choosing Room starts the mix at 0.3, is stored, and the next note has a convolver; Custom is not offered without an impulse', () => {
    render(<HarmonicFieldLabPage />);
    openSound();
    const custom = [...preset().options].find((o) => o.value === 'custom')!;
    expect(custom.disabled).toBe(true);
    fireEvent.change(preset(), { target: { value: 'room' } });
    expect((stored(KEY_SETTINGS) as { reverb: unknown }).reverb).toEqual({
      preset: 'room',
      mix: 0.3,
    });
    key('z');
    expect(contexts[0].convolvers).toHaveLength(1);
    expect(contexts[0].convolvers[0].normalize).toBe(true);
  });

  it('a stored Room at mix 0.5 is in effect from the first note after a reload', () => {
    window.localStorage.setItem(
      KEY_SETTINGS,
      JSON.stringify({ reverb: { preset: 'room', mix: 0.5 } })
    );
    render(<HarmonicFieldLabPage />);
    key('z');
    expect(contexts[0].convolvers).toHaveLength(1);
  });

  it('row 4: the panic Stop fades the wet gain too', () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem(
        KEY_SETTINGS,
        JSON.stringify({ reverb: { preset: 'hall', mix: 0.5 } })
      );
      render(<HarmonicFieldLabPage />);
      key('z');
      fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
      const out = contexts[0].gains[3];
      expect(out.gain.events.some((e) => e.kind === 'target' && e.v === 0 && e.tc === 0.03)).toBe(
        true
      );
      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(contexts[0].convolvers).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('row 15: without Web Audio the reverb controls are disabled with a message, the rest of the popover still works, nothing throws', () => {
    delete win.AudioContext;
    render(<HarmonicFieldLabPage />);
    openSound();
    expect(preset()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Load impulse' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove custom impulse' })).toBeDisabled();
    expect(screen.getByText('Audio is not available in this browser.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Wave' })).not.toBeDisabled();
  });
});

describe('loading an impulse', () => {
  const file = (name: string, size: number) => {
    const f = new File([new Uint8Array(4)], name, { type: 'audio/wav' });
    Object.defineProperty(f, 'size', { value: size });
    Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(4)) });
    return f;
  };
  const pick = async (f: File) => {
    const input = screen.getByLabelText('Impulse file') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [f] } });
    });
  };

  it('rows 5 and 8: a 2.4 s stereo file becomes Custom (name and length shown) and Remove goes back to Hall', async () => {
    decoded = new FakeBuffer(2, Math.round(2.4 * 48000), 48000);
    render(<HarmonicFieldLabPage />);
    openSound();
    await pick(file('room.wav', 1000));
    expect(preset().value).toBe('custom');
    expect([...preset().options].find((o) => o.value === 'custom')!.textContent).toBe(
      'Custom: room.wav (2.4 s)'
    );
    expect((stored(KEY_SETTINGS) as { reverb: { preset: string } }).reverb.preset).toBe('custom');
    key('z');
    const c = contexts.at(-1)!;
    expect((c.convolvers.at(-1)!.buffer as FakeBuffer).numberOfChannels).toBe(2);
    expect((c.convolvers.at(-1)!.buffer as FakeBuffer).length).toBe(Math.round(2.4 * 48000));
    // jsdom has no IndexedDB, so the impulse works for this visit only and the popover says so
    expect(screen.getByText(/Used for this visit only/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove custom impulse' }));
    });
    expect(preset().value).toBe('hall');
    expect((stored(KEY_SETTINGS) as { reverb: { preset: string } }).reverb.preset).toBe('hall');
  });

  it('row 6: a file over 8 MB, a file over 12 s and a file that is not audio are each refused with one line, and the reverb stays', async () => {
    render(<HarmonicFieldLabPage />);
    openSound();
    await pick(file('big.wav', 9 * 1024 * 1024));
    expect(screen.getByRole('alert')).toHaveTextContent('Larger than 8 MB');
    decoded = new FakeBuffer(1, 13 * 48000, 48000);
    // the context is made when the file is read (the first load made it without a buffer): make a new one
    contexts.at(-1)!.decoded = decoded;
    await pick(file('long.wav', 1000));
    expect(screen.getByRole('alert')).toHaveTextContent('Longer than 12 s');
    contexts.at(-1)!.decoded = null;
    await pick(file('notes.txt', 100));
    expect(screen.getByRole('alert')).toHaveTextContent('Not an audio file');
    expect(preset().value).toBe('dry');
    expect(stored(KEY_SETTINGS)).toBeNull();
  });

  it('row 9: a stored Custom preset with no readable impulse becomes Hall with a one-line note', async () => {
    window.localStorage.setItem(
      KEY_SETTINGS,
      JSON.stringify({ reverb: { preset: 'custom', mix: 0.5 } })
    );
    render(<HarmonicFieldLabPage />);
    await act(async () => {
      await Promise.resolve();
    });
    openSound();
    expect(preset().value).toBe('hall');
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    expect((stored(KEY_SETTINGS) as { reverb: { preset: string } }).reverb.preset).toBe('hall');
  });
});

describe('the sound follows the Roughness Partials and Rolloff (Developer option)', () => {
  let lab: Lab;
  function Probe() {
    lab = useLab();
    return null;
  }
  const send = (...actions: Action[]) =>
    act(() => {
      for (const a of actions) {
        lab.dispatch(a);
      }
    });
  /** The retuner's scorer options are the one lab-wide Partials and Rolloff; the reducer takes a partial patch (as the Retuner panel sends it). */
  const roughness = (harmonics: number, rolloff?: number): Action => ({
    type: 'ret/settings',
    patch: { scorerOpts: rolloff === undefined ? { harmonics } : { harmonics, rolloff } },
  });
  const renderLab = () =>
    render(
      <LabProvider>
        <Probe />
      </LabProvider>
    );

  it('the Developer menu has the switch, on by default, and turning it off is stored', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Developer options' }));
    const sw = screen.getByRole('switch', { name: /Sound follows Roughness/ });
    expect(sw).toBeChecked();
    fireEvent.click(sw);
    expect(
      (stored(LAB_DEVELOPER_KEY) as { soundFollowsRoughness: boolean }).soundFollowsRoughness
    ).toBe(false);
  });

  it('rows 10 and 11: Partials 3 gives a 3-partial wave; Partials 12 gives 12 for the next note, and the held note keeps its 3', () => {
    renderLab();
    send({ type: 'ui', patch: { wave: 'harmonic' } }, roughness(3, 0.88));
    key('z');
    const c = contexts[0];
    expect(c.waves[0].imag).toHaveLength(4);
    expect(c.waves[0].imag[3]).toBeCloseTo(0.7744, 6);
    send(roughness(12));
    key('x');
    expect(c.waves.at(-1)!.imag).toHaveLength(13);
    expect(c.oscs[0].wave).toBe(c.waves[0]);
    expect(c.oscs[1].wave).toBe(c.waves.at(-1));
  });

  it('row 12: with the link off the sound stays at 7 partials and 0.88 however the Roughness values change', () => {
    writeDeveloperOptions({ soundFollowsRoughness: false });
    renderLab();
    send({ type: 'ui', patch: { wave: 'harmonic' } }, roughness(3, 0.6));
    key('z');
    expect(contexts[0].waves[0].imag).toHaveLength(8);
    expect(contexts[0].waves[0].imag[2]).toBeCloseTo(0.88, 6);
    send(roughness(12));
    key('x');
    expect(contexts[0].waves).toHaveLength(1);
  });

  it('row 13: with the Sine wave a change of Partials changes nothing', () => {
    renderLab();
    send(roughness(3));
    key('z');
    send(roughness(12));
    key('x');
    expect(contexts[0].oscs.every((o) => o.wave === null)).toBe(true);
  });

  it('the sound clamps what Roughness allows: 16 partials at most, rolloff at least 0.5', () => {
    renderLab();
    send({ type: 'ui', patch: { wave: 'harmonic' } }, roughness(16, 0.5));
    key('z');
    expect(contexts[0].waves[0].imag).toHaveLength(17);
    expect(contexts[0].waves[0].imag[2]).toBeCloseTo(0.5, 6);
  });

  it('the Wave select names the partials the sound uses', () => {
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify({ wave: 'harmonic' }));
    render(<HarmonicFieldLabPage />);
    openSound();
    expect(
      [...(screen.getByRole('combobox', { name: 'Wave' }) as HTMLSelectElement).options].map(
        (o) => o.textContent
      )
    ).toEqual(['Sine', 'Harmonic (7 partials)']);
  });
});
