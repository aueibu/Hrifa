import { act } from 'react';
import { render } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StageApi } from '../../../components/Stage/dock';
import { makeDocker, makeWorkspace, type Workspace } from '../../../lib/stage';
import { CompositionSettingsProvider, defaultProjectPitchSet } from '../compositionSettings';
import { ChordPanelBridge } from './ChordPanelBridge';
import { ChordSession, type ChordTarget } from './chordSession';
import { ChordSessionProvider } from './ChordSessionProvider';

// The audition mounts while a claim wants the picker: a stand-in engine keeps it silent.
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    play: async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined }),
    subscribe: () => () => undefined,
  }),
}));

const withChords = (id = 's1'): Workspace =>
  makeWorkspace({ id, name: id, tree: makeDocker('d1', 'D', ['chords', 'other'], 'chords') });
const withoutChords = (id = 's1'): Workspace =>
  makeWorkspace({ id, name: id, tree: makeDocker('d1', 'D', ['other'], 'other') });

function api(isOpen = false): StageApi {
  return {
    show: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    isOpen: vi.fn(() => isOpen),
    isShown: vi.fn(() => isOpen),
  } as unknown as StageApi;
}

function target(extra: Partial<ChordTarget> = {}): ChordTarget {
  return {
    id: 't',
    pitchSet: defaultProjectPitchSet(12),
    edo: 12,
    insert: () => undefined,
    ...extra,
  };
}

function mount(session: ChordSession, stage: StageApi, workspace: Workspace) {
  const tree = (s: Workspace) => (
    <CompositionSettingsProvider>
      <ChordSessionProvider session={session}>
        <ChordPanelBridge workspace={s} api={stage} />
      </ChordSessionProvider>
    </CompositionSettingsProvider>
  );
  const view = render(tree(workspace));
  return { rerender: (s: Workspace) => view.rerender(tree(s)) };
}

describe('ChordPanelBridge', () => {
  beforeEach(() => localStorage.clear());

  it('shows the panel when the claim starts wanting the picker, and never closes it when it stops (1b)', () => {
    const session = new ChordSession();
    let wants = false;
    const stage = api();
    mount(session, stage, withoutChords());
    let claim = () => {};
    let changed = () => {};
    act(() => {
      const release = session.claimChordTarget(target({ wantsPicker: () => wants }));
      claim = release;
      changed = release.changed;
    });
    expect(stage.show).not.toHaveBeenCalled();
    wants = true;
    act(() => changed());
    expect(stage.show).toHaveBeenCalledTimes(1);
    expect(stage.show).toHaveBeenCalledWith('chords');
    wants = false;
    act(() => changed());
    expect(stage.close).not.toHaveBeenCalled();
    act(() => claim());
    expect(stage.close).not.toHaveBeenCalled();
  });

  it('shows the panel again in the workspace it is flipped to while the claim still wants it', () => {
    const session = new ChordSession();
    const stage = api();
    const view = mount(session, stage, withChords('a'));
    act(() => {
      session.claimChordTarget(target());
    });
    expect(stage.show).toHaveBeenCalledTimes(1);
    view.rerender(withoutChords('b'));
    // A flip only opens it where it is not yet (without bringing it forward); it never calls show again.
    expect(stage.show).toHaveBeenCalledTimes(1);
    expect(stage.open).toHaveBeenCalledWith('chords');
  });

  it('a workspace flip leaves a panel that is already open alone (A6)', () => {
    const session = new ChordSession();
    const stage = api(true);
    const view = mount(session, stage, withChords('a'));
    act(() => {
      session.claimChordTarget(target());
    });
    view.rerender(withChords('b'));
    expect(stage.show).toHaveBeenCalledTimes(1);
    expect(stage.open).not.toHaveBeenCalled();
  });

  it('reports the person closing the tab to the ACTIVE claim host (not the editor that was first), while the tool wants it', () => {
    const session = new ChordSession();
    const first = vi.fn();
    const second = vi.fn();
    const view = mount(session, api(), withChords());
    act(() => {
      session.claimChordTarget(target({ id: 'editor', onPickerClosed: first }));
      session.claimChordTarget(target({ id: 'list', onPickerClosed: second }));
    });
    view.rerender(withoutChords());
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('does not report a close while the claim does not want the picker, nor a change of workspace', () => {
    const session = new ChordSession();
    const closed = vi.fn();
    let wants = false;
    const view = mount(session, api(), withChords('a'));
    let changed = () => {};
    act(() => {
      changed = session.claimChordTarget(
        target({ wantsPicker: () => wants, onPickerClosed: closed })
      ).changed;
    });
    // Another tool is active: closing the tab just closes it.
    view.rerender(withoutChords('a'));
    expect(closed).not.toHaveBeenCalled();
    // The tool is on and the panel is open: a flip to a workspace without it is not a close (it is shown there).
    view.rerender(withChords('a'));
    wants = true;
    act(() => changed());
    view.rerender(withoutChords('b'));
    expect(closed).not.toHaveBeenCalled();
  });
});
