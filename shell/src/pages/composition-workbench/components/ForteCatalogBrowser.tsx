import { useEffect, useMemo, useState } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  createForteSetSelection,
  forteCatalog,
  formatPitchClassGroup,
  type ForteSetSelection,
} from '../forteCatalog';
import type { PitchInputFormat } from '../pitch';
import classes from './ForteCatalogBrowser.module.css';

function searchable(value: string) {
  return value.toUpperCase().replace(/[\s,()[\]<>–-]/g, '');
}

function compactPitchClass(pitchClass: number) {
  if (pitchClass === 10) {
    return 'T';
  }
  if (pitchClass === 11) {
    return 'E';
  }
  return String(pitchClass);
}

function PitchClassClock({ pitchClasses }: { pitchClasses: number[] }) {
  const points = Array.from({ length: 12 }, (_, pitchClass) => {
    const angle = (pitchClass / 12) * Math.PI * 2 - Math.PI / 2;
    return {
      pitchClass,
      x: 100 + Math.cos(angle) * 72,
      y: 100 + Math.sin(angle) * 72,
    };
  });

  return (
    <svg
      className={classes.clock}
      viewBox="0 0 200 200"
      role="img"
      aria-label={`Pitch-class clock ${pitchClasses.join(' ')}`}
    >
      <circle className={classes.clockRing} cx="100" cy="100" r="82" />
      {points.map(({ pitchClass, x, y }) => (
        <g key={pitchClass}>
          <circle
            className={classes.clockPoint}
            data-active={pitchClasses.includes(pitchClass) || undefined}
            cx={x}
            cy={y}
            r="11"
          />
          <text className={classes.clockLabel} x={x} y={y + 4}>
            {pitchClass}
          </text>
        </g>
      ))}
    </svg>
  );
}

export interface ForteCatalogBrowserProps {
  opened: boolean;
  currentFormat: PitchInputFormat;
  currentValuesValid: boolean;
  onClose(): void;
  onInsert(selection: ForteSetSelection): void;
  onReplace(selection: ForteSetSelection): void;
}

