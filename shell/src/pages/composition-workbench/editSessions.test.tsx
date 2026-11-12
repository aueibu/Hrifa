import { act } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderDesk } from './deskTestUtils';
import { canUndo, resetHistory, undo } from './history';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import {
  acceptsSnippets,
  commitSnippetEdit,
  EDIT_SESSION_IDLE_MS,
  endEditSession,
  restoreSnippetVersion,
  type Snippet,
} from './snippet';

function notes(count: number, shift = 0): DataItem[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `note:${index}`,
    value: {
      onset: musicalPosition(index),
      interOnset: musicalDuration(1),
      duration: musicalDuration(1),
      pitches: [6000 + (shift + (index % 12)) * 100],
      velocity: 90,
    },
    provenance: [],
  }));
}

function clip(id: string): Snippet {
  return {
    schemaVersion: 1,
    id,
    name: id,
    createdAt: '2026-11-11T00:00:00Z',
    packet: packet('events', 'note', notes(4)),
  };
}

const shifted = (shift: number): DataPacket => packet('events', 'note', notes(4, shift));
const plain = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
const T0 = Date.parse('2026-11-11T01:00:00Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();

function commit(
  snippet: Snippet,
  shift: number,
  operation: string,
  ms: number,
  handEdit = operation.startsWith('edit')
) {
  const result = commitSnippetEdit(snippet, shifted(shift), operation, { at: at(ms), handEdit });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.snippet;
}

beforeEach(() => {
  resetHistory();
});

describe('edit sessions', () => {
  it('amend the head version for every edit in a session, with provenance stamped once', () => {
    let snippet = clip('s1');
    for (let shift = 1; shift <= 6; shift += 1) {
      snippet = commit(snippet, shift, 'edit-clip', shift * 1000);
    }
    const { lineage } = snippet;
    expect(lineage!.versions).toHaveLength(2);
    expect(snippet.packet.items[0].value).toMatchObject({ pitches: [6600] });
    expect(
      snippet.packet.items[0].provenance.filter((step) => step.transformation === 'edit-clip')
    ).toHaveLength(1);
    expect(lineage!.versions.find((version) => version.parentId === null)!.packet).toEqual(
      clip('s1').packet
    );
    expect(acceptsSnippets([snippet])).toBe(true);
  });

  it('end on endEditSession, on idle time, on a different operation and on a restore', () => {
    let snippet = commit(clip('s2'), 1, 'edit-clip', 0);
    snippet = commit(snippet, 2, 'edit-clip', 1000);
    expect(snippet.lineage!.versions).toHaveLength(2);

    endEditSession('s2');
    snippet = commit(snippet, 3, 'edit-clip', 2000);
    expect(snippet.lineage!.versions).toHaveLength(3);

    snippet = commit(snippet, 4, 'edit-clip', 2000 + EDIT_SESSION_IDLE_MS - 1);
    expect(snippet.lineage!.versions).toHaveLength(3);
    snippet = commit(snippet, 5, 'edit-clip', 2000 + EDIT_SESSION_IDLE_MS * 2);
    expect(snippet.lineage!.versions).toHaveLength(4);

    // A transform is always a version of its own, and so is the same transform twice.
    snippet = commit(snippet, 6, 'transpose', 2000 + EDIT_SESSION_IDLE_MS * 2 + 10);
    expect(snippet.lineage!.versions).toHaveLength(5);
    snippet = commit(snippet, 7, 'transpose', 2000 + EDIT_SESSION_IDLE_MS * 2 + 20);
    expect(snippet.lineage!.versions).toHaveLength(6);
    // Editing after a transform starts a new session, and a different edit kind does too.
    snippet = commit(snippet, 8, 'edit-clip', EDIT_SESSION_IDLE_MS * 3);
    expect(snippet.lineage!.versions).toHaveLength(7);
    snippet = commit(snippet, 9, 'edit-notes', EDIT_SESSION_IDLE_MS * 3 + 10);
    expect(snippet.lineage!.versions).toHaveLength(8);

    // Restoring an earlier version ends the session: the next edit branches from it.
    snippet = commit(snippet, 10, 'edit-notes', EDIT_SESSION_IDLE_MS * 3 + 20);
    expect(snippet.lineage!.versions).toHaveLength(8);
    const earlier = snippet.lineage!.versions.find((version) => version.parentId === null)!;
    const restored = restoreSnippetVersion(snippet, earlier.id);
    if (!restored.ok) {
      throw new Error(restored.error);
    }
    const branched = commit(restored.snippet, 11, 'edit-notes', EDIT_SESSION_IDLE_MS * 3 + 30);
    expect(branched.lineage!.versions).toHaveLength(9);
    expect(acceptsSnippets([branched])).toBe(true);
  });

  it('never amend without handEdit, whatever the operation is called (rhythmEdit names)', () => {
    let snippet = commit(clip('s5'), 1, 'edit-length', 0, false);
    snippet = commit(snippet, 2, 'edit-length', 1000, false);
    snippet = commit(snippet, 3, 'edit-rhythm', 2000, false);
    expect(snippet.lineage!.versions).toHaveLength(4);
  });

  it('make one version but several undo steps, and undo restores the exact prior snippets', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addSnippet(clip('s3')));
    const states = [plain(result.current.snippets)];
    for (let shift = 1; shift <= 3; shift += 1) {
      // Separate gestures (distinct coalesce keys), one edit session.
      act(() => {
        const edited = result.current.commitSnippetEditById('s3', shifted(shift), 'edit-clip', {
          coalesceKey: `gesture:${shift}`,
          handEdit: true,
        });
        expect(edited.ok).toBe(true);
      });
      states.push(plain(result.current.snippets));
    }
    expect(result.current.snippets[0].lineage!.versions).toHaveLength(2);
    expect(canUndo()).toBe(true);

    act(() => undo());
    expect(plain(result.current.snippets)).toEqual(states[2]);
    act(() => undo());
    expect(plain(result.current.snippets)).toEqual(states[1]);
    // Lineage included: after the first edit it still holds the one version made by the session.
    expect(result.current.snippets[0].lineage!.versions).toHaveLength(2);
    act(() => undo());
    expect(plain(result.current.snippets)).toEqual(states[0]);
    expect(result.current.snippets[0].lineage).toBeUndefined();

    // Editing again after undoing the whole session starts a fresh one.
    act(() => {
      result.current.commitSnippetEditById('s3', shifted(5), 'edit-clip', { handEdit: true });
    });
    expect(result.current.snippets[0].lineage!.versions).toHaveLength(2);
  });

  it('a transform on the desk makes its own version even right after hand edits', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addSnippet(clip('s4')));
    act(() => {
      result.current.commitSnippetEditById('s4', shifted(1), 'edit-clip', { handEdit: true });
      result.current.commitSnippetEditById('s4', shifted(2), 'edit-clip', { handEdit: true });
    });
    expect(result.current.snippets[0].lineage!.versions).toHaveLength(2);
    act(() => {
      result.current.commitSnippetEditById('s4', shifted(3), 'transpose');
    });
    expect(result.current.snippets[0].lineage!.versions).toHaveLength(3);
    act(() => result.current.endEditSession('s4'));
    act(() => {
      result.current.commitSnippetEditById('s4', shifted(4), 'edit-clip', { handEdit: true });
    });
    expect(result.current.snippets[0].lineage!.versions).toHaveLength(4);
  });

  it('a refused edit returns ok:false and leaves the edit session alone', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addSnippet(clip('s5')));
    const before = plain(result.current.snippets);
    // A project open freezes the desk: edits, restores and create-from-version are refused.
    await act(async () => {
      await result.current.replaceDesk(result.current.snippets, { reloading: true });
    });
    const outcomes: boolean[] = [];
    act(() => {
      outcomes.push(
        result.current.commitSnippetEditById('s5', shifted(1), 'edit-clip', { handEdit: true }).ok,
        result.current.restoreSnippetVersionById('s5', 'any').ok,
        result.current.createClipFromVersionById('s5', 'any').ok
      );
    });
    expect(outcomes).toEqual([false, false, false]);
    expect(plain(result.current.snippets)).toEqual(before);

    await act(async () => {
      await result.current.replaceDesk(result.current.snippets, { restore: true });
    });
    act(() => {
      result.current.commitSnippetEditById('s5', shifted(2), 'edit-clip', { handEdit: true });
      result.current.commitSnippetEditById('s5', shifted(3), 'edit-clip', { handEdit: true });
    });
    // One session: root plus one amended head, as if the refused edit never happened.
    expect(result.current.snippets[0].lineage!.versions).toHaveLength(2);
  });
});
