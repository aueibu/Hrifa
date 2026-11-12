import { act, render, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SnippetSourceModule } from './components/SnippetSourceModule';
import type { PublishedCompositionOutput } from './compositionRouting';
import { DeskProvider, useDesk } from './desk';
import { renderDesk, storedDesk } from './deskTestUtils';
import { canRedo, canUndo, redo, resetHistory, undo } from './history';
import { melodicize, type NoteEventValue } from './melodicization';
import { packet, type DataPacket } from './model';
import { musicalDuration } from './musicalTime';
import { interpretPitchList } from './pitch';
import {
  acceptsSnippets,
  captureSnippet,
  commitSnippetEdit,
  convertSnippetToPitchClass,
  createClipFromVersion,
  duplicateSnippet,
  endEditSession,
  MAX_LINEAGE_CHARS,
  MAX_SNIPPET_VERSIONS,
  restoreSnippetVersion,
  type Snippet,
} from './snippet';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    playing: false,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

function noteSnippet(id = 'snip-1'): Snippet {
  const rhythm = packet(
    'list',
    'duration',
    [1, 1, 2].map((value, index) => ({ id: `rhythm:${index}`, value, provenance: [] })),
    [],
    undefined,
    { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: 4 } }
  );
  const result = melodicize({
    instanceId: 'melodicization',
    rhythm,
    pitches: interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60, 64, 67',
    }).packet,
    allocation: 'cycle',
    pulseUnit: musicalDuration(1, 4),
    articulationPercent: 100,
  });
  const captured = captureSnippet({
    id,
    createdAt: '2026-11-11T00:00:00Z',
    name: 'Gesture',
    moduleInstance: 'mel-1',
    packet: result.packet,
  });
  if (!captured.ok) {
    throw new Error(captured.error);
  }
  return captured.snippet;
}

/** A copy of the snippet packet with the first note raised an octave and one note added. */
function editedPacket(snippet: Snippet): DataPacket {
  const copy = structuredClone(snippet.packet) as DataPacket<NoteEventValue>;
  copy.items[0].value.pitches = copy.items[0].value.pitches.map((pitch) => pitch + 1200);
  const extra = structuredClone(copy.items[1]);
  extra.id = 'new-note';
  extra.provenance = [];
  copy.items.push(extra);
  return copy;
}

const snapshot = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;

