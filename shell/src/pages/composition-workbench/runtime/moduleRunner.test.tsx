import { useState } from 'react';
import { act, render, screen } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { CompositionSettingsProvider } from '../compositionSettings';
import {
  createDefaultModuleRouteState,
  type CompositionModuleId,
  type ModuleRouteState,
} from '../compositionWorkspace';
import { recordChange, recordGroup, resetHistory, undo } from '../history';
import { compositionInstanceStateKey, compositionStateKeys } from '../usePersistentState';
import {
  createEvaluationStore,
  EvaluationStoreContext,
  useModuleEvaluationResult,
} from './evaluationStore';
import { ModuleEvaluationRunner } from './ModuleEvaluationRunner';
import { modulePorts } from './modulePorts';
import { useModuleState } from './moduleState';
import { rhythmListState } from './moduleState/rhythmList';
import { createOutputStore } from './outputStore';
import { deleteState, resetStateStore, setState } from './stateStore';

const textKey = (id: string) =>
  compositionInstanceStateKey(compositionStateKeys.rhythmListText, id);
const pitchKey = (id: string) => compositionInstanceStateKey(compositionStateKeys.pitchValues, id);

const note = (stored: string) => JSON.stringify(stored);

type RunnerSetup = ReturnType<typeof setup>;

function setup() {
  return { outputStore: createOutputStore(), evaluationStore: createEvaluationStore() };
}

/** The runners only (no module views): what the page renders for every placed instance. */
function Runners({
  stores,
  instances,
}: {
  stores: RunnerSetup;
  instances: {
    id: string;
    moduleId: Exclude<CompositionModuleId, 'mixer'>;
    routeState?: ModuleRouteState;
  }[];
}) {
  return (
    <CompositionSettingsProvider>
      {instances.map((instance) => (
        <ModuleEvaluationRunner
          key={instance.id}
          outputStore={stores.outputStore}
          evaluationStore={stores.evaluationStore}
          instanceId={instance.id}
          moduleId={instance.moduleId}
          instanceLabel={instance.id}
          routeState={instance.routeState}
        />
      ))}
    </CompositionSettingsProvider>
  );
}

function melodicizationRoute(): ModuleRouteState {
  const route = createDefaultModuleRouteState(modulePorts.melodicization!);
  return {
    rhythm: { ...route.rhythm, source: { instanceId: 'rhythm-1', port: 'rhythm' } },
    pitches: { ...route.pitches, source: { instanceId: 'pitch-1', port: 'pitches' } },
  };
}

const noteValues = (stores: RunnerSetup) =>
  stores.outputStore
    .get({ instanceId: 'mel-1', port: 'notes' })
    ?.packet.items.map((item) => (item.value as { pitches: number[] }).pitches[0]);

