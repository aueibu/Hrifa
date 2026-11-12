import { afterEach, describe, expect, it, vi } from 'vitest';
import { runClipAction, type ClipActionDesk } from './clipActionRunner';
import { freezeClipProperties } from './clipProperties';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition, rationalFromNumber } from './musicalTime';
import { clearNoteClipboard, readNoteClipboard } from './noteClipboard';
import { publishNoteEditor, withdrawNoteEditor } from './noteEditorChannel';
import type { Snippet } from './snippet';

const note = (id: string, start: number, midicents: number): DataItem<NoteEventValue> => ({
  id,
  value: {
    onset: { quarterNotes: rationalFromNumber(start) },
    interOnset: musicalDuration(1),
    duration: musicalDuration(1),
    pitches: [midicents],
    velocity: 1,
  },
  label: id,
  provenance: [],
});

const clip = (items: DataItem<NoteEventValue>[]): DataPacket =>
  freezeClipProperties({
    ...packet('events', 'note', items),
    frame: {
      topology: 'linear',
      unit: 'quarterNote',
      extent: 8,
      origin: 0,
      musicalExtent: musicalDuration(8),
      musicalOrigin: musicalPosition(0),
    },
  });

function fakeDesk(
  initial: DataPacket,
  options: { commitThrows?: boolean; commitFails?: boolean } = {}
) {
  let current = initial;
  const commits: string[] = [];
  const desk: ClipActionDesk = {
    latestSnippetById: () => ({ packet: current }) as Snippet,
    commitSnippetEditById: (_id, next, operation) => {
      if (options.commitThrows) {
        throw new Error('boom');
      }
      if (options.commitFails) {
        return { ok: false, error: 'The desk refused that edit.' };
      }
      commits.push(operation);
      current = next;
      return { ok: true, snippet: { packet: next } as Snippet };
    },
  };
  return { desk, commits, packet: () => current };
}

afterEach(() => {
  withdrawNoteEditor('c');
  clearNoteClipboard();
  vi.restoreAllMocks();
});

const publish = (
  adopt: () => void,
  selection: { ids: string[]; range: { start: number; end: number } | null } = {
    ids: [],
    range: null,
  }
) =>
  publishNoteEditor('c', {
    selection,
    gridUnit: undefined,
    snapUnit: 1,
    picking: null,
    beginPick: () => undefined,
    cancelPick: () => undefined,
    adopt,
  });

