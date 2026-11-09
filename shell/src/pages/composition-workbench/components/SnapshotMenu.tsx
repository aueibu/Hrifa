import { useState } from 'react';
import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Popover,
  ScrollArea,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import {
  createSnapshot,
  loadSnapshots,
  parseSnapshotFile,
  restoreWorkbenchState,
  snapshotFileText,
  storeSnapshots,
  type WorkbenchSnapshot,
} from '../snapshots';

function SnapshotIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function formatSavedAt(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Header menu for whole-page snapshots: save the current workbench under a name, restore one
 * (replacing the page and reloading), rename, delete, and export/import them as a JSON file.
 */
export function SnapshotMenu({ reload = () => window.location.reload() }: { reload?(): void }) {
  const engine = useAudioEngine();
  const [snapshots, setSnapshots] = useState<WorkbenchSnapshot[]>(() => loadSnapshots());
  const [name, setName] = useState('');
  const [includeSettings, setIncludeSettings] = useState(true);
  // Restoring and deleting can't be undone, so each asks once more on the same row.
  const [confirming, setConfirming] = useState<{ id: string; action: 'load' | 'delete' } | null>(
    null
  );
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [status, setStatus] = useState('');

  function persist(next: WorkbenchSnapshot[], message: string) {
    try {
      storeSnapshots(next);
      setSnapshots(next);
      setStatus(message);
      return true;
    } catch {
      setStatus('Browser storage is full. Export your snapshots to a file, then delete some.');
      return false;
    }
  }

  function save() {
    const snapshot = createSnapshot(name);
    if (persist([snapshot, ...snapshots], `Saved “${snapshot.name}”.`)) {
      setName('');
    }
  }

  function restore(snapshot: WorkbenchSnapshot) {
    engine.stopAll();
    restoreWorkbenchState(snapshot.entries, { includeSettings });
    reload();
  }

  function remove(snapshot: WorkbenchSnapshot) {
    persist(
      snapshots.filter((item) => item.id !== snapshot.id),
      `Deleted “${snapshot.name}”.`
    );
  }

  function commitRename() {
    if (!renaming) {
      return;
    }
    const trimmed = renaming.name.trim();
    if (trimmed) {
      persist(
        snapshots.map((item) => (item.id === renaming.id ? { ...item, name: trimmed } : item)),
        `Renamed to “${trimmed}”.`
      );
    }
    setRenaming(null);
  }

  async function importFile(file: File | null) {
    if (!file) {
      return;
    }
    try {
      const imported = parseSnapshotFile(await file.text());
      persist(
        [...imported, ...snapshots],
        `Imported ${imported.length} snapshot${imported.length === 1 ? '' : 's'}.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  return (
    <Popover
      position="bottom-end"
      withArrow
      shadow="md"
      width={340}
      onClose={() => {
        setConfirming(null);
        setRenaming(null);
      }}
    >
      <Popover.Target>
        <Tooltip label="Snapshots">
          <ActionIcon variant="default" size="lg" aria-label="Snapshots">
            <SnapshotIcon />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Snapshots
          </Text>
          <Group gap="xs" wrap="nowrap" align="end">
            <TextInput
              size="xs"
              style={{ flex: 1 }}
              label="Save the whole page as"
              placeholder="Snapshot name"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && save()}
            />
            <Button size="xs" onClick={save}>
              Save
            </Button>
          </Group>
          <Switch
            size="xs"
            label="Restore transport and sounds too"
            description="Off keeps your current tempo, metronome, and voices."
            checked={includeSettings}
            onChange={(event) => setIncludeSettings(event.currentTarget.checked)}
          />
          {snapshots.length === 0 ? (
            <Text size="xs" c="dimmed">
              No snapshots yet.
            </Text>
          ) : (
            <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
              <Stack gap={6}>
                {snapshots.map((snapshot) => {
                  const asking = confirming?.id === snapshot.id ? confirming.action : null;
                  return (
                    <div key={snapshot.id}>
                      {renaming?.id === snapshot.id ? (
                        <TextInput
                          size="xs"
                          aria-label={`Rename ${snapshot.name}`}
                          value={renaming.name}
                          autoFocus
                          onChange={(event) =>
                            setRenaming({ id: snapshot.id, name: event.currentTarget.value })
                          }
                          onBlur={commitRename}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              commitRename();
                            } else if (event.key === 'Escape') {
                              setRenaming(null);
                            }
                          }}
                        />
                      ) : (
                        <Text size="sm" truncate title={snapshot.name}>
                          {snapshot.name}
                        </Text>
                      )}
                      <Group gap={4} justify="space-between" wrap="nowrap">
                        <Text size="xs" c="dimmed" truncate>
                          {formatSavedAt(snapshot.savedAt)}
                        </Text>
                        {asking ? (
                          <Group gap={4} wrap="nowrap">
                            <Button
                              size="compact-xs"
                              color={asking === 'delete' ? 'red' : undefined}
                              onClick={() =>
                                asking === 'load' ? restore(snapshot) : remove(snapshot)
                              }
                            >
                              {asking === 'load' ? 'Replace page' : 'Delete'}
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="default"
                              onClick={() => setConfirming(null)}
                            >
                              Cancel
                            </Button>
                          </Group>
                        ) : (
                          <Group gap={4} wrap="nowrap">
                            <Button
                              size="compact-xs"
                              variant="light"
                              aria-label={`Load ${snapshot.name}`}
                              onClick={() => setConfirming({ id: snapshot.id, action: 'load' })}
                            >
                              Load
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              aria-label={`Rename ${snapshot.name}`}
                              onClick={() => setRenaming({ id: snapshot.id, name: snapshot.name })}
                            >
                              Rename
                            </Button>
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              aria-label={`Delete ${snapshot.name}`}
                              onClick={() => setConfirming({ id: snapshot.id, action: 'delete' })}
                            >
                              Delete
                            </Button>
                          </Group>
                        )}
                      </Group>
                    </div>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>
          )}
          <Group gap="xs" justify="space-between">
            <Button
              size="compact-xs"
              variant="default"
              disabled={!snapshots.length}
              onClick={() =>
                downloadText(
                  `workbench-snapshots-${new Date().toISOString().slice(0, 10)}.json`,
                  snapshotFileText(snapshots)
                )
              }
            >
              Export to file
            </Button>
            <FileButton accept="application/json,.json" onChange={importFile}>
              {(props) => (
                <Button size="compact-xs" variant="default" {...props}>
                  Import file
                </Button>
              )}
            </FileButton>
          </Group>
          {status && (
            <Text size="xs" c="dimmed" aria-live="polite">
              {status}
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
