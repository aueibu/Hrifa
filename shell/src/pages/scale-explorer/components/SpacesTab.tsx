import { Group, Select, Stack, Text, Title } from '@mantine/core';
import { Surface } from '../../../components/Surface/Surface';
import { catalog, type PrimeConvention } from '../pitchSets';
import { tonnetzStats } from '../spaces';
import { SPECTRUM_COMPONENTS } from '../spectrum';
import { PHASE_HINT, TONNETZ_HINT } from '../texts';
import type { CompareEntry } from './CompareTab';
import { Swatch } from './Legend';
import { PhaseCircles, scatterPointCount, SetClassMap, TonnetzChart } from './SpaceCharts';
import {
  SpectrumChart,
  SpectrumModeToggle,
  type SpectrumMode,
  type SpectrumSet,
} from './SpectrumChart';

interface SpacesTabProps {
  selection: number[];
  compares: CompareEntry[];
  conv: PrimeConvention;
  spectrumMode: SpectrumMode;
  onSpectrumMode: (mode: SpectrumMode) => void;
  scatterX: number;
  scatterY: number;
  onScatterAxes: (x: number, y: number) => void;
  onToggle: (pc: number) => void;
  onToggleCompare: (z: number[]) => void;
}

const componentOptions = SPECTRUM_COMPONENTS.map((c, i) => ({
  value: String(i + 1),
  label: `${c.id} ${c.name}`,
}));

function Legend({ sets }: { sets: SpectrumSet[] }) {
  return (
    <Group gap="md">
      {sets.map((o) => (
        <Group key={o.name} gap={6}>
          <Swatch slot={o.slot} />
          <Text size="xs">{o.name}</Text>
        </Group>
      ))}
    </Group>
  );
}

/** The loaded set (and any comparisons) in three spaces: the Tonnetz, a map of all set classes, and the Fourier spectrum. */
export function SpacesTab(props: SpacesTabProps) {
  const { selection, compares, conv, scatterX, scatterY } = props;
  const s0 = selection[0] ?? 0;
  const sets: SpectrumSet[] = [
    { name: 'Loaded', abs: selection, slot: 'L' },
    ...compares.map((c, i) => ({
      name: `Comparison ${i + 1}`,
      abs: c.z.map((x) => (x + s0) % 12).sort((a, b) => a - b),
      slot: c.slot,
    })),
  ];
  const n = selection.length;
  const mapOk = n >= 2 && n <= 10;

  return (
    <Stack gap="md">
      <Surface aria-label="Tonnetz">
        <Stack gap="sm">
          <Title order={3} size="h5">
            Tonnetz
          </Title>
          <Legend sets={sets} />
          {n ? (
            <>
              <TonnetzChart sets={sets} onToggle={props.onToggle} />
              <Stack gap={2}>
                {sets.map((o) => {
                  const t = tonnetzStats(o.abs);
                  return (
                    <Group key={o.name} gap={6} wrap="nowrap" align="start">
                      <Swatch slot={o.slot} />
                      <Text size="sm">
                        <b>{o.name}</b> {`{${o.abs.join(', ')}}`}: {t.pieces} connected{' '}
                        {t.pieces === 1 ? 'piece' : 'pieces'}, {t.maj} major and {t.min} minor{' '}
                        {t.maj + t.min === 1 ? 'triad' : 'triads'}
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              Select some notes to see them on the Tonnetz.
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {TONNETZ_HINT}
          </Text>
        </Stack>
      </Surface>

      <Surface aria-label="Set class map">
        <Stack gap="sm">
          <Title order={3} size="h5">
            Set Class Map
          </Title>
          <Group gap="xs" align="end">
            <Select
              size="xs"
              label="Horizontal"
              w={170}
              allowDeselect={false}
              data={componentOptions}
              value={String(scatterX)}
              onChange={(v) => v && props.onScatterAxes(Number(v), scatterY)}
            />
            <Select
              size="xs"
              label="Vertical"
              w={170}
              allowDeselect={false}
              data={componentOptions}
              value={String(scatterY)}
              onChange={(v) => v && props.onScatterAxes(scatterX, Number(v))}
            />
          </Group>
          {mapOk ? (
            <>
              <SetClassMap
                sets={sets}
                kx={scatterX}
                ky={scatterY}
                conv={conv}
                onToggleCompare={props.onToggleCompare}
              />
              <Text size="xs" c="dimmed">
                {`${catalog(n, true, conv).length} ${n}-note set classes (prime forms). Sets with the same interval vector land on exactly the same point, and so do mirror images, so there are ${scatterPointCount(n, scatterX, scatterY, conv)} distinct points. Click a point to compare it with the loaded set.`}
              </Text>
            </>
          ) : (
            <Text size="sm" c="dimmed">
              Load between two and ten notes to see the map for that size.
            </Text>
          )}
        </Stack>
      </Surface>

      <Surface aria-label="Fourier spectrum">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={3} size="h5">
              Fourier Spectrum
            </Title>
            <SpectrumModeToggle value={props.spectrumMode} onChange={props.onSpectrumMode} />
          </Group>
          {n ? (
            <>
              <SpectrumChart
                sets={sets}
                mode={props.spectrumMode}
                label="Fourier power by component"
              />
              <Title order={3} size="h5" mt="sm">
                Phase Circles
              </Title>
              <PhaseCircles sets={sets} />
            </>
          ) : (
            <Text size="sm" c="dimmed">
              Select some notes to see their spectrum.
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {PHASE_HINT}
          </Text>
        </Stack>
      </Surface>
    </Stack>
  );
}