describe('runClipAction', () => {
  it('commits the action as its own transform version and adopts the selection', () => {
    const adopt = vi.fn();
    publish(adopt);
    const { desk, commits } = fakeDesk(clip([note('a', 0, 6000)]));
    const outcome = runClipAction({
      snippetId: 'c',
      fallback: clip([]),
      actionId: 'transpose',
      params: { semitones: 12 },
      desk,
    });
    expect(outcome).toEqual({ status: 'committed', message: undefined });
    expect(commits).toEqual(['transform-transpose']);
    expect(adopt).toHaveBeenCalledTimes(1);
  });

  it('an exception inside the action is logged and reported, and nothing is committed', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = clip([note('a', 0, 6000), note('b', 2, 6400)]);
    broken.items[1] = {
      ...broken.items[1],
      value: {
        ...(broken.items[1].value as NoteEventValue),
        onset: { quarterNotes: undefined } as never,
      },
    };
    const { desk, commits } = fakeDesk(broken);
    const outcome = runClipAction({ snippetId: 'c', fallback: broken, actionId: 'legato', desk });
    expect(outcome).toEqual({
      status: 'failed',
      message: 'That action hit an internal error, so nothing was changed.',
    });
    expect(commits).toEqual([]);
    expect(log).toHaveBeenCalled();
  });

  it('once the commit has landed, an adopt that throws never claims nothing was changed', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    publish(() => {
      throw new Error('adopt broke');
    });
    const { desk, commits, packet: current } = fakeDesk(clip([note('a', 0, 6000)]));
    const outcome = runClipAction({
      snippetId: 'c',
      fallback: clip([]),
      actionId: 'transpose',
      params: { semitones: 12 },
      desk,
    });
    expect(commits).toEqual(['transform-transpose']);
    expect(outcome.status).toBe('committed');
    expect(outcome.message).toMatch(/applied/);
    expect(outcome.message).not.toMatch(/nothing was changed/i);
    expect((current().items[0].value as NoteEventValue).pitches).toEqual([7200]);
    expect(log).toHaveBeenCalled();
  });

  it('a commit that throws or is refused reports failure, never success', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const thrown = runClipAction({
      snippetId: 'c',
      fallback: clip([]),
      actionId: 'transpose',
      params: { semitones: 1 },
      desk: fakeDesk(clip([note('a', 0, 6000)]), { commitThrows: true }).desk,
    });
    expect(thrown.status).toBe('failed');
    const refused = runClipAction({
      snippetId: 'c',
      fallback: clip([]),
      actionId: 'transpose',
      params: { semitones: 1 },
      desk: fakeDesk(clip([note('a', 0, 6000)]), { commitFails: true }).desk,
    });
    expect(refused).toEqual({ status: 'failed', message: 'The desk refused that edit.' });
  });

  it('refusals and no-ops write nothing; copy fills the clipboard without a version', () => {
    const { desk, commits } = fakeDesk(clip([note('a', 0, 6000)]));
    expect(
      runClipAction({
        snippetId: 'c',
        fallback: clip([]),
        actionId: 'transpose',
        params: { semitones: -99 },
        desk,
      }).status
    ).toBe('refused');
    expect(runClipAction({ snippetId: 'c', fallback: clip([]), actionId: 'legato', desk })).toEqual(
      { status: 'unchanged', message: 'Nothing to change.' }
    );
    publish(() => undefined, { ids: ['a'], range: null });
    expect(runClipAction({ snippetId: 'c', fallback: clip([]), actionId: 'copy', desk })).toEqual({
      status: 'unchanged',
      message: 'Copied 1 note.',
    });
    expect(readNoteClipboard()?.notes).toHaveLength(1);
    expect(commits).toEqual([]);
    expect(
      runClipAction({ snippetId: 'c', fallback: clip([]), actionId: 'nope', desk }).status
    ).toBe('refused');
  });

  it('survives an editor state published without the newer pick fields (a hot-reloaded editor)', () => {
    publishNoteEditor('c', {
      selection: { ids: [], range: null },
      gridUnit: undefined,
      snapUnit: 1,
      adopt: () => undefined,
    } as never);
    const { desk, commits } = fakeDesk(clip([note('a', 0, 6000)]));
    const outcome = runClipAction({
      snippetId: 'c',
      fallback: clip([]),
      actionId: 'transpose',
      params: { semitones: 1 },
      desk,
    });
    expect(outcome.status).toBe('committed');
    expect(commits).toEqual(['transform-transpose']);
  });
});

