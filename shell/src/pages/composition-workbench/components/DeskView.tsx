import { useState } from 'react';
import { Alert, Button, Group, Modal, Text, TextInput } from '@mantine/core';
import { createNotePacketPerformancePlan } from '../audio/performancePlans';
import { useCompositionSettings } from '../compositionSettings';
import { pitchClassConversionRefusal, type DataBlock } from '../dataBlock';
import { auditionRefusal, makeSourceRefusal } from '../dataBlockTypes';
import { useDesk } from '../desk';
import type { NoteEventValue } from '../melodicization';
import type { DataPacket } from '../model';
import { transportTimeline } from '../transport';
import { useModulePreview } from '../useModulePreview';
import { DataBlockPreview } from './DataBlockPreview';
import { NewDataBlockPopover } from './NewDataBlockPopover';
import classes from './DeskView.module.css';

function describe(dataBlock: DataBlock) {
  const { packet } = dataBlock;
  const extent = packet.frame?.extent;
  const length =
    extent === undefined
      ? ''
      : ` · ${Number(extent.toFixed(3))} ${packet.frame?.unit === 'quarterNote' ? 'qn' : (packet.frame?.unit ?? '')}`;
  return `${packet.kind} | ${packet.domain} · ${packet.items.length}${length}`;
}

/**
 * The desk as a workspace view beside the patch canvas: every data-block set aside, as a card. A card
 * can be heard, renamed or removed, and made into a source module on the canvas on request. Nothing
 * here reaches the patch until the user asks (see ARCHITECTURE.md, "The desk").
 */
export function DeskView({
  onMakeSource,
  onOpenDataBlock,
}: {
  onMakeSource?(dataBlock: DataBlock): void;
  /** Double-clicking a card (not its fields or buttons) opens the data-block in the bottom panel. */
  onOpenDataBlock?(dataBlock: DataBlock): void;
}) {
  const {
    dataBlocks,
    loading,
    locked,
    persistError,
    removeDataBlock,
    renameDataBlock,
    setDataBlockNote,
    duplicateDataBlockById,
    convertToPitchClassById,
  } = useDesk();
  const { settings } = useCompositionSettings();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [snapPrompt, setSnapPrompt] = useState<{ id: string; message: string } | null>(null);
  // The desk's own action row: New data-block lives here so it is there when the desk is empty too.
  const toolbar = (
    <div className={classes.actions}>
      <NewDataBlockPopover onCreated={(dataBlock) => onOpenDataBlock?.(dataBlock)} />
    </div>
  );
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

  async function audition(dataBlock: DataBlock) {
    if (playingId === dataBlock.id) {
      preview.stop('');
      return;
    }
    try {
      const plan = createNotePacketPerformancePlan({
        sourceId: 'desk',
        packet: dataBlock.packet as DataPacket<NoteEventValue>,
        timeline: transportTimeline(settings.transport),
      });
      setPlayingId(dataBlock.id);
      if (!(await preview.play(plan, `Auditioning ${dataBlock.name}.`))) {
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
        {toolbar}
        <Text className={classes.empty} size="sm" role="status">
          Loading the desk…
        </Text>
      </div>
    );
  }

  // A failed save is never silent: the data-blocks on screen may not be what a reload will bring back.
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

  if (dataBlocks.length === 0) {
    return (
      <div className={classes.desk}>
        {saveWarning}
        {toolbar}
        <Text className={classes.empty} size="sm">
          Nothing on the desk yet. Select notes in a piano roll and choose Send to desk (D).
        </Text>
      </div>
    );
  }

  return (
    <div className={classes.desk}>
      {saveWarning}
      {toolbar}
      <div className={classes.grid}>
        {dataBlocks.map((dataBlock) => (
          <div
            key={dataBlock.id}
            className={classes.card}
            onDoubleClick={(event) => {
              if (!(event.target as Element).closest('input, button, textarea')) {
                onOpenDataBlock?.(dataBlock);
              }
            }}
          >
            <TextInput
              size="xs"
              variant="unstyled"
              aria-label="Data-block name"
              classNames={{ input: classes.name }}
              defaultValue={dataBlock.name}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (name && name !== dataBlock.name) {
                  renameDataBlock(dataBlock.id, name);
                } else {
                  event.currentTarget.value = dataBlock.name;
                }
              }}
            />
            <TextInput
              size="xs"
              variant="unstyled"
              aria-label="Data-block note"
              placeholder="Add a note"
              classNames={{ input: classes.noteInput }}
              // Keyed on the stored note so an external change shows up in the uncontrolled input.
              key={`note-${dataBlock.id}-${dataBlock.note ?? ''}`}
              defaultValue={dataBlock.note ?? ''}
              onBlur={(event) => {
                const note = event.currentTarget.value.trim();
                if (note !== (dataBlock.note ?? '')) {
                  setDataBlockNote(dataBlock.id, note);
                }
              }}
            />
            <div className={classes.screen}>
              <DataBlockPreview packet={dataBlock.packet} />
            </div>
            <div className={classes.meta}>{describe(dataBlock)}</div>
            <div className={classes.actions}>
              <Button
                size="compact-xs"
                variant="default"
                disabled={auditionRefusal(dataBlock) !== null}
                data-info={auditionRefusal(dataBlock) ?? 'Play this data-block.'}
                onClick={() => audition(dataBlock)}
              >
                {playingId === dataBlock.id ? '■ Stop' : '▶ Audition'}
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                disabled={!onMakeSource || makeSourceRefusal(dataBlock) !== null}
                data-info={
                  makeSourceRefusal(dataBlock) ??
                  'Place this data-block on the canvas as a source module that other modules can read.'
                }
                onClick={() => onMakeSource?.(dataBlock)}
              >
                Make source
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                data-info="Add a copy of this data-block to the desk, named as a variation, to change without losing the original."
                onClick={() => duplicateDataBlockById(dataBlock.id)}
              >
                Duplicate
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                disabled={pitchClassConversionRefusal(dataBlock) !== null}
                data-info={
                  pitchClassConversionRefusal(dataBlock) ??
                  `Add a copy of this data-block to the desk with each pitch reduced to its pitch class in the project's ${settings.edo}-EDO (0 to ${settings.edo - 1}), keeping the timing. Pitches off the grid ask before snapping.`
                }
                onClick={() => toPitchClasses(dataBlock.id)}
              >
                To pitch classes
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                data-info="Remove this data-block from the desk. Modules made from it show a missing source."
                onClick={() => {
                  if (confirmingId === dataBlock.id) {
                    setConfirmingId(null);
                    removeDataBlock(dataBlock.id);
                  } else {
                    setConfirmingId(dataBlock.id);
                  }
                }}
                onBlur={() =>
                  setConfirmingId((current) => (current === dataBlock.id ? null : current))
                }
              >
                {confirmingId === dataBlock.id ? 'Confirm delete' : 'Delete'}
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