describe('commitSnippetEdit', () => {
  it('keeps id, createdAt, name and origin, replaces the packet, and appends provenance', () => {
    const snippet = noteSnippet();
    const before = snapshot(snippet);
    const next = editedPacket(snippet);
    const result = commitSnippetEdit(snippet, next, 'edit-clip');
    if (!result.ok) {
      throw new Error(result.error);
    }
    const edited = result.snippet;
    expect(edited).not.toBe(snippet);
    expect(edited.id).toBe(snippet.id);
    expect(edited.createdAt).toBe(snippet.createdAt);
    expect(edited.name).toBe(snippet.name);
    expect(edited.origin).toEqual(snippet.origin);
    expect(edited.packet.items).toHaveLength(snippet.packet.items.length + 1);
    expect(edited.packet.items[0].value).not.toEqual(snippet.packet.items[0].value);

    const stamp = (index: number) => {
      const steps = edited.packet.items[index].provenance;
      return steps[steps.length - 1];
    };
    const last = edited.packet.items.length - 1;
    expect(stamp(0)).toMatchObject({
      transformation: 'edit-clip',
      sourceItemIds: [edited.packet.items[0].id],
    });
    expect(stamp(0).parameters).toMatchObject({ snippetId: snippet.id, change: 'modified' });
    expect(stamp(last).parameters).toMatchObject({ change: 'added' });
    // Unchanged items get no step at all.
    expect(edited.packet.items[1].provenance).toEqual(snippet.packet.items[1].provenance);
    const headId = edited.lineage?.head;
    expect(stamp(0).parameters?.versionId).toBe(headId);

    // The input snippet is untouched, and the result does not alias the new packet.
    expect(snippet).toEqual(before);
    expect(edited.packet).not.toBe(next);
    expect(edited.packet.items[0]).not.toBe(next.items[0]);
    expect(next.items[0].provenance.some((step) => step.transformation === 'edit-clip')).toBe(
      false
    );
    expect(acceptsSnippets([edited])).toBe(true);
    expect(JSON.parse(JSON.stringify(edited))).toEqual(edited);
  });

  it('rejects packets that are not JSON-safe or not valid, without throwing', () => {
    const snippet = noteSnippet();
    const bad = (mutate: (copy: DataPacket) => void) => {
      const copy = structuredClone(snippet.packet);
      mutate(copy);
      return copy;
    };
    const cases: DataPacket[] = [
      bad((copy) => {
        copy.items[0].value = Number.NaN;
      }),
      bad((copy) => {
        copy.items[0].value = () => 1;
      }),
      bad((copy) => {
        copy.items[0].value = new Date();
      }),
      bad((copy) => {
        copy.items[1].id = copy.items[0].id;
      }),
      bad((copy) => {
        (copy as { items: unknown }).items = 'nope';
      }),
      bad((copy) => {
        (copy.items[0] as { provenance: unknown }).provenance = undefined;
      }),
    ];
    for (const invalid of cases) {
      expect(commitSnippetEdit(snippet, invalid, 'edit-clip').ok).toBe(false);
    }
    expect(commitSnippetEdit(snippet, snippet.packet, '  ').ok).toBe(false);
  });
});

describe('commitSnippetEditById', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  function setup() {
    return renderDesk();
  }

  it('replaces in place, is one undo step, redoes, and survives reload', async () => {
    const { result, unmount } = await setup();
    act(() => result.current.addSnippet(noteSnippet()));
    act(() => result.current.addSnippet(noteSnippet('other')));
    const before = snapshot(result.current.snippets);

    let outcome: ReturnType<typeof result.current.commitSnippetEditById> | undefined;
    act(() => {
      outcome = result.current.commitSnippetEditById(
        'snip-1',
        editedPacket(result.current.snippets[0]),
        'edit-clip'
      );
    });
    expect(outcome?.ok).toBe(true);
    const after = snapshot(result.current.snippets);
    expect(after.map((snippet) => snippet.id)).toEqual(['snip-1', 'other']);
    expect(after[0].packet).not.toEqual(before[0].packet);
    expect(after[1]).toEqual(before[1]);

    act(() => undo());
    expect(result.current.snippets).toEqual(before);
    expect(canRedo()).toBe(true);
    act(() => redo());
    expect(result.current.snippets).toEqual(after);

    expect(await storedDesk(result.current)).toEqual(after);
    unmount();
    const reloaded = await setup();
    expect(reloaded.result.current.snippets).toEqual(after);
    expect(acceptsSnippets(reloaded.result.current.snippets)).toBe(true);
    reloaded.unmount();
  });

  it('records nothing for an unchanged packet, an unknown id or an invalid packet', async () => {
    const { result } = await setup();
    act(() => result.current.addSnippet(noteSnippet()));
    const before = snapshot(result.current.snippets);

    let outcomes: boolean[] = [];
    act(() => {
      const current = result.current.snippets[0];
      outcomes = [
        result.current.commitSnippetEditById('snip-1', structuredClone(current.packet), 'edit-clip')
          .ok,
        result.current.commitSnippetEditById('missing', editedPacket(current), 'edit-clip').ok,
        result.current.commitSnippetEditById(
          'snip-1',
          { ...current.packet, items: [{ id: 'x', value: Number.NaN, provenance: [] }] },
          'edit-clip'
        ).ok,
      ];
    });
    expect(outcomes).toEqual([true, false, false]);
    expect(result.current.snippets).toEqual(before);
    // The only history entry is still the add.
    act(() => undo());
    expect(result.current.snippets).toEqual([]);
    expect(canUndo()).toBe(false);
  });

  it('a Make-source module for the snippet publishes the new packet after an edit, and after undo', async () => {
    const published: Record<string, PublishedCompositionOutput[]> = {};
    const onOutputsChange = (id: string, outputs: PublishedCompositionOutput[]) => {
      published[id] = outputs;
    };
    let desk: ReturnType<typeof useDesk> | undefined;
    function Probe() {
      desk = useDesk();
      return null;
    }
    render(
      <DeskProvider>
        <Probe />
        <SnippetSourceModule
          instanceId="source-1"
          instanceLabel="Source"
          snippetId="snip-1"
          onOutputsChange={onOutputsChange}
        />
      </DeskProvider>
    );
    await waitFor(() => expect(desk?.loading).toBe(false));
    act(() => desk?.addSnippet(noteSnippet()));
    const original = snapshot(published['source-1'][0].packet);
    expect(original).toEqual(snapshot(noteSnippet().packet));

    act(() => {
      desk?.commitSnippetEditById('snip-1', editedPacket(desk.snippets[0]), 'edit-clip');
    });
    const updated = published['source-1'][0].packet;
    expect(updated).toEqual(desk?.snippets[0].packet);
    expect(updated.items).toHaveLength(original.items.length + 1);

    act(() => undo());
    expect(published['source-1'][0].packet).toEqual(original);
  });
});