describe('a resolved overlap ends the rotation session', () => {
  const long = (id: string, start: number, midicents: number): DataItem<NoteEventValue> => {
    const base = note(id, start, midicents);
    const value = base.value as NoteEventValue;
    return {
      ...base,
      value: { ...value, duration: musicalDuration(2), interOnset: musicalDuration(2) },
    };
  };
  const rotate = (items: DataItem<NoteEventValue>[]) => {
    const adopt = vi.fn();
    publish(adopt);
    const { desk, packet: current } = fakeDesk(clip(items));
    const outcome = runClipAction({
      snippetId: 'c',
      fallback: clip([]),
      actionId: 'rotate-time',
      params: { amount: '-1' },
      desk,
    });
    return { adopt, outcome, current };
  };

  it('keeps the session when nothing overlapped', () => {
    const { adopt, outcome } = rotate([long('x', 0, 6000), long('y', 1, 6400)]);
    expect(outcome.status).toBe('committed');
    expect(adopt.mock.calls[0][0].rotation).toBeTruthy();
    expect(adopt.mock.calls[0][2]).toBeUndefined();
  });

  it('leaves an old overlapping pair alone when the rotation lands its notes on each other', () => {
    // x wraps to (7, 1) and (0, 1); y (1, 2) lands on (0, 2), over x's first piece. x and y already
    // overlapped in the clip as it was, so nothing is resolved and the session stays.
    const { adopt, outcome, current } = rotate([long('x', 0, 6000), long('y', 1, 6000)]);
    expect(outcome.status).toBe('committed');
    expect(current().items).toHaveLength(3);
    expect(adopt.mock.calls[0][0].rotation).toBeTruthy();
    expect(adopt.mock.calls[0][2]).toBeUndefined();
  });

  /** Runs `presses` rotate-time presses of `amount`, carrying the session the way the editor does. */
  const rotateSession = (
    items: DataItem<NoteEventValue>[],
    amount: string,
    presses: number,
    selection: { ids: string[]; range: { start: number; end: number } | null } = {
      ids: [],
      range: null,
    }
  ) => {
    const { desk, packet: current } = fakeDesk(clip(items));
    let rotation: unknown = null;
    let kept = selection;
    const adopts: unknown[][] = [];
    const publishState = () =>
      publishNoteEditor('c', {
        selection: kept,
        gridUnit: undefined,
        snapUnit: 1,
        picking: null,
        beginPick: () => undefined,
        cancelPick: () => undefined,
        rotation: rotation as never,
        adopt: (result, _committed, survivorOf) => {
          adopts.push([result, survivorOf]);
          rotation = result.rotation ?? null;
          if (result.selection) {
            kept = { ids: [...result.selection.ids], range: result.selection.range };
          }
        },
      });
    const outcomes = [];
    for (let press = 0; press < presses; press += 1) {
      publishState();
      outcomes.push(
        runClipAction({
          snippetId: 'c',
          fallback: clip([]),
          actionId: 'rotate-time',
          params: { amount },
          desk,
        })
      );
    }
    return { outcomes, adopts, current, rotation: () => rotation };
  };
  const spans = (p: DataPacket) =>
    p.items
      .map((item) => {
        const value = item.value as NoteEventValue;
        const start =
          Number(value.onset.quarterNotes.numerator) / Number(value.onset.quarterNotes.denominator);
        const length =
          Number(value.duration.quarterNotes.numerator) /
          Number(value.duration.quarterNotes.denominator);
        return `${item.id}:${start}-${start + length}`;
      })
      .sort();

  it('rotate in time by +7 leaves an old overlapping same-pitch pair uncut and keeps the session', () => {
    const { outcomes, adopts, current, rotation } = rotateSession(
      [long('x', 0, 6000), long('y', 1, 6000)],
      '7',
      1
    );
    expect(outcomes[0].status).toBe('committed');
    // Nothing was cut: the total sounding length is the original 4 quarters.
    const total = current().items.reduce((sum, item) => {
      const d = (item.value as NoteEventValue).duration.quarterNotes;
      return sum + Number(d.numerator) / Number(d.denominator);
    }, 0);
    expect(total).toBe(4);
    expect(rotation()).toBeTruthy();
    expect(adopts[0][1]).toBeUndefined();
    expect(spans(current()).some((entry) => entry.startsWith('y~'))).toBe(false);
  });

  it('seven +1 rotations in one session never cut the old pair and never end the session', () => {
    const { outcomes, adopts, current, rotation } = rotateSession(
      [long('x', 0, 6000), long('y', 1, 6000)],
      '1',
      7
    );
    expect(outcomes.every((outcome) => outcome.status === 'committed')).toBe(true);
    expect(adopts.every((entry) => entry[1] === undefined)).toBe(true);
    expect(rotation()).toBeTruthy();
    const total = current().items.reduce((sum, item) => {
      const d = (item.value as NoteEventValue).duration.quarterNotes;
      return sum + Number(d.numerator) / Number(d.denominator);
    }, 0);
    expect(total).toBe(4);
  });

  it('ends the session when the overlap rule really changes the packet', () => {
    // x (0-2) and w (5-6, another pitch) are selected; z (3-4) shares x's pitch and is not selected.
    // Rotating by 3 puts x on z (3-5): z was never overlapped by x, so the rule cuts z.
    const z = long('z', 3, 6000);
    const zValue = z.value as NoteEventValue;
    const shortZ = {
      ...z,
      value: { ...zValue, duration: musicalDuration(1), interOnset: musicalDuration(1) },
    };
    const { outcomes, adopts, current } = rotateSession(
      [long('x', 0, 6000), shortZ, { ...note('w', 5, 6400) }],
      '3',
      1,
      { ids: ['x', 'w'], range: { start: 0, end: 6 } }
    );
    expect(outcomes[0].status).toBe('committed');
    expect(adopts).toHaveLength(1);
    expect((adopts[0][0] as { rotation?: unknown }).rotation).toBeUndefined();
    expect(spans(current()).some((entry) => entry.startsWith('z:'))).toBe(false);
  });
});
