import { useState, type ReactNode } from 'react';
import { Button, Popover, TextInput } from '@mantine/core';
import { useCompositionSettings } from '../compositionSettings';
import type { PacketBlock } from '../dataBlock';
import { useDataBlockOps } from '../dataBlockOps';
import { useDataBlockDefaults } from '../dataBlockPreferences';
import type { InputSpec } from '../dataBlocks/acceptance';
import { dataBlockMenuModel, FAMILY_MARK, type MenuRow } from '../dataBlocks/dataBlockMenuModel';
import { dataBlockUserCount } from '../dataBlocks/dataBlockRefs';
import { dataBlockTypes, isPacketBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { barsLength } from '../dataBlockTypes';
import { useDesk } from '../desk';
import { DataBlockPreview } from './DataBlockPreview';
import classes from './DataBlockMenu.module.css';

export interface DataBlockMenuProps {
  /** What the control takes: exact types first, then the conversions it allows as "Reinterpret as". */
  spec: InputSpec;
  /** The trigger button's text. */
  label: ReactNode;
  ariaLabel: string;
  /** Hover text of the trigger. */
  info?: string;
  /** The row marked as current. */
  selectedId?: string | null;
  /** A row was picked (the menu has closed). A reinterpret row carries its conversion. */
  onPick(row: MenuRow): void;
  /**
   * Adds the "New data-block" row (only types with an editor start blank, the desk's existing flow).
   * Absent: the select-only variant.
   */
  onNew?(dataBlock: PacketBlock): void;
  /** Ids left out of the list. */
  exclude?: readonly string[];
  /** Per-row refusal (shown as the row's hover text, the row disabled). */
  refuse?(block: StoredDataBlock): string | null;
  disabledReason?: string | null;
  size?: 'compact-xs' | 'compact-sm';
}

/**
 * The shared data-block menu (B2, W-65): a popover listing desk data-blocks with the type's mark,
 * name, user count and a thumbnail, a search field, filtered by an `InputSpec` through `pickerFor`.
 * Its size is fixed. The pure list logic is dataBlockMenuModel.ts.
 */
export function DataBlockMenu({
  spec,
  label,
  ariaLabel,
  info,
  selectedId,
  onPick,
  onNew,
  exclude,
  refuse,
  disabledReason,
  size = 'compact-xs',
}: DataBlockMenuProps) {
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const { dataBlocks } = useDesk();
  const { project } = useDataBlockOps();
  const model = dataBlockMenuModel({
    spec,
    blocks: dataBlocks,
    query,
    usersOf: (id) => dataBlockUserCount(project, id),
    refuse,
    exclude,
  });

  function close() {
    setOpened(false);
    setQuery('');
  }

  function renderRow(row: MenuRow) {
    const mark = FAMILY_MARK[row.family];
    const key = `${row.block.id}:${row.conversion?.id ?? ''}`;
    return (
      <button
        type="button"
        key={key}
        className={classes.row}
        disabled={row.refusal !== null}
        data-info={row.refusal ?? row.conversion?.describe ?? `Choose ${row.block.name}.`}
        onClick={() => {
          close();
          onPick(row);
        }}
      >
        <span className={classes.glyph} style={{ color: `var(--mark-${mark.hue})` }} aria-hidden>
          {mark.glyph}
        </span>
        <span className={classes.text}>
          <span className={classes.name}>{row.block.name}</span>
          <span className={classes.sub}>
            {row.conversion
              ? `${row.conversion.label}: ${row.conversion.describe}`
              : `${row.typeLabel} · ${row.users === 0 ? 'not used' : `used by ${row.users}`}`}
          </span>
        </span>
        <span className={classes.thumb}>
          {isPacketBlock(row.block) && <DataBlockPreview packet={row.block.payload.packet} />}
        </span>
        <span className={classes.check} aria-hidden>
          {row.block.id === selectedId && !row.conversion ? '✓' : ''}
        </span>
      </button>
    );
  }

  const nothing = model.exact.length === 0 && model.reinterpret.length === 0;
  return (
    <Popover
      opened={opened}
      onChange={(next) => (next ? setOpened(true) : close())}
      position="bottom-start"
      withinPortal={false}
      transitionProps={{ duration: 0 }}
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <Button
          size={size}
          variant="default"
          aria-label={ariaLabel}
          disabled={disabledReason != null}
          data-info={disabledReason ?? info}
          onClick={() => (opened ? close() : setOpened(true))}
        >
          {label} <span aria-hidden>▾</span>
        </Button>
      </Popover.Target>
      <Popover.Dropdown p={0} aria-label={ariaLabel}>
        <div className={classes.dropdown}>
          <TextInput
            size="xs"
            aria-label="Search data-blocks"
            placeholder="Search"
            value={query}
            data-autofocus
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <div className={classes.list}>
            {model.exact.map(renderRow)}
            {model.reinterpret.length > 0 && (
              <>
                <div className={classes.heading}>Reinterpret as ...</div>
                {model.reinterpret.map(renderRow)}
              </>
            )}
            {nothing && (
              <div className={classes.empty}>
                {query.trim() === '' ? 'Nothing on the desk fits.' : 'No data-block matches.'}
              </div>
            )}
          </div>
          <div className={classes.footer}>
            {onNew && (
              <NewBlankButton
                onCreated={(created) => {
                  close();
                  onNew(created);
                }}
              />
            )}
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * The "New data-block" row: the desk's existing blank flow (default type and length). It is its own
 * component so the settings it reads are only needed while the menu is open.
 */
function NewBlankButton({ onCreated }: { onCreated(dataBlock: PacketBlock): void }) {
  const { addBlankDataBlock, loading, locked } = useDesk();
  const { settings } = useCompositionSettings();
  const [defaults] = useDataBlockDefaults();
  // Only types with an editor start blank: a data-block nobody can edit is not a start.
  const types = dataBlockTypes().filter((type) => type.editorId !== undefined);
  const typeId = types.some((type) => type.id === defaults.typeId) ? defaults.typeId : types[0]?.id;
  if (typeId === undefined || loading || locked) {
    return null;
  }
  return (
    <Button
      size="compact-xs"
      variant="default"
      data-info="Add an empty data-block of the default type and length to the desk and use it."
      onClick={() => {
        const created = addBlankDataBlock(
          typeId,
          barsLength(settings.transport.meter, defaults.bars),
          { timeSignature: settings.transport.meter }
        );
        if (created) {
          onCreated(created);
        }
      }}
    >
      New data-block
    </Button>
  );
}
