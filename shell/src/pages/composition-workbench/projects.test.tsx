import { act, render, renderHook, screen, userEvent, waitFor, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectMenu } from './components/ProjectMenu';
import {
  CompositionSettingsProvider,
  STORAGE_KEY as settingsKey,
  useCompositionSettings,
} from './compositionSettings';
import { acceptsDataBlocks, endEditSession, type PacketBlock } from './dataBlock';
import { DeskProvider, useDesk } from './desk';
import {
  enqueueDeskTask,
  getProject,
  listProjects,
  loadDesk,
  putProjects,
  writeDeskNow,
} from './deskStore';
import { renderDesk, storedDesk } from './deskTestUtils';
import { DEVELOPER_OPTIONS_KEY } from './developerOptions';
import { historyChangeCount, recordChange, resetHistory } from './history';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import {
  captureWorkbenchState,
  createProject,
  currentProjectKey,
  openProject,
  parseProjectFile,
  projectFileText,
  readCurrentProject,
  restoreWorkbenchState,
  saveProject,
  type OpenableDesk,
} from './projects';
import { isReloading } from './reloading';
import { usePersistentState } from './usePersistentState';

const stopAll = vi.fn();
vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ stopAll }),
}));

const nodeKey = 'hrifa.composition-workbench.fractioning.a.v1';
const extraKey = 'hrifa.composition-workbench.interference.generators.v1.instance.x';

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

function dataBlock(id: string, count = 4): PacketBlock {
  return {
    schemaVersion: 2,
    typeId: 'notes',
    id,
    name: id,
    createdAt: '2026-11-11T00:00:00Z',
    payload: { kind: 'packet', packet: packet('events', 'note', notes(count)) },
  };
}

const withShift = (dataBlock: PacketBlock, shift: number): DataPacket =>
  packet('events', 'note', notes(dataBlock.payload.packet.items.length, shift));

const plain = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;

function edit(desk: ReturnType<typeof useDesk>, id: string, shift: number) {
  endEditSession(id);
  const target = desk.dataBlocks.find((dataBlock) => dataBlock.id === id)!;
  expect(
    desk.commitDataBlockEditById(id, withShift(target, shift), 'edit', {
      handEdit: true,
    }).ok
  ).toBe(true);
}

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  stopAll.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('workbench state helpers', () => {
  it('captures only workbench entries', () => {
    localStorage.setItem(nodeKey, '5');
    localStorage.setItem('hrifa.other-page.v1', 'x');
    localStorage.setItem(currentProjectKey, '{}');
    expect(captureWorkbenchState()).toEqual({ [nodeKey]: '5' });
  });

  it('restores exactly the project, removing entries added since, and can keep settings', () => {
    localStorage.setItem(settingsKey, '{"edo":12}');
    localStorage.setItem(nodeKey, '5');
    const project = createProject('A', null);
    localStorage.setItem(settingsKey, '{"edo":19}');
    localStorage.setItem(nodeKey, '7');
    localStorage.setItem(extraKey, '[]');
    restoreWorkbenchState(project.entries, { includeSettings: false });
    expect(localStorage.getItem(nodeKey)).toBe('5');
    expect(localStorage.getItem(extraKey)).toBeNull();
    expect(localStorage.getItem(settingsKey)).toBe('{"edo":19}');
    restoreWorkbenchState(project.entries, { includeSettings: true });
    expect(localStorage.getItem(settingsKey)).toBe('{"edo":12}');
  });

  it('names an unnamed project after its time', () => {
    expect(createProject('  ', null, localStorage, new Date(2026, 0, 2)).name).toMatch(/^Project /);
  });

  it('round-trips through a file with fresh ids, only workbench keys and the desk', () => {
    const project = {
      ...createProject('A', [dataBlock('a')]),
      entries: { [nodeKey]: '5', 'evil.key': 'x' },
    };
    const [imported] = parseProjectFile(projectFileText([project]));
    expect(imported.name).toBe('A');
    expect(imported.id).not.toBe(project.id);
    expect(imported.entries).toEqual({ [nodeKey]: '5' });
    expect(imported.desk).toEqual([dataBlock('a')]);
  });

  it('rejects files that are not a project export', () => {
    const snapshots = JSON.stringify({
      format: 'hrifa-workbench-snapshots',
      version: 1,
      snapshots: [],
    });
    expect(() => parseProjectFile(snapshots)).toThrow(/not a workbench project/);
    expect(() => parseProjectFile('nope')).toThrow(/not valid JSON/);
    expect(() => parseProjectFile('{"projects":[]}')).toThrow(/not a workbench project/);
  });
});

