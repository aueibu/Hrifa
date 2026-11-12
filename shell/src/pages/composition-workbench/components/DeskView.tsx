import { useState } from 'react';
import { Alert, Button, Group, Modal, Text, TextInput } from '@mantine/core';
import { createNotePacketPerformancePlan } from '../audio/performancePlans';
import { useCompositionSettings } from '../compositionSettings';
import { useDesk } from '../desk';
import type { NoteEventValue } from '../melodicization';
import type { DataPacket } from '../model';
import { pitchClassConversionRefusal, type Snippet } from '../snippet';
import { transportTimeline } from '../transport';
import { useModulePreview } from '../useModulePreview';
import { SnippetPreview } from './SnippetPreview';
import classes from './DeskView.module.css';

/** The kind of snippet the desk can play today. Other kinds are stored and routed, not auditioned. */
function isNoteSnippet(snippet: Snippet) {
  return snippet.packet.kind === 'events' && snippet.packet.domain === 'note';
}

function describe(snippet: Snippet) {
  const { packet } = snippet;
  const extent = packet.frame?.extent;
  const length =
    extent === undefined
      ? ''
      : ` · ${Number(extent.toFixed(3))} ${packet.frame?.unit === 'quarterNote' ? 'qn' : (packet.frame?.unit ?? '')}`;
  return `${packet.kind} | ${packet.domain} · ${packet.items.length}${length}`;
}

/**
 * The desk as a workspace view beside the patch canvas: every snippet set aside, as a card. A card
 * can be heard, renamed or removed, and made into a source module on the canvas on request. Nothing
 * here reaches the patch until the user asks (see ARCHITECTURE.md, "The desk").
 */
