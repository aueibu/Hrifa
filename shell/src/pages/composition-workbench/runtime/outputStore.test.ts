import type { PublishedCompositionOutput } from '../compositionRouting';
import { createOutputStore } from './outputStore';

function output(
  instanceId: string,
  port: string,
  packet: unknown = {},
  label = port
): PublishedCompositionOutput {
  return {
    ref: { instanceId, port },
    label,
    packet,
  } as unknown as PublishedCompositionOutput;
}

describe('createOutputStore', () => {
  it('starts empty with a stable list', () => {
    const store = createOutputStore();
    expect(store.list()).toEqual([]);
    expect(store.list()).toBe(store.list());
  });

  it('publishes, reads by ref and replaces one instance without touching others', () => {
    const store = createOutputStore();
    const a = output('a', 'rhythm');
    const b = output('b', 'rhythm');
    store.publish('a', [a]);
    store.publish('b', [b]);
    expect(store.get({ instanceId: 'a', port: 'rhythm' })).toBe(a);
    expect(store.list()).toHaveLength(2);
    const a2 = output('a', 'rhythm');
    store.publish('a', [a2]);
    expect(store.get({ instanceId: 'a', port: 'rhythm' })).toBe(a2);
    expect(store.get({ instanceId: 'b', port: 'rhythm' })).toBe(b);
  });

  it('finds a bank entry by its indexed key only', () => {
    const store = createOutputStore();
    store.publish('a', [output('a', 'bank')]);
    expect(store.get({ instanceId: 'a', port: 'bank', index: 0 })).toBeUndefined();
    expect(store.get({ instanceId: 'a', port: 'bank' })).toBeDefined();
  });

  it('does not notify or change the list when the same packet and label are republished', () => {
    const store = createOutputStore();
    const packet = {};
    store.publish('a', [output('a', 'x', packet, 'X')]);
    const before = store.list();
    const listener = vi.fn();
    store.subscribe(listener);
    store.publish('a', [output('a', 'x', packet, 'X')]);
    expect(listener).not.toHaveBeenCalled();
    expect(store.list()).toBe(before);
  });

  it('notifies and changes the list identity when a packet, label or port set changes', () => {
    const store = createOutputStore();
    const packet = {};
    store.publish('a', [output('a', 'x', packet, 'X')]);
    const listener = vi.fn();
    store.subscribe(listener);
    let previous = store.list();
    store.publish('a', [output('a', 'x', {}, 'X')]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.list()).not.toBe(previous);
    previous = store.list();
    store.publish('a', [output('a', 'x', previous[0].packet, 'Renamed')]);
    expect(listener).toHaveBeenCalledTimes(2);
    store.publish('a', [output('a', 'x', previous[0].packet, 'Renamed'), output('a', 'y')]);
    expect(listener).toHaveBeenCalledTimes(3);
    store.publish('a', []);
    expect(listener).toHaveBeenCalledTimes(4);
    expect(store.list()).toEqual([]);
  });

  it('prunes instances that are gone, and only notifies when something was dropped', () => {
    const store = createOutputStore();
    store.publish('a', [output('a', 'x')]);
    store.publish('b', [output('b', 'x')]);
    const listener = vi.fn();
    store.subscribe(listener);
    store.prune(['a', 'b', 'c']);
    expect(listener).not.toHaveBeenCalled();
    store.prune(['a']);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.list().map((item) => item.ref.instanceId)).toEqual(['a']);
    expect(Object.keys(store.record())).toEqual(['a|x']);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createOutputStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.publish('a', [output('a', 'x')]);
    expect(listener).not.toHaveBeenCalled();
  });
});