describe('saving and opening a project', () => {
  it('round-trips the workbench keys and the whole desk, lineage included, via IndexedDB', async () => {
    const first = await renderDesk();
    act(() => first.result.current.addDataBlock(dataBlock('a')));
    act(() => first.result.current.addDataBlock(dataBlock('b')));
    act(() => edit(first.result.current, 'a', 1));
    act(() => edit(first.result.current, 'a', 2));
    localStorage.setItem(nodeKey, '5');
    const saved = plain(first.result.current.dataBlocks);
    expect(saved[0].lineage!.versions).toHaveLength(3);

    const result = await saveProject({
      name: 'Alpha',
      existing: null,
      desk: first.result.current.dataBlocks,
    });
    expect(result.ok).toBe(true);
    const [listed] = await listProjects();
    expect(listed).toMatchObject({ name: 'Alpha', hasDesk: true });
    expect(listed.entries).toEqual({ [nodeKey]: '5' });
    // The desk drifts after the save, and a fresh page loads that drifted desk.
    act(() => first.result.current.addDataBlock(dataBlock('drifted')));
    act(() => first.result.current.removeDataBlock('a'));
    first.unmount();
    localStorage.setItem(nodeKey, '9');
    const second = await renderDesk();
    expect(second.result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual([
      'b',
      'drifted',
    ]);
    let opened: Awaited<ReturnType<typeof openProject>> | undefined;
    await act(async () => {
      opened = await openProject({
        id: listed.id,
        desk: second.result.current,
        includeSettings: true,
      });
    });
    expect(opened?.ok).toBe(true);
    expect(localStorage.getItem(nodeKey)).toBe('5');
    // The page on screen is left alone until the reload.
    expect(second.result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual([
      'b',
      'drifted',
    ]);
    // The reload would read the desk from IndexedDB: it holds the project's, lineage and all.
    expect(await storedDesk(second.result.current)).toEqual(saved);
    expect(acceptsDataBlocks(await storedDesk(second.result.current))).toBe(true);
  });

  it('replaces the desk entirely: data-blocks not in the project are gone, project data-blocks keep their lineage', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('keep')));
    act(() => edit(result.current, 'keep', 1));
    const project = plain(result.current.dataBlocks);
    await saveProject({ name: 'P', existing: null, desk: result.current.dataBlocks });
    // After saving: the desk drifts. A data-block is added, the kept one edited again, then removed.
    act(() => result.current.addDataBlock(dataBlock('extra')));
    act(() => edit(result.current, 'keep', 7));
    act(() => edit(result.current, 'keep', 8));
    const [listed] = await listProjects();

    await act(async () => {
      await openProject({ id: listed.id, desk: result.current, includeSettings: true });
    });
    const stored = await loadDesk();
    expect(plain(stored.dataBlocks)).toEqual(project);
    expect(stored.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['keep']);
    expect(stored.dataBlocks[0].lineage!.versions).toHaveLength(2);
    expect(result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['keep', 'extra']);
  });

  it('overwrites the current project when saving again under the same (or no) name', async () => {
    const first = await saveProject({ name: 'One', existing: null, desk: [dataBlock('a')] });
    if (!first.ok) {
      throw new Error(first.error);
    }
    await saveProject({ name: '', existing: first.project, desk: [dataBlock('b')] });
    await saveProject({ name: 'One', existing: first.project, desk: [dataBlock('c')] });
    let projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect((await getProject(first.project.id))!.desk![0].id).toBe('c');
    await saveProject({ name: 'Two', existing: first.project, desk: [dataBlock('d')] });
    projects = await listProjects();
    expect(projects.map((project) => project.name).sort()).toEqual(['One', 'Two']);
  });

  it('leaves the desk alone when a project holds none (saved while the desk was unreadable)', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('stay')));
    localStorage.setItem(nodeKey, '5');
    const saved = await saveProject({ name: 'No desk', existing: null, desk: null });
    if (!saved.ok) {
      throw new Error(saved.error);
    }
    localStorage.setItem(nodeKey, '9');
    await act(async () => {
      await openProject({ id: saved.project.id, desk: result.current, includeSettings: true });
    });
    expect(localStorage.getItem(nodeKey)).toBe('5');
    expect(result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['stay']);
  });
});

