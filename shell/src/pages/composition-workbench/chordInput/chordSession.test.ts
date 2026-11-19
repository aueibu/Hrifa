import { describe, expect, it, vi } from 'vitest';
import { defaultProjectPitchSet } from '../compositionSettings';
import { chordsOnRoot } from './chords';
import { ChordSession, type ChordTarget } from './chordSession';
import { makePitchSet } from './pitchSet';

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

  it('reports the closed picker to the active target only', () => {
    const session = new ChordSession();
    expect(session.reportPickerClosed()).toBe(false);
    const closeA = vi.fn();
    const closeB = vi.fn();
    session.claimChordTarget(target('a', { onPickerClosed: closeA }));
    const releaseB = session.claimChordTarget(target('b', { onPickerClosed: closeB }));
    expect(session.reportPickerClosed()).toBe(true);
    expect(closeB).toHaveBeenCalledTimes(1);
    releaseB();
    expect(session.reportPickerClosed()).toBe(true);
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

describe('selection mode (M6b)', () => {
  const cMajor = chordsOnRoot(makePitchSet(12, [0, 2, 4, 5, 7, 9, 11]), 0).find(
    (c) => c.name === 'C'
  )!;
  const g4 = { start: 3, duration: 1, pitchMidicents: 6700 };
  const c4 = { start: 1, duration: 1, pitchMidicents: 6000 };
  const c5 = { start: 1, duration: 1, pitchMidicents: 7200 };
  const selecting = (notes: (typeof g4)[], extra: Partial<ChordTarget> = {}) => {
    const session = new ChordSession();
    session.claimChordTarget(
      target('a', { wantsPicker: () => false, selectedNotes: () => notes, ...extra })
    );
    return session;
  };

  it('orders the anchors by onset, then pitch, whatever order the notes are stored in', () => {
    const forward = selecting([c4, c5, g4]).selectionAnchors();
    const reversed = selecting([g4, c5, c4]).selectionAnchors();
    const key = (list: typeof forward) => list?.map((a) => [a.start, a.pitchMidicents]);
    expect(key(forward)).toEqual([
      [1, 6000],
      [1, 7200],
      [3, 6700],
    ]);
    expect(key(reversed)).toEqual(key(forward));
  });

  it('the view anchor is the earliest, then lowest, selected note', () => {
    const session = selecting([g4, c5, c4]);
    expect(session.viewAnchor()).toMatchObject({ start: 1, pitchMidicents: 6000 });
  });

  it('fail closed: with selectedNotes but no insertMany nothing is inserted, not even one by one', () => {
    const insert = vi.fn();
    const session = selecting([c4, g4], { insert });
    session.insertChord(cMajor);
    expect(insert).not.toHaveBeenCalled();
  });

  it('inserts all anchors through insertMany in one call, in anchor order', () => {
    const insertMany = vi.fn();
    const session = selecting([g4, c4], { insertMany });
    session.insertChord(cMajor);
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(
      insertMany.mock.calls[0][0].map((r: { anchor: { start: number } }) => r.anchor.start)
    ).toEqual([1, 3]);
  });
});