// Each call is its own version here (the edit-session rule is tested in editSessions.test.tsx).
const edit = (snippet: Snippet, packet: DataPacket, operation = 'edit-clip') => {
  endEditSession(snippet.id);
  const result = commitSnippetEdit(snippet, packet, operation);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.snippet;
};

/** The snippet packet with note `index` shifted by `cents`. */
function shifted(snippet: Snippet, index: number, cents: number): DataPacket {
  const copy = structuredClone(snippet.packet) as DataPacket<NoteEventValue>;
  copy.items[index].value.pitches = copy.items[index].value.pitches.map((pitch) => pitch + cents);
  return copy;
}

const rootOf = (snippet: Snippet) =>
  snippet.lineage!.versions.find((version) => version.parentId === null)!.id;

describe('lineage', () => {
  it('a never-edited clip stores no lineage; the first edit creates the root, then the head', () => {
    const snippet = noteSnippet();
    expect(snippet.lineage).toBeUndefined();
    const once = edit(snippet, shifted(snippet, 0, 100));
    const { head, versions } = once.lineage!;
    expect(versions).toHaveLength(2);
    const root = versions.find((version) => version.parentId === null)!;
    expect(root.operation).toBe('original');
    expect(root.packet).toEqual(snippet.packet);
    const current = versions.find((version) => version.id === head)!;
    expect(current.parentId).toBe(root.id);
    // The head holds no second copy of the packet: it is the snippet packet.
    expect(current.packet).toBeUndefined();
    const twice = edit(once, shifted(once, 1, 100));
    expect(twice.lineage?.versions).toHaveLength(3);
    expect(twice.lineage?.versions.find((v) => v.id === once.lineage?.head)?.packet).toEqual(
      once.packet
    );
    expect(acceptsSnippets([twice])).toBe(true);
  });

  it('refuses edits that change kind, domain or encoding, and never throws on a cyclic packet', () => {
    const snippet = noteSnippet();
    for (const change of [
      { kind: 'list' as const },
      { domain: 'duration' as const },
      { encoding: 'chromatic-12' as const },
    ]) {
      const result = commitSnippetEdit(snippet, { ...snippet.packet, ...change }, 'edit-clip');
      expect(result.ok).toBe(false);
    }
    const cyclic = structuredClone(snippet.packet) as DataPacket & { self?: unknown };
    cyclic.self = cyclic;
    expect(commitSnippetEdit(snippet, cyclic, 'edit-clip').ok).toBe(false);
  });

  it('records reordering as a real change without stamping any item', () => {
    const snippet = noteSnippet();
    const reordered = structuredClone(snippet.packet);
    reordered.items.reverse();
    const result = edit(snippet, reordered);
    expect(result.lineage?.versions).toHaveLength(2);
    expect(result.packet.items.map((item) => item.id)).toEqual(
      reordered.items.map((item) => item.id)
    );
    for (const item of result.packet.items) {
      expect(item.provenance.some((step) => step.transformation === 'edit-clip')).toBe(false);
    }
  });

  it('restore moves the head back, keeps every snapshot, and a following edit branches', () => {
    const base = noteSnippet();
    const one = edit(base, shifted(base, 0, 100));
    const two = edit(one, shifted(one, 0, 100));
    const rootId = rootOf(one);

    const restored = restoreSnippetVersion(two, rootId);
    if (!restored.ok) {
      throw new Error(restored.error);
    }
    expect(restored.snippet.id).toBe(base.id);
    expect(restored.snippet.packet).toEqual(base.packet);
    expect(restored.snippet.lineage?.head).toBe(rootId);
    expect(restored.snippet.lineage?.versions).toHaveLength(3);
    expect(acceptsSnippets([restored.snippet])).toBe(true);
    // The state we left is still there.
    expect(
      restored.snippet.lineage?.versions.find((version) => version.id === two.lineage?.head)?.packet
    ).toEqual(two.packet);

    const branched = edit(restored.snippet, shifted(restored.snippet, 2, 300));
    expect(branched.lineage!.versions).toHaveLength(4);
    expect(
      branched.lineage!.versions.filter((version) => version.parentId === rootId)
    ).toHaveLength(2);
    expect(acceptsSnippets([branched])).toBe(true);

    expect(restoreSnippetVersion(base, rootId).ok).toBe(false);
    expect(restoreSnippetVersion(two, 'nope').ok).toBe(false);
    const same = restoreSnippetVersion(two, two.lineage!.head);
    expect(same.ok && same.snippet === two).toBe(true);
  });

  it('createClipFromVersion makes a new derived clip with its own history', () => {
    const base = noteSnippet();
    const one = edit(base, shifted(base, 0, 100));
    const rootId = rootOf(one);
    const before = snapshot(one);
    const result = createClipFromVersion(one, rootId, { id: 'child', createdAt: 'T' });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const child = result.snippet;
    expect(one).toEqual(before);
    expect(child.id).toBe('child');
    expect(child.name).toBe('Gesture (from earlier)');
    expect(child.packet.items.map((item) => item.value)).toEqual(
      base.packet.items.map((item) => item.value)
    );
    expect(child.lineage?.derivedFrom).toEqual({
      snippetId: base.id,
      versionId: rootId,
      operation: 'create-from-version',
    });
    expect(child.lineage?.versions).toHaveLength(1);
    expect(acceptsSnippets([child])).toBe(true);
    expect(createClipFromVersion(one, 'nope', { id: 'x', createdAt: 'T' }).ok).toBe(false);
  });

  it('duplicate and pitch-class conversion record derivedFrom and do not copy the tree', () => {
    const base = noteSnippet();
    const plain = duplicateSnippet(base, { id: 'dup', createdAt: 'T' });
    expect(plain.lineage?.derivedFrom).toEqual({
      snippetId: base.id,
      versionId: null,
      operation: 'duplicate-snippet',
    });
    expect(base.lineage).toBeUndefined();

    const edited = edit(base, shifted(base, 0, 100));
    const dup = duplicateSnippet(edited, { id: 'dup2', createdAt: 'T' });
    expect(dup.lineage?.derivedFrom?.versionId).toBe(edited.lineage?.head);
    expect(dup.lineage?.versions).toHaveLength(1);
    const converted = convertSnippetToPitchClass(edited, { id: 'pc', createdAt: 'T', edo: 12 });
    expect(converted.ok && converted.snippet.lineage?.derivedFrom).toMatchObject({
      snippetId: base.id,
      versionId: edited.lineage?.head,
      operation: 'to-pitch-class',
    });
    expect(acceptsSnippets([edited, dup, plain])).toBe(true);
  });

  it('prunes by count and by size, keeping a connected tree with the head and root', () => {
    let snippet = noteSnippet();
    const limits = { maxVersions: 5, maxChars: Number.POSITIVE_INFINITY };
    for (let index = 0; index < 12; index += 1) {
      const result = commitSnippetEdit(snippet, shifted(snippet, 0, 100), 'edit-clip', { limits });
      if (!result.ok) {
        throw new Error(result.error);
      }
      snippet = result.snippet;
      expect(snippet.lineage!.versions.length).toBeLessThanOrEqual(5);
      expect(acceptsSnippets([snippet])).toBe(true);
    }
    expect(snippet.lineage!.versions.some((version) => version.parentId === null)).toBe(true);
    expect(snippet.lineage!.versions.some((version) => version.id === snippet.lineage!.head)).toBe(
      true
    );

    // A branch tip survives while an interior ancestor goes.
    const tight = { maxVersions: 4, maxChars: Number.POSITIVE_INFINITY };
    const first = noteSnippet();
    let tree = edit(first, shifted(first, 0, 1));
    const rootId = rootOf(tree);
    tree = edit(tree, shifted(tree, 0, 1));
    const tipId = tree.lineage!.head;
    const restored = restoreSnippetVersion(tree, rootId);
    if (!restored.ok) {
      throw new Error(restored.error);
    }
    let grown = restored.snippet;
    for (let index = 0; index < 3; index += 1) {
      const result = commitSnippetEdit(grown, shifted(grown, 1, 5), 'edit-clip', { limits: tight });
      if (!result.ok) {
        throw new Error(result.error);
      }
      grown = result.snippet;
    }
    expect(grown.lineage!.versions.length).toBeLessThanOrEqual(4);
    expect(grown.lineage!.versions.some((version) => version.id === tipId)).toBe(true);
    expect(grown.lineage!.versions.some((version) => version.id === rootId)).toBe(true);
    expect(acceptsSnippets([grown])).toBe(true);

    // A byte budget alone also bounds it, down to root plus head.
    const sized = commitSnippetEdit(snippet, shifted(snippet, 0, 100), 'edit-clip', {
      limits: { maxVersions: 100, maxChars: 1 },
    });
    expect(sized.ok && sized.snippet.lineage!.versions.length).toBe(2);
    expect(MAX_SNIPPET_VERSIONS).toBeGreaterThan(1);
    expect(MAX_LINEAGE_CHARS).toBeGreaterThan(1);
  });

  it('acceptsSnippets takes v1 clips without lineage and rejects malformed lineage', () => {
    const base = noteSnippet();
    const good = edit(base, shifted(base, 0, 100));
    expect(acceptsSnippets([base])).toBe(true);
    expect(acceptsSnippets([good])).toBe(true);
    const accepts = (change: (lineage: NonNullable<Snippet['lineage']>) => void) => {
      const copy = snapshot(good);
      change(copy.lineage!);
      return acceptsSnippets([copy]);
    };
    expect(accepts((l) => (l.head = 'missing'))).toBe(false);
    expect(accepts((l) => (l.versions[1].parentId = 'dangling'))).toBe(false);
    expect(
      accepts((l) => {
        l.versions[0].parentId = l.versions[1].id;
      })
    ).toBe(false);
    expect(accepts((l) => (l.versions[1].parentId = l.versions[1].id))).toBe(false);
    expect(accepts((l) => (l.versions = []))).toBe(false);
    expect(accepts((l) => (l.versions[0].packet = undefined))).toBe(false);
    expect(accepts((l) => (l.versions[1].packet = structuredClone(good.packet)))).toBe(false);
    expect(accepts((l) => l.versions.push({ ...l.versions[0] }))).toBe(false);
    expect(
      accepts((l) => {
        (l as { derivedFrom?: unknown }).derivedFrom = { snippetId: 3 };
      })
    ).toBe(false);
    expect(acceptsSnippets([{ ...snapshot(good), lineage: 'x' }])).toBe(false);
  });
});