describe('a failed or refused open', () => {
  async function seeded() {
    const rendered = await renderDesk();
    act(() => rendered.result.current.addDataBlock(dataBlock('now')));
    await storedDesk(rendered.result.current);
    localStorage.setItem(nodeKey, '9');
    const saved = await saveProject({
      name: 'Other',
      existing: null,
      desk: [dataBlock('then')],
    });
    if (!saved.ok) {
      throw new Error(saved.error);
    }
    // The project's own key value differs from what is live.
    await putProjects([{ ...(await getProject(saved.project.id))!, entries: { [nodeKey]: '5' } }]);
    return { ...rendered, id: saved.project.id };
  }

  async function expectUntouched(
    rendered: Awaited<ReturnType<typeof seeded>>,
    result: Awaited<ReturnType<typeof openProject>> | undefined
  ) {
    expect(result?.ok).toBe(false);
    expect(localStorage.getItem(nodeKey)).toBe('9');
    expect(rendered.result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['now']);
    expect((await loadDesk()).dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['now']);
  }

  it('writes nothing when the desk cannot be saved', async () => {
    const rendered = await seeded();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    let result: Awaited<ReturnType<typeof openProject>> | undefined;
    await act(async () => {
      result = await openProject({
        id: rendered.id,
        desk: rendered.result.current,
        includeSettings: true,
      });
    });
    vi.restoreAllMocks();
    expect(result).toMatchObject({ ok: false });
    expect(result && !result.ok && result.error).toMatch(/nothing was opened/);
    await expectUntouched(rendered, result);
  });

  it('refuses when another tab changed the desk (rev conflict)', async () => {
    const rendered = await seeded();
    const other = await loadDesk();
    await enqueueDeskTask(() =>
      writeDeskNow({
        dataBlocks: [...other.dataBlocks, dataBlock('theirs')],
        stored: other.stored,
        expectedRev: other.rev,
      })
    );
    let result: Awaited<ReturnType<typeof openProject>> | undefined;
    await act(async () => {
      result = await openProject({
        id: rendered.id,
        desk: rendered.result.current,
        includeSettings: true,
      });
    });
    expect(result?.ok).toBe(false);
    expect(localStorage.getItem(nodeKey)).toBe('9');
    expect(rendered.result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['now']);
    expect((await loadDesk()).dataBlocks.map((dataBlock) => dataBlock.id)).toEqual([
      'now',
      'theirs',
    ]);
  });

  it('refuses while the desk is loading or locked, and for a project that is gone', async () => {
    const rendered = await seeded();
    const replaceDesk = vi.fn();
    const base: OpenableDesk = { dataBlocks: [], loading: false, locked: false, replaceDesk };
    const loading = await openProject({
      id: rendered.id,
      desk: { ...base, loading: true },
      includeSettings: true,
    });
    const locked = await openProject({
      id: rendered.id,
      desk: { ...base, locked: true },
      includeSettings: true,
    });
    const gone = await openProject({ id: 'nope', desk: base, includeSettings: true });
    [loading, locked, gone].forEach((outcome) => expect(outcome.ok).toBe(false));
    expect(replaceDesk).not.toHaveBeenCalled();
    await expectUntouched(rendered, loading);
  });

  it('puts everything back when localStorage fails after the desk was replaced', async () => {
    const rendered = await seeded();
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === nodeKey && value === '5') {
        throw new DOMException('full', 'QuotaExceededError');
      }
      return real.call(this, key, value);
    });
    let result: Awaited<ReturnType<typeof openProject>> | undefined;
    await act(async () => {
      result = await openProject({
        id: rendered.id,
        desk: rendered.result.current,
        includeSettings: true,
      });
    });
    vi.restoreAllMocks();
    await expectUntouched(rendered, result);
  });
});