describe('module runners (no views mounted)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStateStore();
    resetHistory();
  });

  it('a source module with no view still publishes to a downstream module, and an edit follows', () => {
    localStorage.setItem(pitchKey('pitch-1'), note('60 64 67'));
    localStorage.setItem(textKey('rhythm-1'), note('1 1 2'));
    const stores = setup();
    render(
      <Runners
        stores={stores}
        instances={[
          { id: 'pitch-1', moduleId: 'pitch-list' },
          { id: 'rhythm-1', moduleId: 'rhythm-list' },
          { id: 'mel-1', moduleId: 'melodicization', routeState: melodicizationRoute() },
        ]}
      />
    );
    // Three attacks, three pitches: 6000, 6400, 6700 midicents.
    expect(noteValues(stores)).toEqual([6000, 6400, 6700]);

    // A pitch edit written to the store (as a view or an undo would) reaches Melodicization.
    act(() => setState<string>(pitchKey('pitch-1'), '72'));
    expect(noteValues(stores)).toEqual([7200, 7200, 7200]);
  });

  it('an edit made through a view is undone while the view is gone, and the remount shows it', () => {
    localStorage.setItem(textKey('rhythm-1'), note('1 1 2'));
    const stores = setup();
    let setView: (shown: boolean) => void = () => undefined;
    function View() {
      const [state, set] = useModuleState(rhythmListState, 'rhythm-1');
      const { parsed } = useModuleEvaluationResult('rhythm-list', 'rhythm-1');
      return (
        <button type="button" onClick={() => set.text('3 3')}>
          {state.text}|{parsed.steps.length}
        </button>
      );
    }
    function Page() {
      const [shown, setShown] = useState(true);
      setView = setShown;
      return (
        <EvaluationStoreContext.Provider value={stores.evaluationStore}>
          <Runners stores={stores} instances={[{ id: 'rhythm-1', moduleId: 'rhythm-list' }]} />
          {shown && <View />}
        </EvaluationStoreContext.Provider>
      );
    }
    render(<Page />);
    expect(screen.getByRole('button')).toHaveTextContent('1 1 2|3');
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button')).toHaveTextContent('3 3|2');
    const published = () =>
      stores.outputStore.get({ instanceId: 'rhythm-1', port: 'rhythm' })?.packet.items.length;
    expect(published()).toBe(2);

    act(() => setView(false));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => undo());
    // The runner evaluated the undone value with no view mounted.
    expect(published()).toBe(3);
    act(() => setView(true));
    expect(screen.getByRole('button')).toHaveTextContent('1 1 2|3');
  });

  it('delete then undo restores the state; a late write after the delete does not resurrect storage', () => {
    localStorage.setItem(textKey('rhythm-1'), note('1 1 2'));
    const stores = setup();
    let lateSet: ((text: string) => void) | undefined;
    function Late() {
      const [, set] = useModuleState(rhythmListState, 'rhythm-1');
      lateSet = (text) => set.text(text);
      return null;
    }
    function Page({ placed }: { placed: boolean }) {
      return (
        <EvaluationStoreContext.Provider value={stores.evaluationStore}>
          <Runners
            stores={stores}
            instances={placed ? [{ id: 'rhythm-1', moduleId: 'rhythm-list' }] : []}
          />
          {placed && <Late />}
        </EvaluationStoreContext.Provider>
      );
    }
    const { rerender } = render(<Page placed />);
    act(() => lateSet?.('5 5 5 5'));
    expect(localStorage.getItem(textKey('rhythm-1'))).toBe(note('5 5 5 5'));

    // What the page's delete does: remove and record the stored values, then drop the store keys.
    const keys = [
      compositionStateKeys.rhythmListText,
      compositionStateKeys.rhythmListLoop,
      compositionStateKeys.rhythmListSound,
      compositionStateKeys.rhythmListVolume,
    ].map((base) => compositionInstanceStateKey(base, 'rhythm-1'));
    recordGroup(() => {
      keys.forEach((key) => {
        const previous = localStorage.getItem(key);
        localStorage.removeItem(key);
        if (previous !== null) {
          recordChange({ key, previous, next: null }, { coalesce: false });
        }
      });
    });
    keys.forEach(deleteState);
    // A write from a hook that has not unmounted yet is ignored.
    act(() => lateSet?.('late'));
    expect(localStorage.getItem(textKey('rhythm-1'))).toBeNull();
    // A render under way that re-creates the key (the view reads it again) stays in memory only.
    act(() => rerender(<Page placed />));
    act(() => lateSet?.('late again'));
    expect(localStorage.getItem(textKey('rhythm-1'))).toBeNull();
    act(() => rerender(<Page placed={false} />));
    act(() => lateSet?.('later'));
    expect(localStorage.getItem(textKey('rhythm-1'))).toBeNull();

    // Undo restores storage; the instance placed again reads it back and publishes it.
    act(() => undo());
    expect(localStorage.getItem(textKey('rhythm-1'))).toBe(note('5 5 5 5'));
    act(() => rerender(<Page placed />));
    expect(
      stores.outputStore.get({ instanceId: 'rhythm-1', port: 'rhythm' })?.packet.items
    ).toHaveLength(4);
    expect(localStorage.getItem(textKey('rhythm-1'))).toBe(note('5 5 5 5'));
  });
});
