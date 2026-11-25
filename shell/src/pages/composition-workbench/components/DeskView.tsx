import { useState } from 'react';
import { Alert, Button, Group, Modal, Popover, Text, TextInput } from '@mantine/core';
import type { PerformancePlan } from '../audio/types';
import { useAuditionSettings } from '../auditionPreferences';
import { useCompositionSettings } from '../compositionSettings';
import { pitchClassConversionRefusal, type PacketBlock } from '../dataBlock';
import { EnsureDataBlockOps, useDataBlockOps, type OpResult } from '../dataBlockOps';
import { getConversion } from '../dataBlocks/acceptance';
import { auditionBlock, HEAR_AS_CONVERSION_IDS } from '../dataBlocks/audition';
import { dataBlockUsers, deleteImpact, unusedDeskBlocks } from '../dataBlocks/dataBlockRefs';
import { makeSourceRefusal, type AuditionSettings } from '../dataBlocks/registry';
import { useDesk } from '../desk';
import { transportRhythmContext } from '../rhythmRealization';
import { allUsersTable } from '../scene/sharedUsersTable';
import { layerSound } from '../sounds';
import { transportTimeline } from '../transport';
import { useNodePreview } from '../useNodePreview';
import { AuditionSettingsPopover, auditionControlsOf } from './AuditionSettingsPopover';
import { DataBlockMenu } from './DataBlockMenu';
import { DataBlockPreview } from './DataBlockPreview';
import { MakeSingleUserButton } from './MakeSingleUserButton';
import { NewDataBlockPopover } from './NewDataBlockPopover';
import { UsersTable } from './UsersTable';
import classes from './DeskView.module.css';

function describe(dataBlock: PacketBlock) {
  const { packet } = dataBlock.payload;
  const extent = packet.frame?.extent;
  const length =
    extent === undefined
      ? ''
      : ` · ${Number(extent.toFixed(3))} ${packet.frame?.unit === 'quarterNote' ? 'qn' : (packet.frame?.unit ?? '')}`;
  return `${packet.kind} | ${packet.domain} · ${packet.items.length}${length}`;
}

/**
 * A card's Play, its settings and, for Values, the explicit Hear as MIDI note numbers. The refusal
 * (`auditionBlock`'s reason) is the disabled Play's hover text; Hear as is the only way Values
 * play, and the stored block is unchanged.
 */
function PlayButtons({
  dataBlock,
  playing,
  settings,
  onPlay,
}: {
  dataBlock: PacketBlock;
  playing: boolean;
  settings: AuditionSettings;
  onPlay(hearAs?: string): void;
}) {
  const result = auditionBlock(dataBlock, settings);
  // Every Hear as conversion registered for this type, each its own button (R1: no type ids here).
  const hearAsList = HEAR_AS_CONVERSION_IDS.map((id) => getConversion(id)).filter(
    (conversion) => conversion?.from === dataBlock.typeId
  );
  return (
    <>
      <Button
        size="compact-xs"
        variant="default"
        // While playing, Stop is always available.
        disabled={!playing && !result.ok}
        data-info={result.ok ? 'Play this data-block.' : result.reason}
        onClick={() => onPlay()}
      >
        {playing ? '■ Stop' : '▶ Play'}
      </Button>
      {hearAsList.map((conversion) => {
        if (!conversion) {
          return null;
        }
        const refusal = auditionBlock(dataBlock, settings, conversion.id);
        return (
          <Button
            key={conversion.id}
            size="compact-xs"
            variant="default"
            disabled={!playing && !refusal.ok}
            data-info={refusal.ok ? conversion.describe : refusal.reason}
            onClick={() => onPlay(conversion.id)}
          >
            {conversion.label}
          </Button>
        );
      })}
      <AuditionSettingsPopover typeId={dataBlock.typeId} />
    </>
  );
}

interface DeskViewProps {
  onMakeSource?(dataBlock: PacketBlock): void;
  /** Double-clicking a card (not its fields or buttons) opens the data-block in the bottom panel. */
  onOpenDataBlock?(dataBlock: PacketBlock): void;
}

/**
 * The desk as a workspace view beside the node tree canvas: every data-block set aside, as a card. A card
 * can be heard, renamed or removed, and made into a source node on the canvas on request. Nothing
 * here reaches the node tree until the user asks (see ARCHITECTURE.md, "The desk").
 */
export function DeskView(props: DeskViewProps) {
  return (
    <EnsureDataBlockOps>
      <DeskViewBody {...props} />
    </EnsureDataBlockOps>
  );
}