describe('the page closing for a reload', () => {
  async function openSeeded() {
    const rendered = await renderDesk();
    act(() => rendered.result.current.addDataBlock(dataBlock('now')));
    await storedDesk(rendered.result.current);
    const saved = await saveProject({ name: 'B', existing: null, desk: [dataBlock('then')] });
    if (!saved.ok) {
      throw new Error(saved.error);
    }
    await putProjects([{ ...(await getProject(saved.project.id))!, entries: { [nodeKey]: '5' } }]);
    localStorage.setItem(nodeKey, '9');
    return { ...rendered, id: saved.project.id };
  }

  it('after a successful open, later writes and recorded changes leave storage and the count alone', async () => {
    const rendered = await openSeeded();
    const hook = renderHook(() =>
      usePersistentState(nodeKey, '9', (value): value is string => typeof value === 'string')
    );
    const before = historyChangeCount();
    await act(async () => {
      const result = await openProject({
        id: rendered.id,
        desk: rendered.result.current,
        includeSettings: true,
      });
      expect(result.ok).toBe(true);
    });
    expect(isReloading()).toBe(true);
    expect(localStorage.getItem(nodeKey)).toBe('5');
    // The old page keeps running: a state write, a recorded change and a desk edit.
    act(() => hook.result.current[1]('stale'));
    recordChange({ key: nodeKey, previous: '"a"', next: '"b"' });
    act(() => rendered.result.current.addDataBlock(dataBlock('late')));
    await act(async () => {
      await rendered.result.current.flushDesk();
    });
    expect(localStorage.getItem(nodeKey)).toBe('5');
    expect(historyChangeCount()).toBe(before);
    // The reload reads the project's desk, not the stale one.
    expect((await loadDesk()).dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['then']);
  });

  it('keeps the marker on the opened project, clean, when the old page changes after the open', async () => {
    const user = userEvent.setup();
    let desk: ReturnType<typeof useDesk> | undefined;
    function Probe() {
      desk = useDesk();
      return null;
    }
    const reload = vi.fn();
    render(
      <DeskProvider>
        <Probe />
        <ProjectMenu reload={reload} />
      </DeskProvider>
    );
    await waitFor(() => expect(desk!.loading).toBe(false));
    act(() => desk!.addDataBlock(dataBlock('a')));
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    for (const name of ['A', 'B']) {
      const input = screen.getByRole('textbox', { name: 'Project name' });
      await user.clear(input);
      await user.type(input, name);
      await user.click(screen.getByRole('button', { name: 'Save project' }));
      await screen.findByText(`Saved “${name}”.`);
    }
    const projects = await listProjects();
    const a = projects.find((project) => project.name === 'A')!;
    const b = projects.find((project) => project.name === 'B')!;
    // Current is B; open A, then the old page changes before the reload lands.
    await user.click(await screen.findByRole('button', { name: 'Open project A' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    act(() => desk!.addDataBlock(dataBlock('late')));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(readCurrentProject()).toEqual({ id: a.id, name: 'A', dirty: false });
    expect(b.id).not.toBe(a.id);
  });

  it('clears the flag when the open fails', async () => {
    const rendered = await openSeeded();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await act(async () => {
      await openProject({ id: rendered.id, desk: rendered.result.current, includeSettings: true });
    });
    vi.restoreAllMocks();
    expect(isReloading()).toBe(false);
  });

  it('reports a distinct message when the desk in storage cannot be put back', async () => {
    const rendered = await openSeeded();
    const real = rendered.result.current;
    const desk: OpenableDesk = {
      dataBlocks: real.dataBlocks,
      loading: false,
      locked: false,
      replaceDesk: (dataBlocks, options) =>
        options?.restore
          ? Promise.resolve({ ok: false, error: 'Disk gone.' })
          : real.replaceDesk(dataBlocks, options),
    };
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key === nodeKey && value === '5') {
        throw new DOMException('full', 'QuotaExceededError');
      }
      return realSet.call(this, key, value);
    });
    let result: Awaited<ReturnType<typeof openProject>> | undefined;
    await act(async () => {
      result = await openProject({ id: rendered.id, desk, includeSettings: true });
    });
    vi.restoreAllMocks();
    expect(result && !result.ok && result.error).toMatch(/desk in storage could not be put back/);
    expect(result && !result.ok && result.error).toMatch(/Disk gone/);
    expect(isReloading()).toBe(false);
  });
});

