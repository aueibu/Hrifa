import type { ReactNode } from 'react';
import { ActionIcon, Group, Text, Title } from '@mantine/core';
import classes from './ModuleDevice.module.css';

interface NodeDeviceProps {
  name: string;
  /** Short status text beside the name. */
  status?: ReactNode;
  /** Small badges at the end of the header. */
  badges?: ReactNode;
  /** Buttons that run the node, such as Play and Stop. They stay in the header. */
  actions?: ReactNode;
  onReset?(): void;
  /** The controls a user reaches for repeatedly to shape the result. */
  controls: ReactNode;
  /** The result: strips, rows, lists. */
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * A node as a device strip, like a Bitwig device: a thin header with the run buttons, the shaping
 * controls on the left, the result on the right. It fills the detail panel and each region scrolls
 * on its own, so a node never makes the page itself scroll.
 */
export function NodeDevice({
  name,
  status,
  badges,
  actions,
  onReset,
  controls,
  children,
  footer,
}: NodeDeviceProps) {
  return (
    <div className={classes.device}>
      <Group className={classes.header} justify="space-between" wrap="nowrap" gap="xs">
        <Group gap="xs" wrap="nowrap" className={classes.title}>
          <span className={classes.indicator} aria-hidden="true" />
          <Title order={2} size="xs">
            {name}
          </Title>
          {status && (
            <Text size="xs" c="dimmed" truncate>
              {status}
            </Text>
          )}
          {badges}
        </Group>
        <Group gap="xs" wrap="nowrap">
          {actions}
          {onReset && (
            <ActionIcon variant="subtle" aria-label={`Reset ${name}`} onClick={onReset}>
              ↺
            </ActionIcon>
          )}
        </Group>
      </Group>
      <div className={classes.body}>
        <div className={classes.controls}>{controls}</div>
        <div className={classes.view}>{children}</div>
      </div>
      {footer && <div className={classes.footer}>{footer}</div>}
    </div>
  );
}
