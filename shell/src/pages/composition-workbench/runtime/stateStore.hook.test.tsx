import { act, render, screen } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetHistory, undo } from '../history';
import { setReloading } from '../reloading';
import { acceptsString, usePersistentState } from '../usePersistentState';
import { getState, hasState, resetStateStore } from './stateStore';

const KEY = 'hrifa.composition-workbench.test.hook-state';

function View({ id }: { id: string }) {
  const [text, setText] = usePersistentState(KEY, 'start', acceptsString);
  return (
    <button type="button" onClick={() => setText('edited')}>
      {id}:{text}
    </button>
  );
}

describe('usePersistentState over the store', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStateStore();
    resetHistory();
  });

  it('an edit is undone while the view is unmounted and the remount shows it', () => {
    const first = render(<View id="a" />);
    act(() => screen.getByRole('button').click());
    expect(screen.getByRole('button')).toHaveTextContent('a:edited');
    first.unmount();
    expect(hasState(KEY)).toBe(true);

    undo();
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify('start'));
    // An idle key does not re-read storage while reloading: only the store's applier gives this.
    setReloading(true);
    expect(getState(KEY, { fallback: 'start', accepts: acceptsString })).toBe('start');
    setReloading(false);
    render(<View id="b" />);
    expect(screen.getByRole('button')).toHaveTextContent('b:start');
  });

  it('two hooks on one key share a value', () => {
    render(
      <>
        <View id="a" />
        <View id="b" />
      </>
    );
    act(() => screen.getAllByRole('button')[0].click());
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'a:edited',
      'b:edited',
    ]);
  });

  it('reads the new key when key changes and keeps set stable for one key', () => {
    localStorage.setItem('k.a', JSON.stringify('A'));
    localStorage.setItem('k.b', JSON.stringify('B'));
    const sets: unknown[] = [];
    function Keyed({ k }: { k: string }) {
      const [text, setText] = usePersistentState(k, 'none', acceptsString);
      sets.push(setText);
      return <span>{text}</span>;
    }
    const { rerender } = render(<Keyed k="k.a" />);
    expect(screen.getByText('A')).toBeInTheDocument();
    rerender(<Keyed k="k.a" />);
    expect(sets[0]).toBe(sets[1]);
    rerender(<Keyed k="k.b" />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
