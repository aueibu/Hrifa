import { act, renderHook } from '@testing-library/react';
import type { AudioEngine, PerformancePlan, PlaybackRequest } from './audio/types';
import { stripSegments } from './components/DurationStrip';
import { useModulePreview } from './useModulePreview';

// A stand-in engine: records requests and lets the test end sessions either way.
const listeners = new Set<() => void>();
const sessions: { request: PlaybackRequest; active: boolean; gains: Record<string, number> }[] = [];
const notify = () => listeners.forEach((listener) => listener());
const fakeEngine = {
  play: async (request: PlaybackRequest) => {
    const state = { request, active: true, gains: { ...request.busGains } };
    sessions.push(state);
    return {
      id: String(sessions.length),
      sourceId: request.plan.sourceId,
      get active() {
        return state.active;
      },
      setBusGain: (busId: string, gain: number) => {
        state.gains[busId] = gain;
      },
      stop: () => {
        state.active = false;
      },
    };
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
} as unknown as AudioEngine;

vi.mock('./audio/AudioEngineProvider', () => ({ useAudioEngine: () => fakeEngine }));

const plan = { id: 'p', sourceId: 'm1', events: [] } as unknown as PerformancePlan;

function setup(volume = 30, onEnd = vi.fn()) {
  const hook = renderHook(
    (props: { volume: number; grouping: number }) =>
      useModulePreview({
        instanceId: 'm1',
        volume: props.volume,
        followTransport: true,
        busGains: { grouping: props.grouping },
        transportPlay: () => {},
        onEnd,
      }),
    { initialProps: { volume, grouping: 0 } }
  );
  return { ...hook, onEnd };
}

describe('useModulePreview', () => {
  beforeEach(() => {
    sessions.length = 0;
    listeners.clear();
  });

  it('plays with the module volume, extra buses and the transport flag', async () => {
    const { result } = setup();
    await act(() => result.current.play(plan, 'Playing.'));
    expect(sessions[0].request.followTransport).toBe(true);
    expect(sessions[0].request.busGains).toMatchObject({ grouping: 0 });
    expect(sessions[0].request.busGains!.preview).toBeGreaterThan(0);
    expect(result.current).toMatchObject({ playing: true, status: 'Playing.' });
  });

  it('applies volume and bus changes to the sounding session', async () => {
    const { result, rerender } = setup();
    await act(() => result.current.play(plan, 'Playing.'));
    const before = sessions[0].gains.preview;
    rerender({ volume: 80, grouping: 0.5 });
    expect(sessions[0].gains.preview).toBeGreaterThan(before);
    expect(sessions[0].gains.grouping).toBe(0.5);
  });

  it('reports completion through onComplete', async () => {
    const { result, onEnd } = setup();
    await act(() => result.current.play(plan, 'Playing.'));
    act(() => sessions[0].request.onComplete?.());
    expect(result.current).toMatchObject({ playing: false, status: 'Preview complete.' });
    expect(onEnd).toHaveBeenLastCalledWith('complete');
  });

  it('notices a global Stop, which skips onComplete', async () => {
    const { result, onEnd } = setup();
    await act(() => result.current.play(plan, 'Playing.'));
    sessions[0].active = false;
    act(notify);
    expect(result.current).toMatchObject({ playing: false, status: 'Preview stopped.' });
    expect(onEnd).toHaveBeenLastCalledWith('stopped');
  });

  it('stops the previous session when a new one starts, and on unmount', async () => {
    const { result, unmount } = setup();
    await act(() => result.current.play(plan, 'One.'));
    await act(() => result.current.play(plan, 'Two.'));
    expect(sessions.map((session) => session.active)).toEqual([false, true]);
    // The replaced session's late onComplete must not clobber the new one.
    act(() => sessions[0].request.onComplete?.());
    expect(result.current).toMatchObject({ playing: true, status: 'Two.' });
    unmount();
    expect(sessions[1].active).toBe(false);
  });
});

describe('stripSegments', () => {
  it('draws a late start as a leading rest in a linear frame', () => {
    expect(stripSegments([3, 2], 1, false).map((segment) => segment.text)).toEqual([
      'rest 1',
      '3',
      '2',
    ]);
  });

  it('wraps the last note to the front in a loop', () => {
    expect(stripSegments([3, 2], 1, true).map((segment) => segment.text)).toEqual([
      '↺ 1',
      '3',
      '1',
    ]);
  });

  it('indexes attack blocks for their tooltips', () => {
    expect(stripSegments([2, 1], 0, true).map((segment) => segment.index)).toEqual([0, 1]);
  });
});