export function DeskView({ onMakeSource }: { onMakeSource?(snippet: Snippet): void }) {
  const {
    snippets,
    loading,
    locked,
    persistError,
    removeSnippet,
    renameSnippet,
    setSnippetNote,
    duplicateSnippetById,
    convertToPitchClassById,
  } = useDesk();
  const { settings } = useCompositionSettings();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [snapPrompt, setSnapPrompt] = useState<{ id: string; message: string } | null>(null);
  const preview = useModulePreview({
    instanceId: 'desk',
    volume: 30,
    // On the transport like every other preview, so the metronome and count-in apply.
    followTransport: true,
    transportPlay: () => undefined,
    onEnd: () => setPlayingId(null),
  });

  function toPitchClasses(id: string, snap = false) {
    const result = convertToPitchClassById(id, { edo: settings.edo, snap });
    if (result.ok) {
      preview.setStatus('');
    } else if (result.needsSnap) {
      setSnapPrompt({ id, message: result.message });
    } else {
      preview.setStatus(result.error);
    }
  }

  async function audition(snippet: Snippet) {
    if (playingId === snippet.id) {
      preview.stop('');
      return;
    }
    try {
      const plan = createNotePacketPerformancePlan({
        sourceId: 'desk',
        packet: snippet.packet as DataPacket<NoteEventValue>,
        timeline: transportTimeline(settings.transport),
      });
      setPlayingId(snippet.id);
      if (!(await preview.play(plan, `Auditioning ${snippet.name}.`))) {
        setPlayingId(null);
      }
    } catch (error) {
      setPlayingId(null);
      preview.setStatus(error instanceof Error ? error.message : 'Audition could not start.');
    }
  }

  if (loading) {
    return (
      <div className={classes.desk}>
        <Text className={classes.empty} size="sm" role="status">
          Loading the desk…
        </Text>
      </div>
    );
  }

  // A failed save is never silent: the clips on screen may not be what a reload will bring back.
  const saveWarning = persistError !== null && (
    <Alert
      color="yellow"
      p="xs"
      mb="xs"
      role="alert"
      icon={<span aria-hidden>⚠</span>}
      title="Desk changes could not be saved."
    >
      <Text size="xs">{persistError}</Text>
      {locked && <Text size="xs">Changes to the desk are turned off until it can be read.</Text>}
    </Alert>
  );

  if (snippets.length === 0) {
    return (
      <div className={classes.desk}>
        {saveWarning}
        <Text className={classes.empty} size="sm">
          Nothing on the desk yet. Select notes in a piano roll and choose Send to desk (D).
        </Text>
      </div>
    );
  }

  return (
    <div className={classes.desk}>
      {saveWarning}
      <div className={classes.grid}>
        {snippets.map((snippet) => (
          <div key={snippet.id} className={classes.card}>
            <TextInput
              size="xs"
              variant="unstyled"
              aria-label="Snippet name"
              classNames={{ input: classes.name }}
              defaultValue={snippet.name}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (name && name !== snippet.name) {
                  renameSnippet(snippet.id, name);
                } else {
                  event.currentTarget.value = snippet.name;
                }
              }}
            />
            <TextInput
              size="xs"
              variant="unstyled"
              aria-label="Snippet note"
              placeholder="Add a note"
              classNames={{ input: classes.noteInput }}
              // Keyed on the stored note so an external change shows up in the uncontrolled input.
              key={`note-${snippet.id}-${snippet.note ?? ''}`}
              defaultValue={snippet.note ?? ''}
              onBlur={(event) => {
                const note = event.currentTarget.value.trim();
                if (note !== (snippet.note ?? '')) {
                  setSnippetNote(snippet.id, note);
                }
              }}
            />
            <div className={classes.screen}>
              <SnippetPreview packet={snippet.packet} />
            </div>
            <div className={classes.meta}>{describe(snippet)}</div>
            <div className={classes.actions}>
              <Button
                size="compact-xs"
                variant="default"
                disabled={!isNoteSnippet(snippet)}
                data-info={
                  isNoteSnippet(snippet)
                    ? 'Play this snippet.'
                    : 'Only note snippets can be auditioned from the desk so far.'
                }
                onClick={() => audition(snippet)}
              >
                {playingId === snippet.id ? '■ Stop' : '▶ Audition'}
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                disabled={!onMakeSource}
                data-info="Place this snippet on the canvas as a source module that other modules can read."
                onClick={() => onMakeSource?.(snippet)}
              >
                Make source
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                data-info="Add a copy of this snippet to the desk, named as a variation, to change without losing the original."
                onClick={() => duplicateSnippetById(snippet.id)}
              >
                Duplicate
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                disabled={pitchClassConversionRefusal(snippet) !== null}
                data-info={
                  pitchClassConversionRefusal(snippet) ??
                  `Add a copy of this snippet to the desk with each pitch reduced to its pitch class in the project's ${settings.edo}-EDO (0 to ${settings.edo - 1}), keeping the timing. Pitches off the grid ask before snapping.`
                }
                onClick={() => toPitchClasses(snippet.id)}
              >
                To pitch classes
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                data-info="Remove this snippet from the desk. Modules made from it show a missing source."
                onClick={() => {
                  if (confirmingId === snippet.id) {
                    setConfirmingId(null);
                    removeSnippet(snippet.id);
                  } else {
                    setConfirmingId(snippet.id);
                  }
                }}
                onBlur={() =>
                  setConfirmingId((current) => (current === snippet.id ? null : current))
                }
              >
                {confirmingId === snippet.id ? 'Confirm delete' : 'Delete'}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Modal
        opened={snapPrompt !== null}
        onClose={() => setSnapPrompt(null)}
        title="Pitches off the grid"
        size="sm"
        transitionProps={{ duration: 0 }}
      >
        <Text size="sm">{snapPrompt?.message}</Text>
        <Group justify="flex-end" mt="md" gap="xs">
          <Button size="compact-sm" variant="default" onClick={() => setSnapPrompt(null)}>
            Cancel
          </Button>
          <Button
            size="compact-sm"
            onClick={() => {
              if (snapPrompt) {
                toPitchClasses(snapPrompt.id, true);
              }
              setSnapPrompt(null);
            }}
          >
            Snap
          </Button>
        </Group>
      </Modal>
      {preview.status && (
        <Text className={classes.meta} mt="xs">
          {preview.status}
        </Text>
      )}
    </div>
  );
}