describe('lineage operations on the desk', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  it('commit, restore and create-from-version are each one undo step, and reload round-trips', async () => {
    const { result, unmount } = await renderDesk();
    act(() => result.current.addSnippet(noteSnippet()));
    const states = [snapshot(result.current.snippets)];
    const run = (action: (desk: ReturnType<typeof useDesk>) => unknown) => {
      act(() => void action(result.current));
      states.push(snapshot(result.current.snippets));
    };
    run((desk) =>
      desk.commitSnippetEditById('snip-1', shifted(desk.snippets[0], 0, 100), 'edit-clip')
    );
    run((desk) =>
      desk.commitSnippetEditById('snip-1', shifted(desk.snippets[0], 1, 100), 'edit-clip')
    );
    const rootId = rootOf(result.current.snippets[0]);
    run((desk) => desk.restoreSnippetVersionById('snip-1', rootId));
    run((desk) => desk.createClipFromVersionById('snip-1', rootId));
    run((desk) => desk.duplicateSnippetById('snip-1'));
    expect(result.current.snippets).toHaveLength(3);
    expect(acceptsSnippets(result.current.snippets)).toBe(true);

    // Restoring the head, an unknown version or an unknown clip records nothing.
    const headId = result.current.snippets[0].lineage!.head;
    act(() => {
      result.current.restoreSnippetVersionById('snip-1', headId);
      expect(result.current.restoreSnippetVersionById('snip-1', 'nope').ok).toBe(false);
      expect(result.current.createClipFromVersionById('missing', 'nope').ok).toBe(false);
    });
    expect(snapshot(result.current.snippets)).toEqual(states[states.length - 1]);

    // Reload round trip: stored desk equals the live desk and passes the shape check.
    const final = states[states.length - 1];
    expect(await storedDesk(result.current)).toEqual(final);

    for (let index = states.length - 2; index >= 0; index -= 1) {
      act(() => undo());
      expect(result.current.snippets).toEqual(states[index]);
    }
    for (let index = 1; index < states.length; index += 1) {
      act(() => redo());
      expect(result.current.snippets).toEqual(states[index]);
    }
    unmount();
    const reloaded = await renderDesk();
    expect(reloaded.result.current.snippets).toEqual(final);
    reloaded.unmount();
  });

  it('a Make-source module follows an edit and a restore', async () => {
    const published: Record<string, PublishedCompositionOutput[]> = {};
    let desk: ReturnType<typeof useDesk> | undefined;
    function Probe() {
      desk = useDesk();
      return null;
    }
    render(
      <DeskProvider>
        <Probe />
        <SnippetSourceModule
          instanceId="source-1"
          instanceLabel="Source"
          snippetId="snip-1"
          onOutputsChange={(id, outputs) => {
            published[id] = outputs;
          }}
        />
      </DeskProvider>
    );
    await waitFor(() => expect(desk?.loading).toBe(false));
    act(() => desk?.addSnippet(noteSnippet()));
    const original = snapshot(published['source-1'][0].packet);
    act(() => {
      desk?.commitSnippetEditById('snip-1', shifted(desk.snippets[0], 0, 100), 'edit-clip');
    });
    expect(published['source-1'][0].packet).toEqual(desk?.snippets[0].packet);
    expect(published['source-1'][0].packet).not.toEqual(original);
    const rootId = rootOf(desk!.snippets[0]);
    act(() => {
      desk?.restoreSnippetVersionById('snip-1', rootId);
    });
    expect(published['source-1'][0].packet).toEqual(original);
  });
});