export function ForteCatalogBrowser({
  opened,
  currentFormat,
  currentValuesValid,
  onClose,
  onInsert,
  onReplace,
}: ForteCatalogBrowserProps) {
  const [query, setQuery] = useState('');
  const [cardinality, setCardinality] = useState('all');
  const [selectedNumber, setSelectedNumber] = useState('3-11');
  const [transposition, setTransposition] = useState('0');
  const [form, setForm] = useState<'prime' | 'inverted'>('prime');

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchable(query);
    return forteCatalog.filter((entry) => {
      if (cardinality !== 'all' && entry.cardinality !== Number(cardinality)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const values = [
        entry.forteNumber,
        entry.primeForm.join(' '),
        entry.primeForm.map(compactPitchClass).join(''),
        entry.intervalClassVector.join(''),
      ];
      return values.some((value) => searchable(value).includes(normalizedQuery));
    });
  }, [cardinality, query]);

  useEffect(() => {
    if (
      filteredEntries.length > 0 &&
      !filteredEntries.some((entry) => entry.forteNumber === selectedNumber)
    ) {
      setSelectedNumber(filteredEntries[0].forteNumber);
    }
  }, [filteredEntries, selectedNumber]);

  const selectedEntry =
    forteCatalog.find((entry) => entry.forteNumber === selectedNumber) ?? forteCatalog[0];
  const selection = createForteSetSelection(
    selectedEntry,
    Number(transposition),
    form === 'inverted'
  );
  const canInsert = currentFormat === 'pitch-class' && currentValuesValid;

  return (
    <Modal opened={opened} onClose={onClose} title="Forte set-class catalog" size="xl">
      <div className={classes.layout}>
        <Stack gap="sm">
          <Group grow align="end">
            <TextInput
              label="Search catalog"
              description="Forte number, prime form, or interval vector"
              placeholder="3-11, 037, or 001110"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <Select
              label="Cardinality"
              value={cardinality}
              data={[
                { value: 'all', label: 'All (1–12)' },
                ...Array.from({ length: 12 }, (_, index) => {
                  const value = String(index + 1);
                  return { value, label: value };
                }),
              ]}
              onChange={(value) => value && setCardinality(value)}
            />
          </Group>

          <div className={classes.catalogList} aria-label="Forte set classes">
            {filteredEntries.map((entry) => (
              <UnstyledButton
                key={entry.forteNumber}
                className={classes.catalogEntry}
                data-selected={entry.forteNumber === selectedNumber || undefined}
                aria-label={`Select Forte ${entry.forteNumber}`}
                onClick={() => setSelectedNumber(entry.forteNumber)}
              >
                <Text fw={700} ff="monospace" size="sm">
                  {entry.forteNumber}
                </Text>
                <Text ff="monospace" size="sm">
                  ({entry.primeForm.map(compactPitchClass).join('')})
                </Text>
                <Text ff="monospace" c="dimmed" size="xs" ta="right">
                  &lt;{entry.intervalClassVector.join('')}&gt;
                </Text>
              </UnstyledButton>
            ))}
            {filteredEntries.length === 0 && (
              <Text c="dimmed" size="sm" p="md">
                No matching set classes.
              </Text>
            )}
          </div>
          <Text size="xs" c="dimmed">
            {filteredEntries.length} of {forteCatalog.length} set classes
          </Text>
          <Text size="xs" c="dimmed">
            Prime forms checked against the{' '}
            <Anchor href="https://www.humdrum.org/rep/pcset/index.html" target="_blank">
              Humdrum **pcset table
            </Anchor>
            ; terminology cross-referenced with{' '}
            <Anchor
              href="https://viva.pressbooks.pub/openmusictheory/chapter/set-class-and-prime-form/"
              target="_blank"
            >
              Open Music Theory
            </Anchor>
            .
          </Text>
        </Stack>

        <Stack className={classes.preview} gap="sm">
          <Group justify="space-between" align="start">
            <div>
              <Title order={3} size="h4">
                {selectedEntry.forteNumber}
              </Title>
              <Text ff="monospace" c="dimmed" size="sm">
                Prime ({selectedEntry.primeForm.map(compactPitchClass).join('')}) · &lt;
                {selectedEntry.intervalClassVector.join('')}&gt;
              </Text>
            </div>
            <Group gap={4}>
              <Badge variant="outline">Complement {selectedEntry.complement}</Badge>
              {selectedEntry.zMate && <Badge variant="outline">Z-mate {selectedEntry.zMate}</Badge>}
            </Group>
          </Group>

          <PitchClassClock pitchClasses={selection.pitchClasses} />

          <SegmentedControl
            fullWidth
            aria-label="Set-class form"
            value={form}
            data={[
              { value: 'prime', label: 'Prime form' },
              { value: 'inverted', label: 'Inversion (I0)' },
            ]}
            onChange={(value) => setForm(value as 'prime' | 'inverted')}
          />
          <Select
            label="Transpose"
            aria-label="Forte set transposition"
            value={transposition}
            data={Array.from({ length: 12 }, (_, index) => ({
              value: String(index),
              label: `T${index}`,
            }))}
            onChange={(value) => value && setTransposition(value)}
          />

          <Text className={classes.realizedSet} ff="monospace" size="lg" fw={700}>
            {formatPitchClassGroup(selection.pitchClasses)}
          </Text>
          <Text size="xs" c="dimmed">
            The catalog creates one simultaneous pitch-class group. Register remains a separate
            musical operation; the octave in Preview is only for listening.
          </Text>

          <Group mt="auto" justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={!canInsert}
              title={
                canInsert
                  ? undefined
                  : 'Insert requires a valid list already interpreted as pitch classes.'
              }
              onClick={() => {
                onInsert(selection);
                onClose();
              }}
            >
              Insert group
            </Button>
            <Button
              onClick={() => {
                onReplace(selection);
                onClose();
              }}
            >
              Replace values
            </Button>
          </Group>
        </Stack>
      </div>
    </Modal>
  );
}
