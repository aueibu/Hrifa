import type { PropsWithChildren, ReactNode } from 'react';
import { ActionIcon, Group, Text } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import type { DataPacket } from '../model';
import classes from './Module.module.css';

interface ModuleProps extends PropsWithChildren {
  name: string;
  status?: ReactNode;
  output?: ReactNode;
  footer?: ReactNode;
  onReset?(): void;
}

interface ModuleSectionProps extends PropsWithChildren {
  label: string;
  grow?: boolean;
}

export function Module({ name, status, output, footer, onReset, children }: ModuleProps) {
  return (
    <Surface tone="inset" p={0} className={classes.root}>
      <Group className={classes.header} justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <span className={classes.moduleIndicator} aria-hidden="true" />
          <Text size="xs" fw={700} truncate>
            {name}
          </Text>
          {status && (
            <Text size="xs" c="dimmed" truncate>
              {status}
            </Text>
          )}
        </Group>
        {onReset && (
          <ActionIcon variant="subtle" size="sm" aria-label={`Reset ${name}`} onClick={onReset}>
            ↺
          </ActionIcon>
        )}
      </Group>
      <div className={classes.sections}>{children}</div>
      {output && <div className={classes.output}>{output}</div>}
      {footer && <div className={classes.footer}>{footer}</div>}
    </Surface>
  );
}

export function ModuleOutput({
  name,
  packet,
  children,
}: PropsWithChildren<{ name: string; packet: DataPacket }>) {
  const domain = packet.domain === 'pitchClass' ? 'pitch-class' : packet.domain;
  const role =
    packet.role === 'interOnset'
      ? 'inter-onset'
      : packet.role === 'pitchMaterial'
        ? 'pitch-material'
        : packet.role;
  const description = [packet.kind, domain, packet.encoding, role, packet.frame?.topology]
    .filter(Boolean)
    .join(' | ');
  const extent = packet.frame?.extent;
  const unit = packet.frame?.unit ?? 'unit';
  const musicalExtent = packet.frame?.musicalExtent?.quarterNotes;
  const extentDescription = musicalExtent
    ? `${musicalExtent.numerator}${musicalExtent.denominator === 1 ? '' : `/${musicalExtent.denominator}`} quarter note${musicalExtent.numerator === musicalExtent.denominator ? '' : 's'}`
    : extent !== undefined
      ? `${extent} ${unit}${extent === 1 ? '' : 's'}`
      : '';
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Group gap="xs" wrap="nowrap" className={classes.outputSummary}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Output
        </Text>
        <Text size="xs" fw={600} truncate>
          {name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {description} | {packet.items.length} items
          {extentDescription ? ` | ${extentDescription}` : ''}
        </Text>
      </Group>
      {children}
    </Group>
  );
}

export function ModuleSection({ label, grow, children }: ModuleSectionProps) {
  return (
    <section className={classes.section} data-grow={grow || undefined}>
      <Text className={classes.sectionLabel} size="xs" fw={700} tt="uppercase">
        {label}
      </Text>
      <div className={classes.sectionContent}>{children}</div>
    </section>
  );
}