function DeskViewBody({ onMakeSource, onOpenDataBlock }: DeskViewProps) {
  const {
    dataBlocks,
    loading,
    locked,
    persistError,
    renameDataBlock,
    setDataBlockNote,
    duplicateDataBlockById,
    convertToPitchClassById,
  } = useDesk();
  const ops = useDataBlockOps();
  const { settings } = useCompositionSettings();
  const [auditionSettings] = useAuditionSettings();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [onlyUnused, setOnlyUnused] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeIds, setPurgeIds] = useState<string[]>([]);
  const [usersOpenId, setUsersOpenId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<{ fromId: string; toId: string } | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [snapPrompt, setSnapPrompt] = useState<{ id: string; message: string } | null>(null);
  const project = ops.project;
  // Hidden-record rule (O0): the filter and Purge consider only the blocks this view displays
  // (packets); an unused record has no card, so it is never listed or purged here.
  const unusedIds = new Set(unusedDeskBlocks(project).map((block) => block.id));
  const shown = onlyUnused ? dataBlocks.filter((block) => unusedIds.has(block.id)) : dataBlocks;

  function report(result: OpResult) {
    setOpError(result.ok ? null : result.error);
  }

  // The desk's own action row: New data-block lives here so it is there when the desk is empty too.
  const toolbar = (
    <div className={classes.actions}>
      <NewDataBlockPopover onCreated={(dataBlock) => onOpenDataBlock?.(dataBlock)} />
      <Button
        size="compact-xs"
        variant={onlyUnused ? 'filled' : 'default'}
        aria-pressed={onlyUnused}
        data-info="Show only the data-blocks nothing uses. Nothing is removed by this."
        onClick={() => setOnlyUnused((current) => !current)}
      >
        Unused ({unusedIds.size})
      </Button>
      <Popover
        opened={purgeOpen}
        onChange={setPurgeOpen}
        position="bottom-start"
        withinPortal={false}
        transitionProps={{ duration: 0 }}
      >
        <Popover.Target>
          <Button
            size="compact-xs"
            variant="default"
            disabled={unusedIds.size === 0}
            data-info={
              unusedIds.size === 0
                ? 'Every data-block on the desk is used.'
                : 'List the unused data-blocks and delete them after you confirm. Nothing is ever purged automatically.'
            }
            onClick={() => {
              setPurgeIds([...unusedIds]);
              setPurgeOpen((current) => !current);
            }}
          >
            Purge unused
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Text size="xs" fw={600}>
            Delete these {purgeIds.length} unused data-blocks?
          </Text>
          <ul className={classes.impactList}>
            {purgeIds.map((id) => (
              <li key={id}>
                <Text size="xs">{dataBlocks.find((block) => block.id === id)?.name ?? id}</Text>
              </li>
            ))}
          </ul>
          <Button
            size="compact-xs"
            onClick={() => {
              report(ops.purge(purgeIds));
              setPurgeOpen(false);
            }}
          >
            Confirm purge
          </Button>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
  const preview = useNodePreview({
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

  async function audition(dataBlock: PacketBlock, hearAs?: string) {
    if (playingId === dataBlock.id) {
      preview.stop('');
      return;
    }
    // The listener's settings only reach the plan here; the stored block is never written.
    const loopable = auditionControlsOf(dataBlock.typeId).loop;
    const result = auditionBlock(
      dataBlock,
      { ...auditionSettings, loop: loopable && auditionSettings.loop },
      hearAs,
      // A rhythm's pulse and click sound come from the transport and the rhythm voice.
      {
        pulseUnit: transportRhythmContext(settings.transport).pulseUnit,
        rhythmSound: layerSound(settings.sounds.rhythm, 0),
      }
    );
    if (!result.ok) {
      preview.setStatus(result.reason);
      return;
    }
    try {
      // The plan carries the default timeline; the transport's tempo replaces it.
      const plan: PerformancePlan =
        result.plan.timebase.kind === 'musical'
          ? {
              ...result.plan,
              timebase: { kind: 'musical', timeline: transportTimeline(settings.transport) },
            }
          : result.plan;
      // A looping plan is exactly one cycle; the engine repeats it until Stop. `play` first stops
      // whatever was playing (which clears the playing id), so the id is set once sound has started.
      if (await preview.play(plan, result.label, { loop: loopable && auditionSettings.loop })) {
        setPlayingId(dataBlock.id);
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

  const replacement = replacing ? ops.remapPreview(replacing.fromId, replacing.toId) : null;
  const nameOf = (id: string, fallback: string) =>
    dataBlocks.find((block) => block.id === id)?.name ?? fallback;

  return (
    <div className={classes.desk}>
      {saveWarning}
      {toolbar}
      {shown.length === 0 && (
        <Text className={classes.empty} size="sm">
          Every data-block is used.
        </Text>
      )}
      <div className={classes.grid}>
        {shown.map((dataBlock) => {
          const users = dataBlockUsers(project, dataBlock.id);
          const impact = confirmingId === dataBlock.id ? deleteImpact(project, dataBlock.id) : null;
          return (
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
                <DataBlockPreview packet={dataBlock.payload.packet} />
              </div>
              <div className={classes.meta}>{describe(dataBlock)}</div>
              <div className={classes.usage}>
                {users.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    Not used
                  </Text>
                ) : (
                  <Popover
                    opened={usersOpenId === dataBlock.id}
                    onChange={(open) => setUsersOpenId(open ? dataBlock.id : null)}
                    position="bottom-start"
                    withinPortal={false}
                    transitionProps={{ duration: 0 }}
                  >
                    <Popover.Target>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        data-info="Where this data-block is used. Make single user gives one place its own copy."
                        onClick={() =>
                          setUsersOpenId((current) =>
                            current === dataBlock.id ? null : dataBlock.id
                          )
                        }
                      >
                        Used by {users.length}
                      </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                      <UsersTable
                        rows={allUsersTable(project, dataBlock.id)}
                        meter={settings.transport.meter}
                        action={(row) =>
                          row.entry && (
                            <MakeSingleUserButton
                              users={users.length}
                              who="this place"
                              onClick={() => {
                                if (row.entry) {
                                  report(ops.makeSingleUser(dataBlock.id, row.entry));
                                }
                                setUsersOpenId(null);
                              }}
                            />
                          )
                        }
                      />
                    </Popover.Dropdown>
                  </Popover>
                )}
              </div>
              <div className={classes.actions}>
                <PlayButtons
                  dataBlock={dataBlock}
                  playing={playingId === dataBlock.id}
                  settings={auditionSettings}
                  onPlay={(hearAs) => audition(dataBlock, hearAs)}
                />
                <Button
                  size="compact-xs"
                  variant="default"
                  disabled={!onMakeSource || makeSourceRefusal(dataBlock) !== null}
                  data-info={
                    makeSourceRefusal(dataBlock) ??
                    'Place this data-block on the canvas as a source node that other nodes can read.'
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
                <DataBlockMenu
                  spec={{ accepts: [dataBlock.typeId] }}
                  label="Replace everywhere with"
                  ariaLabel={`Replace ${dataBlock.name} everywhere with`}
                  info="Point every place that uses this data-block at another one of the same type."
                  exclude={[dataBlock.id]}
                  disabledReason={users.length === 0 ? 'Nothing uses this data-block.' : null}
                  onPick={(row) => setReplacing({ fromId: dataBlock.id, toId: row.block.id })}
                />
                <Popover
                  opened={confirmingId === dataBlock.id}
                  onChange={(open) => setConfirmingId(open ? dataBlock.id : null)}
                  position="bottom-start"
                  withinPortal={false}
                  transitionProps={{ duration: 0 }}
                >
                  <Popover.Target>
                    <Button
                      size="compact-xs"
                      variant="default"
                      data-info="Remove this data-block from the desk. Places that use it show it as missing."
                      onClick={() =>
                        setConfirmingId((current) =>
                          current === dataBlock.id ? null : dataBlock.id
                        )
                      }
                    >
                      Delete
                    </Button>
                  </Popover.Target>
                  <Popover.Dropdown>
                    {impact && (
                      <>
                        <Text size="xs" fw={600}>
                          Delete {dataBlock.name}?
                        </Text>
                        {impact.users.length > 0 ? (
                          <Text size="xs">
                            Used by {impact.users.length}:{' '}
                            {impact.users.map((user) => user.label).join(', ')}. They will show it
                            as missing or blank.
                          </Text>
                        ) : (
                          <Text size="xs">Nothing uses it.</Text>
                        )}
                        {impact.descendants.length > 0 && (
                          <Text size="xs">
                            Derived from it:{' '}
                            {impact.descendants.map((block) => block.name).join(', ')}. They are not
                            changed.
                          </Text>
                        )}
                        <Button
                          size="compact-xs"
                          mt="xs"
                          onClick={() => {
                            setConfirmingId(null);
                            report(ops.deleteBlock(dataBlock.id));
                          }}
                        >
                          Confirm delete
                        </Button>
                      </>
                    )}
                  </Popover.Dropdown>
                </Popover>
              </div>
            </div>
          );
        })}
      </div>
      <Modal
        opened={replacing !== null}
        onClose={() => setReplacing(null)}
        title="Replace everywhere"
        size="sm"
        transitionProps={{ duration: 0 }}
      >
        {replacing && replacement && (
          <>
            <Text size="sm">
              {replacement.refusal ??
                `Replace ${nameOf(replacing.fromId, 'it')} in ${replacement.count} ${replacement.count === 1 ? 'place' : 'places'} with ${nameOf(replacing.toId, 'the replacement')}?`}
            </Text>
            <Group justify="flex-end" mt="md" gap="xs">
              <Button size="compact-sm" variant="default" onClick={() => setReplacing(null)}>
                Cancel
              </Button>
              <Button
                size="compact-sm"
                disabled={replacement.refusal !== null}
                onClick={() => {
                  report(ops.remap(replacing.fromId, replacing.toId));
                  setReplacing(null);
                }}
              >
                Replace
              </Button>
            </Group>
          </>
        )}
      </Modal>
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
      {opError && (
        <Text className={classes.meta} mt="xs" role="alert">
          {opError}
        </Text>
      )}
      {preview.status && (
        <Text className={classes.meta} mt="xs">
          {preview.status}
        </Text>
      )}
    </div>
  );
}
