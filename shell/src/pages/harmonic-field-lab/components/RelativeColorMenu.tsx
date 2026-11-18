/**
 * M8o (H-37): the Color controls of the Relative picker, one per view (Rings, Near, Monzo: `ui.relColor.<view>` in `settings.v1`, H-37 amended); the panel shows and edits the OPEN view's choice.
 * Built like the Near panel (`metaPanel`: xs controls stacked in a 190 px column): Color, Range (only for the metrics that have
 * one), Octave (Monzo only) and Interval intensity (the same `developer.v1` `intervalIntensity` as the Developer menu entry and Pairs). The Near panel embeds
 * `RelativeColorControls`; the other views wrap it in `RelativeColorPanel`, the same panel box.
 */
import type { ReactNode } from 'react';
import { NativeSelect, SegmentedControl } from '@mantine/core';
import { useLabDeveloperOptions } from '../state/developerOptions';
import {
  REL_COLOR_METRICS,
  hasRange,
  isShaded,
  type RelColorView,
  type RelMonzoColor,
  type RelColorMetric,
} from '../state/intervalColor';
import { Tip, useLab } from './ui';
import classes from './relativeMenu.module.css';

/** The Color choices, in the menu's order. */
export const COLOR_LABELS: Record<RelColorMetric, string> = {
  off: 'Off',
  prime: 'Prime',
  tenney: 'Tenney',
  odd: 'Odd limit',
  error: 'Error vs 12-EDO',
  interval: 'Interval class',
  roughness: 'Roughness',
};

export function RelativeColorControls({
  monzo,
  near = false,
  legend,
}: {
  monzo: boolean;
  /** The Near panel's embedded controls (else Rings, or Monzo when `monzo`). */
  near?: boolean;
  /** The memoized legend (D23), drawn under the Color select. */
  legend?: ReactNode;
}) {
  const lab = useLab();
  const view: RelColorView = monzo ? 'monzo' : near ? 'near' : 'rings';
  const value: RelMonzoColor = { octave: 'exact', ...lab.state.ui.relColor[view] };
  const [dev, setDev] = useLabDeveloperOptions();
  const set = (patch: Partial<RelMonzoColor>) =>
    lab.dispatch({
      type: 'ui',
      patch: {
        relColor: {
          ...lab.state.ui.relColor,
          [view]: { ...lab.state.ui.relColor[view], ...patch },
        },
      },
    });
  // Interval class also reads the intensity (its strength); Prime and Error do not
  const shaded = isShaded(value.metric) || value.metric === 'interval';
  return (
    <>
      <div className={classes.metaTitle}>Color</div>
      <Tip k="relColor" as="control" block>
        <NativeSelect
          size="xs"
          aria-label="Color"
          data-testid="relative-color"
          value={value.metric}
          onChange={(e) => {
            const v = e.currentTarget.value;
            set({ metric: REL_COLOR_METRICS.find((m) => m === v) ?? value.metric });
          }}
          data={REL_COLOR_METRICS.map((m) => ({ value: m, label: COLOR_LABELS[m] }))}
        />
      </Tip>
      {legend}
      {hasRange(value.metric) && (
        <Tip k="relColorRange" as="control" block>
          <SegmentedControl
            size="xs"
            fullWidth
            aria-label="Color range"
            data-testid="relative-color-range"
            value={value.range}
            onChange={(v) => set({ range: v === 'fit' ? 'fit' : 'fixed' })}
            data={[
              { value: 'fixed', label: 'Fixed' },
              { value: 'fit', label: 'Fit to view' },
            ]}
          />
        </Tip>
      )}
      {monzo && (
        <Tip k="relColorOctave" as="control" block>
          <SegmentedControl
            size="xs"
            fullWidth
            aria-label="Monzo octave"
            data-testid="relative-color-octave"
            value={value.octave}
            onChange={(v) => set({ octave: v === 'reduced' ? 'reduced' : 'exact' })}
            data={[
              { value: 'exact', label: 'Exact' },
              { value: 'reduced', label: 'Reduced' },
            ]}
          />
        </Tip>
      )}
      {shaded && (
        <Tip k="intervalIntensity" as="control" block>
          <div className={classes.metaTitle}>Interval intensity</div>
          <SegmentedControl
            size="xs"
            fullWidth
            orientation="vertical"
            aria-label="Interval intensity"
            data-testid="relative-color-emphasis"
            value={dev.intervalIntensity}
            onChange={(v) => setDev({ intervalIntensity: v === 'faint' ? 'faint' : 'strong' })}
            data={[
              { value: 'strong', label: 'Simple strong' },
              { value: 'faint', label: 'Complex strong' },
            ]}
          />
        </Tip>
      )}
    </>
  );
}

/** The panel box for Rings and Monzo: the Near panel's box and position (to the left of the ring square). */
export function RelativeColorPanel({ monzo, legend }: { monzo: boolean; legend?: ReactNode }) {
  return (
    <div className={classes.metaPanel} data-testid="relative-color-panel">
      <RelativeColorControls monzo={monzo} legend={legend} />
    </div>
  );
}
