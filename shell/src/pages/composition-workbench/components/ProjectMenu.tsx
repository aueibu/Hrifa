import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  FileButton,
  Group,
  Modal,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useAudioEngine } from '../audio/AudioEngineProvider';
import { useOptionalDesk } from '../desk';
import {
  deleteProject,
  getProject,
  listProjects,
  putProjects,
  renameProject,
  type ProjectRecord,
  type StoredProject,
} from '../deskStore';
import { readDeveloperOptions } from '../developerOptions';
import { historyChangeCount, useHistoryChangeCount } from '../history';
import {
  openProject,
  parseProjectFile,
  projectFileText,
  readCurrentProject,
  saveProject,
  writeCurrentProject,
  type CurrentProject,
} from '../projects';
import { isReloading, setReloading } from '../reloading';

function ProjectIcon() {
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

/** How long after asking for a reload the page waits before saying the reload did not land. */
const RELOAD_STALL_MS = 4000;

const UNTITLED: CurrentProject = { id: '', name: '', dirty: false };

/**
 * Header menu for saved projects: save the whole workbench (every setting and the desk with its
 * version history) under a name, open one (replacing everything, then reloading), rename, delete,
 * and export/import them as a JSON file. It tracks the current project and whether anything has
 * changed since it was saved or opened, and asks before an open would throw that work away.
 */
export function ProjectMenu({ reload = () => window.location.reload() }: { reload?(): void }) {
  const engine = useAudioEngine();
  const desk = useOptionalDesk();
  const [projects, setProjects] = useState<StoredProject[] | null>(null);
  const [current, setCurrentState] = useState<CurrentProject>(
    () => readCurrentProject() ?? UNTITLED
  );
  const currentRef = useRef(current);
  const [name, setName] = useState('');
  // Deleting can't be undone, so it asks once more on the same row.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  // The project the human asked to open while there were unsaved changes.
  const [asking, setAsking] = useState<StoredProject | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusyState] = useState(false);
  // Read by handlers that may run before the next render (Enter in the name field).
  const busyRef = useRef(false);
  function setBusy(value: boolean) {
    busyRef.current = value;
    setBusyState(value);
  }
  const [status, setStatus] = useState('');
  // Saving or opening while the desk is still loading would capture or touch an empty desk.
  const deskBusy = Boolean(desk?.loading);

  function setCurrent(next: CurrentProject) {
    // An open is under way: the marker already names the opened project and must stay as written.
    if (isReloading()) {
      return;
    }
    currentRef.current = next;
    setCurrentState(next);
    writeCurrentProject(next.id || next.dirty ? next : null);
  }

  // Any recorded change since the last save or open makes the workbench dirty. The count at mount
  // is the baseline, so a persisted flag from before a reload survives and a fresh load starts clean.
  const changes = useHistoryChangeCount();
  const baseline = useRef(changes);
  useEffect(() => {
    if (changes === baseline.current || isReloading()) {
      return;
    }
    baseline.current = changes;
    if (!currentRef.current.dirty) {
      setCurrent({ ...currentRef.current, dirty: true });
    }
  }, [changes]);

  async function refresh() {
    try {
      setProjects(await listProjects());
    } catch {
      setProjects((existing) => existing ?? []);
      setStatus('Saved projects could not be read.');
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  /** Saves the workbench; true when it is stored. */
  async function save(): Promise<boolean> {
    if (deskBusy || busyRef.current) {
      return false;
    }
    setBusy(true);
    try {
      return await saveNow();
    } finally {
      setBusy(false);
    }
  }

  async function saveNow(): Promise<boolean> {
    // The count before anything is captured: a change that lands while saving is not in the project,
    // so it must still count as unsaved.
    const changesAtCapture = historyChangeCount();
    // Never capture a desk that has not loaded or could not be read: it would look empty.
    const deskReady = desk && !desk.loading && !desk.locked;
    const existing = currentRef.current.id ? currentRef.current : null;
    const result = await saveProject({
      name,
      existing,
      desk: deskReady ? desk.snippets : null,
    });
    if (!result.ok) {
      setStatus(result.error);
      return false;
    }
    baseline.current = changesAtCapture;
    setCurrent({
      id: result.project.id,
      name: result.project.name,
      // A change recorded while the save ran is not in the project.
      dirty: historyChangeCount() !== changesAtCapture,
    });
    setName('');
    await refresh();
    setStatus(`Saved “${result.project.name}”.`);
    return true;
  }

  async function open(project: StoredProject) {
    if (busyRef.current) {
      return;
    }
    setBusy(true);
    try {
      let result: Awaited<ReturnType<typeof openProject>>;
      try {
        result = await openProject({
          id: project.id,
          desk,
          // Read when opening, so the Developer menu's current choice always applies.
          includeSettings: readDeveloperOptions().openIncludesSettings,
        });
      } catch (error) {
        // openProject reports failures as results; this is a safety net so the page never stays
        // frozen by a stray reloading flag.
        setReloading(false);
        setStatus(
          `Nothing was opened: ${error instanceof Error ? error.message : 'unexpected error'}.`
        );
        return;
      }
      if (!result.ok) {
        setStatus(result.error);
        return;
      }
      // The old page keeps running until the reload lands; it must not mark anything dirty or write
      // storage meanwhile (isReloading), and its marker already names the opened project.
      const opened = { id: result.project.id, name: result.project.name, dirty: false };
      currentRef.current = opened;
      writeCurrentProject(opened);
      reload();
      try {
        engine.stopAll();
      } catch {
        // Stopping sound must never keep the reload from landing.
      }
      // If the page is somehow still here, nothing on it saves any more: say so.
      window.setTimeout(() => {
        setStatus(`“${opened.name}” is stored. Reload the page to finish opening it.`);
      }, RELOAD_STALL_MS);
    } finally {
      setBusy(false);
    }
  }

  function requestOpen(project: StoredProject) {
    if (currentRef.current.dirty) {
      setAsking(project);
    } else {
      void open(project);
    }
  }

  async function saveThenOpen(project: StoredProject) {
    setAsking(null);
    if (await save()) {
      await open(project);
    }
  }

  async function remove(project: StoredProject) {
    try {
      await deleteProject(project.id);
    } catch {
      setStatus('The project could not be deleted.');
      return;
    }
    if (currentRef.current.id === project.id) {
      setCurrent({ ...UNTITLED, dirty: currentRef.current.dirty });
    }
    setStatus(`Deleted “${project.name}”.`);
    await refresh();
  }

  async function commitRename() {
    if (!renaming) {
      return;
    }
    const target = renaming;
    setRenaming(null);
    const trimmed = target.name.trim();
    if (!trimmed) {
      return;
    }
    try {
      await renameProject(target.id, trimmed);
    } catch {
      setStatus('The project could not be renamed.');
      return;
    }
    if (currentRef.current.id === target.id) {
      setCurrent({ ...currentRef.current, name: trimmed });
    }
    setStatus(`Renamed to “${trimmed}”.`);
    await refresh();
  }

  async function exportFile() {
    try {
      const full = await Promise.all((projects ?? []).map((project) => getProject(project.id)));
      downloadText(
        `workbench-projects-${new Date().toISOString().slice(0, 10)}.json`,
        projectFileText(full.filter((project): project is ProjectRecord => project !== null))
      );
    } catch {
      setStatus('The projects could not be exported.');
    }
  }

  async function importFile(file: File | null) {
    if (!file) {
      return;
    }
    try {
      const imported = parseProjectFile(await file.text());
      await putProjects(imported);
      setStatus(`Imported ${imported.length} project${imported.length === 1 ? '' : 's'}.`);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed.');
    }
  }

  const currentName = current.id ? current.name : 'Untitled';

  return (
    <>
      <Popover
        position="bottom-end"
        withArrow
        shadow="md"
        width={340}
        opened={menuOpen}
        onChange={setMenuOpen}
        // The unsaved-changes dialog is outside the menu; clicking it must not close the menu.
        closeOnClickOutside={asking === null}
        closeOnEscape={asking === null}
        onClose={() => {
          setConfirmingDelete(null);
          setRenaming(null);
        }}
      >
        <Popover.Target>
          <Tooltip label="Projects">
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Projects"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <ProjectIcon />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm">
            <div>
              <Text fw={600} size="sm">
                Projects
              </Text>
              <Text size="xs" c="dimmed" truncate title={currentName}>
                Current project: {currentName}
                {current.dirty ? ' (unsaved changes)' : ''}
              </Text>
            </div>
            <Group gap="xs" wrap="nowrap" align="end">
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                label="Project name"
                placeholder={current.id ? current.name : 'Project name'}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                onKeyDown={(event) => event.key === 'Enter' && !busy && void save()}
              />
              <Button size="xs" disabled={deskBusy || busy} onClick={() => void save()}>
                Save project
              </Button>
            </Group>
            {projects === null ? (
              <Text size="xs" c="dimmed">
                Loading projects…
              </Text>
            ) : projects.length === 0 ? (
              <Text size="xs" c="dimmed">
                No projects yet.
              </Text>
            ) : (
              <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
                <Stack gap={6}>
                  {projects.map((project) => {
                    const deleting = confirmingDelete === project.id;
                    return (
                      <div key={project.id}>
                        {renaming?.id === project.id ? (
                          <TextInput
                            size="xs"
                            aria-label={`Rename ${project.name}`}
                            value={renaming.name}
                            autoFocus
                            onChange={(event) =>
                              setRenaming({ id: project.id, name: event.currentTarget.value })
                            }
                            onBlur={() => void commitRename()}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                void commitRename();
                              } else if (event.key === 'Escape') {
                                setRenaming(null);
                              }
                            }}
                          />
                        ) : (
                          <Text size="sm" truncate title={project.name}>
                            {project.name}
                            {project.id === current.id ? ' (current)' : ''}
                          </Text>
                        )}
                        <Group gap={4} justify="space-between" wrap="nowrap">
                          <Text size="xs" c="dimmed" truncate>
                            {formatSavedAt(project.savedAt)}
                            {project.hasDesk ? '' : ' · no desk'}
                          </Text>
                          {deleting ? (
                            <Group gap={4} wrap="nowrap">
                              <Button
                                size="compact-xs"
                                color="red"
                                onClick={() => {
                                  setConfirmingDelete(null);
                                  void remove(project);
                                }}
                              >
                                Delete project
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="default"
                                onClick={() => setConfirmingDelete(null)}
                              >
                                Cancel
                              </Button>
                            </Group>
                          ) : (
                            <Group gap={4} wrap="nowrap">
                              <Button
                                size="compact-xs"
                                variant="light"
                                aria-label={`Open project ${project.name}`}
                                disabled={deskBusy || busy}
                                onClick={() => requestOpen(project)}
                              >
                                Open
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                aria-label={`Rename ${project.name}`}
                                onClick={() => setRenaming({ id: project.id, name: project.name })}
                              >
                                Rename
                              </Button>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                aria-label={`Delete project ${project.name}`}
                                onClick={() => setConfirmingDelete(project.id)}
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
                disabled={!projects?.length}
                onClick={() => void exportFile()}
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
      <Modal
        opened={asking !== null}
        onClose={() => setAsking(null)}
        title="Unsaved changes"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            {current.id ? `“${current.name}”` : 'The workbench'} has changes that are not saved.
            Opening “{asking?.name}” replaces everything on the page, the desk included.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button
              variant="default"
              color="red"
              onClick={() => {
                const project = asking;
                setAsking(null);
                if (project) {
                  void open(project);
                }
              }}
            >
              Discard
            </Button>
            <Button onClick={() => asking && void saveThenOpen(asking)}>Save first</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
