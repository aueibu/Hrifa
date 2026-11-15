import { describe, expect, it, vi } from 'vitest';
import { defaultProjectPitchSet } from '../compositionSettings';
import { ChordSession, type ChordTarget } from './chordSession';

function target(id: string, extra: Partial<ChordTarget> = {}): ChordTarget {
  return { id, pitchSet: defaultProjectPitchSet(12), edo: 12, insert: () => undefined, ...extra };
}

describe('the chord session claim model', () => {
  it('has no target until something claims it', () => {
    const session = new ChordSession();
    expect(session.getState().target).toBeNull();
    expect(session.getState().pickerWanted).toBe(false);
  });

  it('the last claim wins, and releasing it reactivates the previous claim that is still held', () => {
    const session = new ChordSession();
    const a = target('a');
    const b = target('b');
    const releaseA = session.claimChordTarget(a);
    expect(session.getState().target).toBe(a);
    const releaseB = session.claimChordTarget(b);
    expect(session.getState().target).toBe(b);
    releaseB();
    expect(session.getState().target).toBe(a);
    releaseA();
    expect(session.getState().target).toBeNull();
  });

  it('releasing a claim that is not active leaves the active one alone (and it stays released)', () => {
    const session = new ChordSession();
    const a = target('a');
    const b = target('b');
    const releaseA = session.claimChordTarget(a);
    const releaseB = session.claimChordTarget(b);
    const before = session.getState();
    releaseA();
    expect(session.getState()).toBe(before);
    expect(session.getState().target).toBe(b);
    releaseB();
    // a was released while shadowed: it does not come back.
    expect(session.getState().target).toBeNull();
    releaseB();
    expect(session.getState().target).toBeNull();
  });

  it('resets the session values when the active target changes, not otherwise', () => {
    const session = new ChordSession();
    const releaseA = session.claimChordTarget(target('a'));
    session.setAnchor({ pitchMidicents: 6000, start: 0, step: 1 });
    session.setMode('common');
    session.setContinuous(true);
    expect(session.getState().anchor).not.toBeNull();
    const releaseB = session.claimChordTarget(target('b'));
    expect(session.getState().anchor).toBeNull();
    expect(session.getState().mode).toBe('root');
    expect(session.getState().continuous).toBe(false);
    session.setAnchor({ pitchMidicents: 6200, start: 1, step: 1 });
    releaseB();
    // Back on a: the session starts clean (a's old anchor is not resurrected).
    expect(session.getState().anchor).toBeNull();
    session.setAnchor({ pitchMidicents: 6400, start: 0, step: 1 });
    session.claimChordTarget(target('a')).changed();
    releaseA();
    expect(session.getState().anchor).toBeNull();
  });

  it('claim.changed() re-reads the target for the active claim only', () => {
    const session = new ChordSession();
    let wants = false;
    const a = target('a', { wantsPicker: () => wants });
    const claim = session.claimChordTarget(a);
    expect(session.getState().pickerWanted).toBe(false);
    const version = session.getState().targetVersion;
    wants = true;
    claim.changed();
    expect(session.getState().pickerWanted).toBe(true);
    expect(session.getState().targetVersion).toBe(version + 1);
    const other = session.claimChordTarget(target('b'));
    const afterB = session.getState();
    claim.changed();
    expect(session.getState()).toBe(afterB);
    other();
  });

  it('forwards the picker adapter to the active target only', () => {
    const session = new ChordSession();
    expect(session.reportPickerClosed()).toBe(false);
    const openA = vi.fn();
    const closeA = vi.fn();
    const closeB = vi.fn();
    session.claimChordTarget(target('a', { openPicker: openA, onPickerClosed: closeA }));
    const releaseB = session.claimChordTarget(target('b', { onPickerClosed: closeB }));
    session.showPicker();
    expect(openA).not.toHaveBeenCalled();
    expect(session.reportPickerClosed()).toBe(true);
    expect(closeB).toHaveBeenCalledTimes(1);
    releaseB();
    session.showPicker();
    session.hidePicker();
    expect(openA).toHaveBeenCalledTimes(1);
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers only when a value actually changes', () => {
    const session = new ChordSession();
    session.claimChordTarget(target('a'));
    const listener = vi.fn();
    session.subscribe(listener);
    session.setHoverCell(null);
    session.closePicker();
    expect(listener).not.toHaveBeenCalled();
    session.setHoverCell({ pitchMidicents: 6000, start: 0, step: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
