import { useState } from 'react';
import { act, fireEvent, render, renderHook, screen, userEvent } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportBar } from './components/TransportBar';
import { CompositionSettingsProvider, useCompositionSettings } from './compositionSettings';
import {
  canRedo,
  canUndo,
  closeHistoryGroup,
  COALESCE_WINDOW_MS,
  foldIntoHistory,
  HISTORY_DEPTH,
  recordChange,
  recordGroup,
  redo,
  resetHistory,
  undo,
} from './history';
import {
  acceptsFiniteNumber,
  acceptsString,
  compositionInstanceStateKey,
  compositionStateKeys,
  isRecordedStateKey,
  usePersistentState,
} from './usePersistentState';

vi.mock('./audio/AudioEngineProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audio/AudioEngineProvider')>()),
  useAudioEngine: () => ({
    playing: false,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

const KEY = 'hrifa.composition-workbench.test.value.v1';

function useNumber(key = KEY, initial = 5, options?: Parameters<typeof usePersistentState>[4]) {
  return usePersistentState<number>(key, initial, acceptsFiniteNumber, undefined, options);
}

function reset() {
  localStorage.clear();
  resetHistory();
}

describe('usePersistentState history', () => {
  beforeEach(reset);
  afterEach(() => vi.useRealTimers());

  it('undoes 5 to 6 back to 5 and redoes it to 6, in state and in storage', () => {
    const { result } = renderHook(() => useNumber());
    act(() => result.current[1](6));
    expect(result.current[0]).toBe(6);
    expect(canUndo()).toBe(true);

    act(() => undo());
    expect(result.current[0]).toBe(5);
    expect(localStorage.getItem(KEY)).toBe('5');
    expect(canRedo()).toBe(true);

    act(() => redo());
    expect(result.current[0]).toBe(6);
    expect(localStorage.getItem(KEY)).toBe('6');
  });

  it('records the resolved previous and next of an updater setter', () => {
    const { result } = renderHook(() => useNumber());
    act(() => result.current[1]((current) => current + 1));
    act(() => undo());
    expect(result.current[0]).toBe(5);
    act(() => redo());
    expect(result.current[0]).toBe(6);
  });

  it('records nothing for mount writes, same-value writes or a stored value on mount', () => {
    localStorage.setItem(KEY, '9');
    const { result } = renderHook(() => useNumber());
    expect(result.current[0]).toBe(9);
    act(() => result.current[1](9));
    act(() => result.current[1]((current) => current));
    expect(canUndo()).toBe(false);
  });

  it('coalesces a typing or drag burst into one step, and drops a net no-op', () => {
    const { result } = renderHook(() => useNumber());
    act(() => result.current[1](6));
    act(() => result.current[1](7));
    act(() => result.current[1](8));
    act(() => undo());
    expect(result.current[0]).toBe(5);
    expect(canUndo()).toBe(false);
    act(() => redo());
    expect(result.current[0]).toBe(8);

    act(() => result.current[1](9));
    act(() => result.current[1](8));
    expect(result.current[0]).toBe(8);
    // The 9 then 8 pair left no step of its own: undo reverts the earlier one.
    act(() => undo());
    expect(result.current[0]).toBe(5);
    expect(canUndo()).toBe(false);
  });

  it('starts a new step after the time window, or when a pointer-up closes the group', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
    const { result } = renderHook(() => useNumber());
    act(() => result.current[1](6));
    vi.setSystemTime(1_000 + COALESCE_WINDOW_MS + 1);
    act(() => result.current[1](7));
    act(() => undo());
    expect(result.current[0]).toBe(6);

    act(() => result.current[1](8));
    act(() => {
      window.dispatchEvent(new Event('pointerup'));
    });
    act(() => result.current[1](9));
    act(() => undo());
    expect(result.current[0]).toBe(8);
    act(() => undo());
    expect(result.current[0]).toBe(6);
  });

  it('keeps writes made together in one event as one step, even across keys', () => {
    const a = renderHook(() => useNumber(`${KEY}.a`));
    const b = renderHook(() => useNumber(`${KEY}.b`));
    act(() => {
      a.result.current[1](6);
      b.result.current[1](7);
    });
    act(() => undo());
    expect(a.result.current[0]).toBe(5);
    expect(b.result.current[0]).toBe(5);
    expect(canUndo()).toBe(false);
  });

  it('clears redo when a new change follows an undo', () => {
    const { result } = renderHook(() => useNumber());
    act(() => result.current[1](6));
    act(() => undo());
    expect(canRedo()).toBe(true);
    act(() => result.current[1](7));
    expect(canRedo()).toBe(false);
  });

  it('never merges a non-coalescing hook, and bounds the depth', () => {
    const { result } = renderHook(() => useNumber(KEY, 0, { coalesce: false }));
    for (let value = 1; value <= HISTORY_DEPTH + 5; value += 1) {
      act(() => result.current[1](value));
    }
    for (let count = 0; count < HISTORY_DEPTH + 5; count += 1) {
      act(() => undo());
    }
    expect(canUndo()).toBe(false);
    expect(result.current[0]).toBe(5);
  });

  it('creates no entries for transient keys, per-instance ones included', () => {
    const instanceKey = compositionInstanceStateKey(
      compositionStateKeys.mixerRollView,
      'mixer-2',
      'mixer'
    );
    const keys = [
      compositionStateKeys.canvasSplit,
      compositionStateKeys.workspaceView,
      compositionStateKeys.activeCompositionModule,
      compositionStateKeys.mixerVolume,
      instanceKey,
    ];
    keys.forEach((key) => expect(isRecordedStateKey(key)).toBe(false));
    const hooks = keys.map((key) => renderHook(() => useNumber(key)));
    hooks.forEach((hook, index) => act(() => hook.result.current[1](20 + index)));
    expect(canUndo()).toBe(false);
    expect(hooks[0].result.current[0]).toBe(20);
    expect(isRecordedStateKey(compositionStateKeys.pitchValues)).toBe(true);
    expect(isRecordedStateKey(compositionStateKeys.interferenceDrafts)).toBe(true);
  });

  it('can force a hook out of history', () => {
    const { result } = renderHook(() => useNumber(KEY, 5, { recorded: false }));
    act(() => result.current[1](6));
    expect(canUndo()).toBe(false);
  });

  it('does not persist history and leaves the stored shape a plain value', () => {
    const { result } = renderHook(() => useNumber());
    act(() => result.current[1](6));
    act(() => result.current[1](7));
    expect(Object.keys(localStorage)).toEqual([KEY]);
    expect(localStorage.getItem(KEY)).toBe('7');
    act(() => undo());
    expect(Object.keys(localStorage)).toEqual([KEY]);
  });

  it('writes straight to storage when no hook is mounted, then a remount reads it', () => {
    const first = renderHook(() => useNumber());
    act(() => first.result.current[1](6));
    first.unmount();
    act(() => undo());
    expect(localStorage.getItem(KEY)).toBe('5');
    const second = renderHook(() => useNumber());
    expect(second.result.current[0]).toBe(5);
  });

  it('folds an automatic follow-up into the step that caused it', () => {
    const cause = renderHook(() => useNumber(`${KEY}.cause`));
    const follow = renderHook(() => useNumber(`${KEY}.follow`));
    act(() => cause.result.current[1](6));
    act(() => {
      foldIntoHistory(() => follow.result.current[1](99));
    });
    expect(follow.result.current[0]).toBe(99);
    act(() => undo());
    expect(cause.result.current[0]).toBe(5);
    expect(follow.result.current[0]).toBe(5);
    expect(canUndo()).toBe(false);
    act(() => redo());
    expect(cause.result.current[0]).toBe(6);
    expect(follow.result.current[0]).toBe(99);
  });

  it('folds into a delete step that removed a different key, and undo restores both', () => {
    localStorage.setItem('x.removed', '"kept"');
    const follow = renderHook(() => useNumber(`${KEY}.follow`));
    act(() => {
      recordGroup(() => {
        recordChange({ key: 'x.removed', previous: '"kept"', next: null });
        localStorage.removeItem('x.removed');
      });
    });
    act(() => {
      foldIntoHistory(() => follow.result.current[1](99));
    });
    act(() => undo());
    expect(localStorage.getItem('x.removed')).toBe('"kept"');
    expect(follow.result.current[0]).toBe(5);
  });

  it('does not let a reset triggered by an undo alter the redo step', () => {
    const cause = renderHook(() => useNumber(`${KEY}.cause`));
    const follow = renderHook(() => useNumber(`${KEY}.follow`));
    act(() => cause.result.current[1](6));
    act(() => undo());
    act(() => {
      foldIntoHistory(() => follow.result.current[1](99));
    });
    act(() => redo());
    expect(cause.result.current[0]).toBe(6);
    expect(follow.result.current[0]).toBe(99);
    act(() => undo());
    expect(cause.result.current[0]).toBe(5);
    expect(follow.result.current[0]).toBe(99);
  });

  it('stops folding once the causing step is no longer recent', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
    const cause = renderHook(() => useNumber(`${KEY}.cause`));
    const follow = renderHook(() => useNumber(`${KEY}.follow`));
    act(() => cause.result.current[1](6));
    vi.setSystemTime(1_000 + COALESCE_WINDOW_MS + 1);
    act(() => {
      foldIntoHistory(() => follow.result.current[1](99));
    });
    act(() => undo());
    expect(follow.result.current[0]).toBe(99);
  });

  it('keeps the redo stack when a burst nets to no change', () => {
    const { result } = renderHook(() => useNumber());
    act(() => result.current[1](6));
    act(() => undo());
    expect(canRedo()).toBe(true);
    act(() => result.current[1](7));
    act(() => result.current[1](5));
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);
    act(() => redo());
    expect(result.current[0]).toBe(6);
  });

  it('records every setting, playback ones included, and undo restores them together', () => {
    const { result } = renderHook(() => useCompositionSettings(), {
      wrapper: CompositionSettingsProvider,
    });
    const initial = result.current.settings;
    act(() => result.current.updateTransport({ metronome: true }));
    expect(canUndo()).toBe(true);
    closeHistoryGroup();
    act(() => result.current.updateTransport({ tempo: 90 }));
    act(() => undo());
    expect(result.current.settings.transport.tempo).toBe(initial.transport.tempo);
    expect(result.current.settings.transport.metronome).toBe(true);
    act(() => undo());
    expect(result.current.settings).toEqual(initial);
    expect(
      JSON.parse(localStorage.getItem('hrifa.composition-workbench.settings.v1')!).transport
    ).toEqual(initial.transport);
    act(() => redo());
    expect(result.current.settings.transport.metronome).toBe(true);
    expect(Object.keys(localStorage).filter((key) => key.includes('#'))).toEqual([]);
  });

  it('makes an automatic write with nothing to fold into leave no entry', () => {
    const follow = renderHook(() => useNumber());
    act(() => {
      foldIntoHistory(() => follow.result.current[1](99));
    });
    expect(canUndo()).toBe(false);
  });

  it('records a group as one step and restores removed raw values before applying', () => {
    localStorage.setItem('x.removed', '"kept"');
    act(() => {
      recordGroup(() => {
        recordChange({ key: 'x.removed', previous: '"kept"', next: null });
        localStorage.removeItem('x.removed');
        recordChange({ key: 'x.other', previous: '1', next: '2' });
      });
    });
    act(() => undo());
    expect(localStorage.getItem('x.removed')).toBe('"kept"');
    expect(localStorage.getItem('x.other')).toBe('1');
    expect(canUndo()).toBe(false);
    act(() => redo());
    expect(localStorage.getItem('x.removed')).toBeNull();
    expect(localStorage.getItem('x.other')).toBe('2');
  });

  it('records global composition settings', async () => {
    const { result } = renderHook(() => useCompositionSettings(), {
      wrapper: CompositionSettingsProvider,
    });
    const tempo = result.current.settings.transport.tempo;
    act(() => result.current.updateTransport({ tempo: 90 }));
    expect(result.current.settings.transport.tempo).toBe(90);
    act(() => undo());
    expect(result.current.settings.transport.tempo).toBe(tempo);
    act(() => redo());
    expect(result.current.settings.transport.tempo).toBe(90);
  });
});