describe('ProjectMenu', () => {
  function renderMenu(reload = vi.fn()) {
    let desk: ReturnType<typeof useDesk> | undefined;
    function Probe() {
      desk = useDesk();
      return null;
    }
    render(
      <DeskProvider>
        <Probe />
        <ProjectMenu reload={reload} />
      </DeskProvider>
    );
    return { desk: () => desk!, reload };
  }

  async function saveAs(user: ReturnType<typeof userEvent.setup>, name: string) {
    const input = screen.getByRole('textbox', { name: 'Project name' });
    await user.clear(input);
    await user.type(input, name);
    await user.click(screen.getByRole('button', { name: 'Save project' }));
    await screen.findByText(`Saved “${name}”.`);
  }

  it('saves, shows the current project, and opens without asking when nothing changed', async () => {
    const user = userEvent.setup();
    const { desk, reload } = renderMenu();
    await waitFor(() => expect(desk().loading).toBe(false));
    act(() => desk().addDataBlock(dataBlock('a')));
    localStorage.setItem(nodeKey, '5');
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await saveAs(user, 'Test A');
    expect(screen.getByText(/Current project: Test A$/)).toBeInTheDocument();
    expect(readCurrentProject()).toEqual({ id: expect.any(String), name: 'Test A', dirty: false });

    localStorage.setItem(nodeKey, '9');
    await user.click(await screen.findByRole('button', { name: 'Open project Test A' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(stopAll).toHaveBeenCalled();
    expect(localStorage.getItem(nodeKey)).toBe('5');
  });

  it.each([
    [true, '{"edo":12}'],
    [false, '{"edo":19}'],
  ])('with the developer option %s, opening leaves settings as %s', async (include, expected) => {
    const user = userEvent.setup();
    const { desk, reload } = renderMenu();
    await waitFor(() => expect(desk().loading).toBe(false));
    act(() => desk().addDataBlock(dataBlock('a')));
    localStorage.setItem(settingsKey, '{"edo":12}');
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await saveAs(user, 'S');
    localStorage.setItem(settingsKey, '{"edo":19}');
    localStorage.setItem(DEVELOPER_OPTIONS_KEY, JSON.stringify({ openIncludesSettings: include }));
    await user.click(await screen.findByRole('button', { name: 'Open project S' }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(localStorage.getItem(settingsKey)).toBe(expected);
  });

  it('a playback setting change marks the project unsaved', async () => {
    const user = userEvent.setup();
    let settings: ReturnType<typeof useCompositionSettings> | undefined;
    function Probe() {
      settings = useCompositionSettings();
      return null;
    }
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <Probe />
          <ProjectMenu reload={vi.fn()} />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await saveAs(user, 'P');
    expect(screen.queryByText(/unsaved changes\)/)).toBeNull();
    act(() => settings!.updateTransport({ metronome: true }));
    await screen.findByText(/unsaved changes\)/);
  });

  it('never captures the developer option in a project', async () => {
    localStorage.setItem(DEVELOPER_OPTIONS_KEY, '{"openIncludesSettings":false}');
    localStorage.setItem(nodeKey, '1');
    const captured = captureWorkbenchState();
    expect(Object.keys(captured)).not.toContain(DEVELOPER_OPTIONS_KEY);
  });

  it('opening while dirty prompts: Cancel changes nothing, Discard opens', async () => {
    const user = userEvent.setup();
    const { desk, reload } = renderMenu();
    await waitFor(() => expect(desk().loading).toBe(false));
    act(() => desk().addDataBlock(dataBlock('a')));
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await saveAs(user, 'Saved');
    act(() => desk().addDataBlock(dataBlock('later')));
    await screen.findByText(/unsaved changes\)/);

    await user.click(await screen.findByRole('button', { name: 'Open project Saved' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull()
    );
    expect(reload).not.toHaveBeenCalled();
    expect(desk().dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['a', 'later']);

    await user.click(await screen.findByRole('button', { name: 'Open project Saved' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', {
        name: 'Discard',
      })
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect((await loadDesk()).dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['a']);
  });

  it('Save first saves the current project, then opens the other one', async () => {
    const user = userEvent.setup();
    const { desk, reload } = renderMenu();
    await waitFor(() => expect(desk().loading).toBe(false));
    act(() => desk().addDataBlock(dataBlock('a')));
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await saveAs(user, 'First');
    act(() => desk().addDataBlock(dataBlock('b')));
    await saveAs(user, 'Second');
    act(() => desk().addDataBlock(dataBlock('c')));
    await screen.findByText(/unsaved changes\)/);

    await user.click(await screen.findByRole('button', { name: 'Open project First' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', {
        name: 'Save first',
      })
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    const projects = await listProjects();
    const second = projects.find((project) => project.name === 'Second')!;
    // The unsaved work went into the current project (Second) before First replaced the page.
    expect((await getProject(second.id))!.desk!.map((dataBlock) => dataBlock.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect((await loadDesk()).dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['a']);
  });

  it('shows why an open was refused and changes nothing', async () => {
    const user = userEvent.setup();
    const { desk, reload } = renderMenu();
    await waitFor(() => expect(desk().loading).toBe(false));
    act(() => desk().addDataBlock(dataBlock('a')));
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    await saveAs(user, 'P');
    act(() => desk().addDataBlock(dataBlock('b')));
    await screen.findByText(/unsaved changes\)/);
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await user.click(await screen.findByRole('button', { name: 'Open project P' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', {
        name: 'Discard',
      })
    );
    expect(await screen.findByText(/nothing was opened/)).toBeInTheDocument();
    vi.restoreAllMocks();
    expect(reload).not.toHaveBeenCalled();
    expect(desk().dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['a', 'b']);
  });

  it('deletes only after confirmation', async () => {
    const user = userEvent.setup();
    await putProjects([
      { id: 'p-old', name: 'Old one', savedAt: '2026-11-01T00:00:00Z', entries: {}, desk: null },
    ]);
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Projects' }));
    expect(await screen.findByText(/no desk/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete project Old one' }));
    expect(await listProjects()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Delete project' }));
    await waitFor(async () => expect(await listProjects()).toHaveLength(0));
  });
});
