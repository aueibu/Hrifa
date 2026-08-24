import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  CompositionSettingsProvider,
  defaultCompositionSettings,
  useCompositionSettings,
} from './compositionSettings';

const STORAGE_KEY = 'hrifa.composition-workbench.settings.v1';
const wrapper = ({ children }: { children: ReactNode }) =>
  CompositionSettingsProvider({ children });

beforeEach(() => {
  localStorage.clear();
});

describe('composition settings', () => {
  it('defaults to 12-EDO', () => {
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    expect(result.current.settings).toEqual(defaultCompositionSettings);
  });

  it('persists an updated EDO and reloads it on next mount', () => {
    const { result, unmount } = renderHook(() => useCompositionSettings(), { wrapper });
    act(() => result.current.updateSettings({ edo: 19 }));
    expect(result.current.settings.edo).toBe(19);
    unmount();

    const { result: reloaded } = renderHook(() => useCompositionSettings(), { wrapper });
    expect(reloaded.current.settings.edo).toBe(19);
  });

  it('falls back to the default for an invalid stored EDO without discarding the rest', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ edo: -3 }));
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    expect(result.current.settings.edo).toBe(defaultCompositionSettings.edo);
  });

  it('reads a stored blob missing a field that did not exist yet as that field default', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    expect(result.current.settings).toEqual(defaultCompositionSettings);
  });

  it('rejects a non-positive EDO from updateSettings rather than storing it', () => {
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    act(() => result.current.updateSettings({ edo: 0 }));
    expect(result.current.settings.edo).toBe(defaultCompositionSettings.edo);
  });
});
