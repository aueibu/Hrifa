import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import {
  CompositionSettingsProvider,
  defaultCompositionSettings,
  defaultProjectPitchSet,
  projectPitchSetFromPreset,
  useCompositionSettings,
} from './compositionSettings';
import { closeHistoryGroup, historyChangeCount, redo, resetHistory, undo } from './history';
import { createProject, restoreWorkbenchState } from './projects';

const STORAGE_KEY = 'hrifa.composition-workbench.settings.v1';
const wrapper = ({ children }: { children: ReactNode }) =>
  CompositionSettingsProvider({ children });

beforeEach(() => {
  localStorage.clear();
  resetHistory();
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

  it('colors notes by scale degree: off by default, persisted, sanitized, absent from old blobs', () => {
    expect(defaultCompositionSettings.colorByScaleDegree).toBe(false);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ edo: 19 }));
    const old = renderHook(() => useCompositionSettings(), { wrapper });
    expect(old.result.current.settings.colorByScaleDegree).toBe(false);
    expect(old.result.current.settings.edo).toBe(19);
    act(() => old.result.current.updateSettings({ colorByScaleDegree: true }));
    old.unmount();
    const reloaded = renderHook(() => useCompositionSettings(), { wrapper });
    expect(reloaded.result.current.settings.colorByScaleDegree).toBe(true);
    reloaded.unmount();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ colorByScaleDegree: 'yes', edo: 19 }));
    const bad = renderHook(() => useCompositionSettings(), { wrapper });
    expect(bad.result.current.settings.colorByScaleDegree).toBe(false);
    expect(bad.result.current.settings.edo).toBe(19);
  });

  it('rejects a non-positive EDO from updateSettings rather than storing it', () => {
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    act(() => result.current.updateSettings({ edo: 0 }));
    expect(result.current.settings.edo).toBe(defaultCompositionSettings.edo);
  });

  describe('project pitch set', () => {
    const mount = () => renderHook(() => useCompositionSettings(), { wrapper });

    it('defaults to major (tonic C) at 12-EDO and chromatic at other EDOs', () => {
      expect(defaultProjectPitchSet(12)).toEqual({
        edo: 12,
        preset: 'major',
        tonic: 0,
        pcs: [0, 2, 4, 5, 7, 9, 11],
      });
      expect(defaultCompositionSettings.pitchSet).toEqual(defaultProjectPitchSet(12));
      const chromatic19 = defaultProjectPitchSet(19);
      expect(chromatic19.preset).toBe('chromatic');
      expect(chromatic19.pcs).toHaveLength(19);
    });

    it('loads an old blob without the field with the default for its EDO', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ edo: 31 }));
      expect(mount().result.current.settings.pitchSet).toEqual(defaultProjectPitchSet(31));
    });

    it('persists toggled pcs and survives reload', () => {
      const first = mount();
      const edited = {
        ...projectPitchSetFromPreset('major', 0, 12),
        pcs: [0, 2, 4, 5, 6, 7, 9, 11],
      };
      act(() => first.result.current.updateSettings({ pitchSet: edited }));
      first.unmount();
      expect(mount().result.current.settings.pitchSet).toEqual(edited);
    });

    it('resets to the new EDO default when the EDO changes', () => {
      const { result } = mount();
      act(() => result.current.updateSettings({ edo: 19 }));
      expect(result.current.settings.pitchSet).toEqual(defaultProjectPitchSet(19));
      act(() => result.current.updateSettings({ edo: 12 }));
      expect(result.current.settings.pitchSet).toEqual(defaultProjectPitchSet(12));
    });

    it.each([
      ['pcs out of range', { edo: 12, preset: 'major', tonic: 0, pcs: [0, 12] }],
      ['non-integer pc', { edo: 12, preset: 'major', tonic: 0, pcs: [0.5] }],
      ['edo mismatch', { edo: 19, preset: 'chromatic', tonic: 0, pcs: [0, 1] }],
      ['unknown preset', { edo: 12, preset: 'nope', tonic: 0, pcs: [0] }],
      ['bad tonic', { edo: 12, preset: 'major', tonic: 12, pcs: [0] }],
      ['not an object', 'major'],
    ])('falls back to the default for a malformed stored set (%s)', (_name, pitchSet) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ edo: 12, pitchSet }));
      expect(mount().result.current.settings.pitchSet).toEqual(defaultProjectPitchSet(12));
    });

    it('round-trips through project capture and restore', () => {
      const first = mount();
      expect(projectPitchSetFromPreset('major', 3, 19)).toMatchObject({
        preset: 'chromatic',
        tonic: 0,
        edo: 19,
      });
      const edited = projectPitchSetFromPreset('dorian', 2, 12);
      act(() => first.result.current.updateSettings({ pitchSet: edited }));
      first.unmount();
      const project = createProject('P', null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ edo: 12 }));
      restoreWorkbenchState(project.entries, { includeSettings: true });
      expect(mount().result.current.settings.pitchSet).toEqual(edited);
    });
  });

  it('undoes and redoes a playback setting exactly', () => {
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    act(() => result.current.updateTransport({ metronome: true }));
    closeHistoryGroup();
    act(() => result.current.updateTransport({ countIn: true }));
    closeHistoryGroup();
    act(() =>
      result.current.updateSettings({
        sounds: {
          ...result.current.settings.sounds,
          metronome: { ...result.current.settings.sounds.metronome, baseMidicents: 7200 },
        },
      })
    );
    const after = result.current.settings;
    act(() => undo());
    expect(result.current.settings.sounds).toEqual(defaultCompositionSettings.sounds);
    expect(result.current.settings.transport.countIn).toBe(true);
    act(() => undo());
    expect(result.current.settings.transport.countIn).toBe(false);
    expect(result.current.settings.transport.metronome).toBe(true);
    act(() => undo());
    expect(result.current.settings).toEqual(defaultCompositionSettings);
    act(() => {
      redo();
      redo();
      redo();
    });
    expect(result.current.settings).toEqual(after);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(after);
  });

  it('folds a volume drag into one undo step', () => {
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    act(() => {
      [20, 40, 60, 80].forEach((metronomeVolume) =>
        result.current.updateTransport({ metronomeVolume })
      );
    });
    closeHistoryGroup();
    act(() => undo());
    expect(result.current.settings.transport.metronomeVolume).toBe(
      defaultCompositionSettings.transport.metronomeVolume
    );
  });

  it('counts a playback change as a recorded change (the unsaved-changes flag follows it)', () => {
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    const before = historyChangeCount();
    act(() => result.current.updateTransport({ metronome: true }));
    expect(historyChangeCount()).toBeGreaterThan(before);
  });
});
