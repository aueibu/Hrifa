import { Group, Text } from '@mantine/core';
import type { PlacementRecord } from '../engine';
import { intervalColor } from '../visuals';

interface IntervalCountsPanelProps {
  record: PlacementRecord;
  edoSteps: number;
  hoverCounts: Map<number, number>;
  isDark: boolean;
}

/**
 * React port of `renderCounts`: the induced-interval histogram and
 * octave-reduced interval-class vector for the selected voicing.
 * Highlights the intervals the hovered pitch actually forms.
 */
export function IntervalCountsPanel({
  record,
  edoSteps,
  hoverCounts,
  isDark,
}: IntervalCountsPanelProps) {
  return (
    <Group gap={6} wrap="wrap">
      {record.inducedCounts.map(([d, c]) => {
        const isHoverHit = hoverCounts.has(d);
        const color = intervalColor(d, edoSteps, isDark);
        return (
          <Text
            key={d}
            size="xs"
            span
            style={{
              border: `1px solid ${color}`,
              borderRadius: 4,
              padding: '2px 6px',
              color: isHoverHit ? color : undefined,
              fontWeight: isHoverHit ? 600 : undefined,
              background: isHoverHit ? 'var(--mantine-color-default-hover)' : undefined,
            }}
          >
            {d}({c})
          </Text>
        );
      })}
      {record.iv.length > 0 && (
        <Text size="xs" c="dimmed" style={{ width: '100%' }}>
          IV: {record.iv.join(' ')}
        </Text>
      )}
    </Group>
  );
}
