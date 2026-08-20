import type { CSSProperties } from 'react';
import { Menu, UnstyledButton } from '@mantine/core';
import classes from './FlowCell.module.css';

export interface FlowCellPort {
  id: string;
  elementKey: string;
  label: string;
  shortLabel: string;
  ariaLabel?: string;
  modified?: boolean;
  selected?: boolean;
  bypassed?: boolean;
  unavailable?: boolean;
  onClick?(): void;
}

interface FlowCellProps {
  title: string;
  subtitle: string;
  footer: string;
  footerDetail?: string;
  footerError?: boolean;
  // A soft notice (e.g. "2 trailing items unused by Zip") — expected/informational, not a
  // problem. Shown as a small flag on the card's left edge rather than the loud red footer bar,
  // which is reserved for the module actually failing to produce output.
  noticeDetail?: string;
  inlets?: FlowCellPort[];
  outlets?: FlowCellPort[];
  active?: boolean;
  selected?: boolean;
  flowActive?: boolean;
  laneId: number;
  instanceId: string;
  style: CSSProperties;
  onSelect(): void;
}

const MAX_VISIBLE_PORTS = 5;

function PortControl({ port }: { port: FlowCellPort }) {
  const commonProps = {
    className: classes.port,
    'data-flow-port-key': port.elementKey,
    'data-modified': port.modified || undefined,
    'data-selected': port.selected || undefined,
    'data-bypassed': port.bypassed || undefined,
    'data-unavailable': port.unavailable || undefined,
    title: port.label,
  };
  if (!port.onClick) {
    return (
      <span {...commonProps} aria-label={port.ariaLabel ?? port.label}>
        {port.shortLabel}
      </span>
    );
  }
  return (
    <UnstyledButton
      {...commonProps}
      aria-label={port.ariaLabel ?? port.label}
      onClick={port.onClick}
    >
      {port.shortLabel}
    </UnstyledButton>
  );
}

function PortRail({ ports, edge }: { ports: FlowCellPort[]; edge: 'top' | 'bottom' }) {
  const hasOverflow = ports.length > MAX_VISIBLE_PORTS;
  const directPorts = hasOverflow ? ports.slice(0, MAX_VISIBLE_PORTS - 1) : ports;
  const overflowPorts = hasOverflow ? ports.slice(MAX_VISIBLE_PORTS - 1) : [];
  const visibleCount = directPorts.length + (hasOverflow ? 1 : 0);

  return (
    <div
      className={classes.portRail}
      data-edge={edge}
      style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleCount)}, minmax(0, 1fr))` }}
    >
      {directPorts.map((port) => (
        <span key={port.id} className={classes.portTrack}>
          <PortControl port={port} />
        </span>
      ))}
      {hasOverflow && (
        <span className={classes.portTrack}>
          <Menu position={edge === 'top' ? 'top' : 'bottom'} withinPortal>
            <Menu.Target>
              <UnstyledButton
                className={classes.port}
                data-flow-port-overflow-keys={JSON.stringify(
                  overflowPorts.map((port) => port.elementKey)
                )}
                aria-label={`Show ${overflowPorts.length} more ${edge === 'top' ? 'inlets' : 'outlets'}`}
                title={`${overflowPorts.length} more ${edge === 'top' ? 'inlets' : 'outlets'}`}
              >
                …
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              {overflowPorts.map((port) => (
                <Menu.Item key={port.id} onClick={port.onClick}>
                  {port.shortLabel} | {port.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </span>
      )}
    </div>
  );
}

export function FlowCell({
  title,
  subtitle,
  footer,
  footerDetail,
  footerError,
  noticeDetail,
  inlets = [],
  outlets = [],
  active,
  selected,
  flowActive,
  laneId,
  instanceId,
  style,
  onSelect,
}: FlowCellProps) {
  return (
    <div
      className={classes.slot}
      data-module-slot="true"
      data-lane={laneId}
      data-instance-id={instanceId}
      style={style}
    >
      {inlets.length > 0 && <PortRail ports={inlets} edge="top" />}
      <UnstyledButton
        className={classes.card}
        data-lane={laneId}
        data-instance-id={instanceId}
        data-active={active || undefined}
        data-selected={selected || undefined}
        data-flow-active={flowActive || undefined}
        onClick={onSelect}
      >
        {noticeDetail && <span className={classes.noticeFlag} title={noticeDetail} aria-hidden="true" />}
        <span className={classes.title}>{title}</span>
        <span className={classes.subtitle}>{subtitle}</span>
        {footer && (
          <span
            className={classes.footer}
            data-status={footerError ? 'error' : undefined}
            title={footerDetail ?? footer}
          >
            {footer}
          </span>
        )}
      </UnstyledButton>
      {outlets.length > 0 && <PortRail ports={outlets} edge="bottom" />}
    </div>
  );
}