describe('Ctrl+Z in a focused field', () => {
  beforeEach(reset);

  function Field() {
    const [text, setText] = usePersistentState(KEY, 'one', acceptsString);
    return (
      <input aria-label="field" value={text} onChange={(event) => setText(event.target.value)} />
    );
  }

  it('reverts a typing burst in one step through the workbench history', async () => {
    render(
      <CompositionSettingsProvider>
        <TransportBar selectedInstanceId={null} />
        <Field />
      </CompositionSettingsProvider>
    );
    const field = screen.getByLabelText('field');
    await userEvent.click(field);
    await userEvent.type(field, 'two');
    expect(field).toHaveValue('onetwo');
    expect(localStorage.getItem(KEY)).toBe('"onetwo"');
    expect(field).toHaveFocus();

    await userEvent.keyboard('{Control>}z{/Control}');
    expect(field).toHaveValue('one');
    expect(localStorage.getItem(KEY)).toBe('"one"');
    expect(field).toHaveFocus();

    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(field).toHaveValue('onetwo');
    await userEvent.keyboard('{Control>}z{/Control}');
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(field).toHaveValue('onetwo');
  });

  it('does nothing when Alt is held', async () => {
    render(
      <CompositionSettingsProvider>
        <TransportBar selectedInstanceId={null} />
        <Field />
      </CompositionSettingsProvider>
    );
    const field = screen.getByLabelText('field');
    await userEvent.type(field, 'x');
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true, altKey: true });
    expect(field).toHaveValue('onex');
  });

  it('keeps the Undo and Redo buttons in step with the history', async () => {
    function Probe() {
      const [value, setValue] = useState(0);
      return (
        <button type="button" onClick={() => setValue(value + 1)}>
          {value}
        </button>
      );
    }
    render(
      <CompositionSettingsProvider>
        <TransportBar selectedInstanceId={null} />
        <Field />
        <Probe />
      </CompositionSettingsProvider>
    );
    const undoButton = screen.getByRole('button', { name: 'Undo' });
    expect(undoButton).toBeDisabled();
    await userEvent.type(screen.getByLabelText('field'), 'z');
    expect(undoButton).toBeEnabled();
    await userEvent.click(undoButton);
    expect(undoButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  });
});
