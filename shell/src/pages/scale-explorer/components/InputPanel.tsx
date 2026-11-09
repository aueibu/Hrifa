import { useState } from 'react';
import { Button, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { axisLabel } from '../format';
import type { InversionMode, SemitoneStats } from '../pitchSets';
import type { NowPlaying } from '../usePlayback';
import { PianoKeys } from './PianoKeys';
import { PitchRing, type RingCompare } from './PitchRing';
import classes from '../ScaleExplorer.module.css';

interface InputPanelProps {
  selection: number[];
  compares: RingCompare[];
  names: string[];
  showFifths: boolean;
  invMode: InversionMode;
  inverted: ReadonlySet<number>;
  semis: SemitoneStats;
  now: NowPlaying | null;
  onToggle: (pc: number) => void;
  onShowFifths: (on: boolean) => void;
  onFlats: (on: boolean) => void;
  flats: boolean;
  onInvMode: (mode: InversionMode) => void;
  onClear: () => void;
  onLoadMajor: () => void;
  onCopy: () => Promise<boolean>;
}

/** The keyboard and ring that choose the pitch set, with the controls that change how it is read. */
export function InputPanel(props: InputPanelProps) {
  const {
    selection,
    compares,
    names,
    showFifths,
    flats,
    invMode,
    inverted,
    semis,
    now,
    onToggle,
    onShowFifths,
    onFlats,
    onInvMode,
    onClear,
    onLoadMajor,
    onCopy,
  } = props;
  const [copyLabel, setCopyLabel] = useState('Copy results');
  const soundingPcs = now?.pcs ?? new Set<number>();

  const copy = async () => {
    setCopyLabel((await onCopy()) ? 'Copied' : 'Copy blocked');
    setTimeout(() => setCopyLabel('Copy results'), 1200);
  };

  const inversionData = [
    { value: 'off', label: 'No inversion' },
    { value: 'root', label: 'Each mode around its root' },
    {
      group: 'Whole set around an axis',
      items: Array.from({ length: 12 }, (_, q) => ({
        value: `I${q}`,
        label: `I${q} · ${axisLabel(q, names)}`,
      })),
    },
  ];

  return (
    <Surface aria-label="Pitch set input">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, xs: 2, md: 1 }} spacing="sm">
          <PianoKeys
            selection={selection}
            compares={compares}
            names={names}
            soundingPcs={soundingPcs}
            onToggle={onToggle}
          />
          <PitchRing
            selection={selection}
            compares={compares}
            names={names}
            showFifths={showFifths}
            inverted={inverted}
            semis={semis}
            soundingPcs={soundingPcs}
            soundingDot={now?.dot ?? null}
            onToggle={onToggle}
          />
        </SimpleGrid>
        <Group gap="md" justify="center">
          <Group gap={6}>
            <i className={classes.swatch} />
            <Text size="xs" c="dimmed">
              isolated semitone
            </Text>
          </Group>
          <Group gap={6}>
            <i className={classes.swatch} data-tone="warn" />
            <Text size="xs" c="dimmed">
              chained semitone
            </Text>
          </Group>
          {showFifths && (
            <>
              <Group gap={6}>
                <i className={classes.swatch} data-tone="good" />
                <Text size="xs" c="dimmed">
                  P5 above present
                </Text>
              </Group>
              <Group gap={6}>
                <i className={classes.swatch} data-tone="bad" />
                <Text size="xs" c="dimmed">
                  P5 above missing
                </Text>
              </Group>
            </>
          )}
        </Group>
        <Group gap="xs" align="end">
          <Button
            size="xs"
            variant={showFifths ? 'filled' : 'default'}
            aria-pressed={showFifths}
            onClick={() => onShowFifths(!showFifths)}
          >
            {showFifths ? 'Hide fifths' : 'Show fifths'}
          </Button>
          <Button
            size="xs"
            variant={flats ? 'filled' : 'default'}
            aria-pressed={flats}
            onClick={() => onFlats(!flats)}
          >
            {flats ? 'Show sharps' : 'Show flats'}
          </Button>
          <Select
            size="xs"
            label="Invert"
            data={inversionData}
            value={invMode}
            allowDeselect={false}
            onChange={(v) => v && onInvMode(v as InversionMode)}
            w={190}
          />
          <Button size="xs" variant="default" onClick={onClear}>
            Clear
          </Button>
          <Button size="xs" variant="default" onClick={onLoadMajor}>
            Load major scale
          </Button>
          <Button size="xs" variant="default" onClick={copy}>
            {copyLabel}
          </Button>
        </Group>
      </Stack>
    </Surface>
  );
}
