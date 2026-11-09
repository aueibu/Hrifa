import { render, screen, userEvent } from '@test-utils';
import type { AudioEngine } from './audio/types';
import { SnapshotMenu } from './components/SnapshotMenu';
import { STORAGE_KEY as settingsKey } from './compositionSettings';
import {
  captureWorkbenchState,
  createSnapshot,
  loadSnapshots,
  parseSnapshotFile,
  restoreWorkbenchState,
  snapshotFileText,
  snapshotStoreKey,
} from './snapshots';

const stopAll = vi.fn();
vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ stopAll }) as unknown as AudioEngine,
}));

const moduleKey = 'hrifa.composition-workbench.fractioning.a.v1';
const extraKey = 'hrifa.composition-workbench.interference.generators.v1.instance.x';

beforeEach(() => {
  localStorage.clear();
  stopAll.mockClear();
});

describe('snapshot storage', () => {
  it('captures only workbench entries', () => {
    localStorage.setItem(moduleKey, '5');
    localStorage.setItem('hrifa.other-page.v1', 'x');
    localStorage.setItem(snapshotStoreKey, '[]');
    expect(captureWorkbenchState()).toEqual({ [moduleKey]: '5' });
  });

  it('restores exactly the snapshot, removing entries added since', () => {
    localStorage.setItem(moduleKey, '5');
    const snapshot = createSnapshot('A');
    localStorage.setItem(moduleKey, '7');
    localStorage.setItem(extraKey, '[]');
    restoreWorkbenchState(snapshot.entries, { includeSettings: true });
    expect(localStorage.getItem(moduleKey)).toBe('5');
    expect(localStorage.getItem(extraKey)).toBeNull();
  });

  it('can keep the current transport and sounds', () => {
    localStorage.setItem(settingsKey, '{"edo":12}');
    localStorage.setItem(moduleKey, '5');
    const snapshot = createSnapshot('A');
    localStorage.setItem(settingsKey, '{"edo":19}');
    restoreWorkbenchState(snapshot.entries, { includeSettings: false });
    expect(localStorage.getItem(settingsKey)).toBe('{"edo":19}');
    restoreWorkbenchState(snapshot.entries, { includeSettings: true });
    expect(localStorage.getItem(settingsKey)).toBe('{"edo":12}');
  });

  it('names an unnamed snapshot after its time', () => {
    expect(createSnapshot('  ', localStorage, new Date(2026, 0, 2)).name).toMatch(/^Snapshot /);
  });

  it('round-trips through a file with fresh ids and only workbench keys', () => {
    const snapshot = {
      ...createSnapshot('A'),
      entries: { [moduleKey]: '5', 'evil.key': 'x' },
    };
    const [imported] = parseSnapshotFile(snapshotFileText([snapshot]));
    expect(imported.name).toBe('A');
    expect(imported.id).not.toBe(snapshot.id);
    expect(imported.entries).toEqual({ [moduleKey]: '5' });
  });

  it('rejects files that are not snapshot exports', () => {
    expect(() => parseSnapshotFile('nope')).toThrow(/not valid JSON/);
    expect(() => parseSnapshotFile('{"snapshots":[]}')).toThrow(/not a workbench snapshot/);
  });

  it('ignores a corrupt snapshot store', () => {
    localStorage.setItem(snapshotStoreKey, '{bad');
    expect(loadSnapshots()).toEqual([]);
  });
});

describe('SnapshotMenu', () => {
  it('saves the page, then restores it after confirmation and reloads', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    localStorage.setItem(moduleKey, '5');
    render(<SnapshotMenu reload={reload} />);
    await user.click(screen.getByRole('button', { name: 'Snapshots' }));
    await user.type(screen.getByRole('textbox', { name: 'Save the whole page as' }), 'Test A');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(loadSnapshots().map((snapshot) => snapshot.name)).toEqual(['Test A']);

    localStorage.setItem(moduleKey, '9');
    await user.click(screen.getByRole('button', { name: 'Load Test A' }));
    expect(reload).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Replace page' }));
    expect(stopAll).toHaveBeenCalled();
    expect(localStorage.getItem(moduleKey)).toBe('5');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('deletes only after confirmation', async () => {
    const user = userEvent.setup();
    render(<SnapshotMenu reload={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Snapshots' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const [snapshot] = loadSnapshots();
    await user.click(screen.getByRole('button', { name: `Delete ${snapshot.name}` }));
    expect(loadSnapshots()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(loadSnapshots()).toHaveLength(0);
  });
});
