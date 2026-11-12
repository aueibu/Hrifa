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

const publish = (adopt: () => void, selection = { ids: [] as string[], range: null }) =>
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

describe('a merge ends the rotation session', () => {
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

  it('keeps the session when nothing merged', () => {
    const { adopt, outcome } = rotate([long('x', 0, 6000), long('y', 1, 6400)]);
    expect(outcome.status).toBe('committed');
    expect(adopt.mock.calls[0][0].rotation).toBeTruthy();
    expect(adopt.mock.calls[0][2]).toBeUndefined();
  });

  it('drops the session when the rotation itself lands two pieces on one note', () => {
    // x wraps to (7, 1) and (0, 1); y lands on (0, 2): the same onset and pitch as x's first piece.
    const { adopt, outcome, current } = rotate([long('x', 0, 6000), long('y', 1, 6000)]);
    expect(outcome.status).toBe('committed');
    expect(current().items).toHaveLength(2);
    expect(adopt).toHaveBeenCalledTimes(1);
    expect(adopt.mock.calls[0][0].rotation).toBeUndefined();
    expect(adopt.mock.calls[0][2]).toBeInstanceOf(Map);
  });
});
