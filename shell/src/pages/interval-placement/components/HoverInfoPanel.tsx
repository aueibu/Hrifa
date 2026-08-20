import { Stack, Text } from '@mantine/core';
import { Data } from '../../../components/Data/Data';
import type { IntervalPlacementParams, PlacementRecord } from '../engine';
import { dyadPenaltyDetails } from '../intervalMath';
import { intervalColor } from '../visuals';

interface HoverInfoPanelProps {
  record: PlacementRecord | null;
  hoverPitch: number | null;
  L: number;
  params: IntervalPlacementParams;
  isDark: boolean;
}

/** React port of `updateHoverInfo`: the dyad breakdown for the hovered pitch against every other pitch in the voicing. */
export function HoverInfoPanel({ record, hoverPitch, L, params, isDark }: HoverInfoPanelProps) {
  if (!record || hoverPitch === null) {
    return (
      <Text size="sm" c="dimmed">
        Hover a pitch to see dyad details.
      </Text>
    );
  }
  const rows = record.pitches
    .filter((p) => p !== hoverPitch)
    .map((p) => {
      const lo = Math.min(hoverPitch, p);
      const hi = Math.max(hoverPitch, p);
      const { g, dSteps } = dyadPenaltyDetails(lo, hi, params, L);
      return { other: p, dSteps, g };
    })
    .sort((a, b) => a.dSteps - b.dSteps);

  return (
    <Stack gap={2}>
      {rows.map((row) => (
        <Text key={row.other} size="xs" ff="monospace">
          p={hoverPitch} &rarr; {row.other}{' '}
          <Data span size="xs" c={intervalColor(row.dSteps, params.edoSteps, isDark)}>
            d={row.dSteps}
          </Data>{' '}
          g={row.g.toFixed(2)}
        </Text>
      ))}
    </Stack>
  );
}
