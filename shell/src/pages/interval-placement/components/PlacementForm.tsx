import { useState } from 'react';
import {
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Data } from '../../../components/Data/Data';
import { Surface } from '../../../components/Surface/Surface';
import type { OddBiasDirection } from '../engine';
import { parseIntervalsText, type Settings } from '../settings';

const NOTE_OPTIONS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(
  (label, value) => ({ value: String(value), label })
);

const PLACEMENT_MODE_OPTIONS = [
  { value: 'v2', label: 'prefix-slack' },
  { value: 'v1', label: 'uniform-centers' },
  { value: 'prefixDominance', label: 'prefix-dominance' },
  { value: 'repulse', label: 'repulsion-centers' },
];

interface PlacementFormProps {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <Stack gap={4}>
      <Group gap="xs" justify="space-between">
        <Text size="sm">{label}</Text>
        <Data size="sm">{value.toFixed(2)}</Data>
      </Group>
      <Slider value={value} onChange={onChange} min={min} max={max} step={step} />
    </Stack>
  );
}

/** Controls for the interval set, placement algorithm, and its per-mode parameters. */
export function PlacementForm({ settings: s, set }: PlacementFormProps) {
  const [intervalsText, setIntervalsText] = useState(s.intervals.join(' '));
  const [controlsOpened, { toggle: toggleControls }] = useDisclosure(false);

  const commitIntervals = () => {
    const parsed = parseIntervalsText(intervalsText);
    if (parsed.length && parsed.length <= 5) {
      set('intervals', parsed);
      if (s.oddBias.length !== parsed.length) {
        set(
          'oddBias',
          parsed.map(() => 'down' as OddBiasDirection)
        );
      }
    } else {
      setIntervalsText(s.intervals.join(' '));
    }
  };

  const oddIndices = s.intervals.map((d, idx) => ({ d, idx })).filter(({ d }) => d % 2 === 1);

  return (
    <Stack gap="md">
      <Surface>
        <Stack gap="md">
          <Title order={2} size="h4">
            Intervals
          </Title>
          <TextInput
            label="Intervals (steps)"
            description="Up to 5, comma or space separated."
            value={intervalsText}
            onChange={(e) => setIntervalsText(e.currentTarget.value)}
            onBlur={commitIntervals}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitIntervals();
              }
            }}
          />
        </Stack>
      </Surface>

      <Surface>
        <Stack gap="md">
          {/*
            Plain conditional render, not Mantine's `Collapse`/`Accordion`:
            its height-measuring animation got stuck mid-transition here
            (panel stayed `display: none` even once `aria-expanded` reported
            true), and the layout thrashing from that stuck measurement was
            also what shifted the other columns' widths. A static show/hide
            can't get stuck, since there's no height to measure.
          */}
          <UnstyledButton onClick={toggleControls}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} size="sm">
                {controlsOpened ? '▾' : '▸'}
              </Text>
              <Title order={2} size="h4">
                Controls
              </Title>
            </Group>
          </UnstyledButton>

          {controlsOpened && (
            <>
              {oddIndices.length > 0 && (
            <Stack gap={4}>
              <Text size="sm">Odd-interval bias</Text>
              <Group gap="xs">
                {oddIndices.map(({ d, idx }) => (
                  <Select
                    key={idx}
                    w={90}
                    size="xs"
                    label={`d=${d} (#${idx + 1})`}
                    value={s.oddBias[idx] || 'down'}
                    data={[
                      { value: 'down', label: 'down' },
                      { value: 'up', label: 'up' },
                    ]}
                    onChange={(v) => {
                      const next = s.oddBias.slice();
                      next[idx] = (v as OddBiasDirection) || 'down';
                      set('oddBias', next);
                    }}
                    allowDeselect={false}
                  />
                ))}
              </Group>
            </Stack>
          )}

          <Group grow>
            <NumberInput
              label="N-EDO"
              value={s.edoSteps}
              onChange={(v) => set('edoSteps', Number(v) || 12)}
              min={1}
            />
            <NumberInput
              label="Window (octaves)"
              value={s.windowOctaves}
              onChange={(v) => set('windowOctaves', Number(v) || 1)}
              min={1}
            />
          </Group>

          <Group grow>
            <Select
              label="Base note"
              data={NOTE_OPTIONS}
              value={String(s.baseNote)}
              onChange={(v) => set('baseNote', Number(v) || 0)}
              allowDeselect={false}
            />
            <NumberInput
              label="Base octave"
              value={s.baseOctave}
              onChange={(v) => set('baseOctave', Number(v) || 0)}
            />
          </Group>

          <TextInput
            label="Guitar tuning"
            description="Low to high, e.g. EADGBE"
            value={s.guitarTuning}
            onChange={(e) => set('guitarTuning', e.currentTarget.value)}
          />

          <Switch
            label="Register damping"
            checked={s.useDamping}
            onChange={(e) => set('useDamping', e.currentTarget.checked)}
          />

          <Title order={3} size="h5">
            Placement
          </Title>
          <Select
            label="Placement mode"
            data={PLACEMENT_MODE_OPTIONS}
            value={s.placementMode}
            onChange={(v) => set('placementMode', (v as Settings['placementMode']) || 'v2')}
            allowDeselect={false}
          />

          {s.placementMode !== 'v1' && s.placementMode !== 'repulse' && (
            <>
              <SliderField
                label="Anchor alpha"
                value={s.anchorAlpha}
                onChange={(v) => set('anchorAlpha', v)}
                min={0}
                max={1}
                step={0.05}
              />
              <SliderField
                label="Anchor beta"
                value={s.anchorBeta}
                onChange={(v) => set('anchorBeta', v)}
                min={0}
                max={4}
                step={0.1}
              />
            </>
          )}
          {s.placementMode !== 'v1' && (
            <SliderField
              label="Anchor rho"
              value={s.anchorRho}
              onChange={(v) => set('anchorRho', v)}
              min={0}
              max={1}
              step={0.05}
            />
          )}

          {s.placementMode === 'repulse' && (
            <>
              <SliderField
                label="Repulse gamma"
                value={s.repulseGamma}
                onChange={(v) => set('repulseGamma', v)}
                min={0}
                max={4}
                step={0.1}
              />
              <SliderField
                label="Repulse kappa"
                value={s.repulseKappa}
                onChange={(v) => set('repulseKappa', v)}
                min={0}
                max={2}
                step={0.05}
              />
              <SliderField
                label="Repulse lambda"
                value={s.repulseLambda}
                onChange={(v) => set('repulseLambda', v)}
                min={0}
                max={2}
                step={0.05}
              />
              <SliderField
                label="Repulse eta"
                value={s.repulseEta}
                onChange={(v) => set('repulseEta', v)}
                min={0}
                max={1}
                step={0.01}
              />
              <SliderField
                label="Repulse alpha"
                value={s.repulseAlpha}
                onChange={(v) => set('repulseAlpha', v)}
                min={0}
                max={1}
                step={0.05}
              />
              <NumberInput
                label="Repulse iterations"
                value={s.repulseIterations}
                onChange={(v) => set('repulseIterations', Number(v) || 1)}
                min={1}
              />
            </>
          )}
            </>
          )}
        </Stack>
      </Surface>
    </Stack>
  );
}
