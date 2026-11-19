/**
 * M8o (H-37) + M9c (H-40): the Color controls of the Relative picker, one set per view (Rings, Near, Monzo: `ui.relColor.<view>` in
 * `settings.v1`); the panel shows and edits the OPEN view's choice.
 * Built like the Near panel (`metaPanel`: xs controls stacked in a 190 px column), top to bottom: a Preset select (one click sets the
 * channels; Custom when they match no preset), Measure (Step | Landing, M9d; not part of a preset), "Colors follow Alt" (G15, Rings and Near), Radius (Near only), Hue, Brightness, the legend, then Range (when Brightness has one),
 * the entropy blur s (when a channel uses entropy), Octave (Monzo only) and Interval intensity (the same `developer.v1`
 * `intervalIntensity` as the Developer menu entry and Pairs; when Brightness reads it). The Near panel embeds
 * `RelativeColorControls`; the other views wrap it in `RelativeColorPanel`, the same panel box.
 */
import type { ReactNode } from 'react';
import { NativeSelect, SegmentedControl } from '@mantine/core';
import { useLabDeveloperOptions } from '../state/developerOptions';
import {
  PRESET_CUSTOM,
  REL_BRIGHTS,
  REL_HUES,
  REL_PRESETS,
  REL_RADII,
  presetOf,
  usesEntropy,
  usesIntensity,
  usesRange,
  type RelBright,
  type RelColorView,
  type RelHue,
  type RelMonzoColor,
  type RelNearColor,
  type RelRadius,
} from '../state/intervalColor';
import { RADIUS_LABELS } from '../state/nearRadius';
import { HeBlurSlider } from './HeBlurSlider';
import { Tip, useLab } from './ui';
import classes from './relativeMenu.module.css';

/** The Hue choices, in the menu's order. */
export const HUE_LABELS: Record<RelHue, string> = {
  off: 'Off',
  prime: 'Prime',
  interval: 'Interval class',
  errorSign: 'Error sign',
  tenney: 'Tenney',
  odd: 'Odd limit',
  roughness: 'Roughness',
  entropy: 'Harmonic entropy',
  errorSize: '|error| vs 12-EDO',
};
/** The Brightness choices, in the menu's order. */
export const BRIGHT_LABELS: Record<RelBright, string> = {
  off: 'Off',
  tenney: 'Tenney',
  odd: 'Odd limit',
  roughness: 'Roughness',
  entropy: 'Harmonic entropy',
  errorSize: '|error| vs 12-EDO',
};

export function RelativeColorControls({
  monzo,
  near = false,
  legend,
}: {
  monzo: boolean;
  /** The Near panel's embedded controls (else Rings, or Monzo when `monzo`). */
  near?: boolean;
  /** The memoized legend (D23), drawn under the Brightness select. */
  legend?: ReactNode;
}) {
  const lab = useLab();
  const view: RelColorView = monzo ? 'monzo' : near ? 'near' : 'rings';
  const stored = lab.state.ui.relColor;
  const value: RelMonzoColor & RelNearColor = {
    octave: 'exact',
    radius: 'tenney',
    ...stored[view],
  };
  const [dev, setDev] = useLabDeveloperOptions();
  const set = (patch: Partial<RelMonzoColor & RelNearColor>) =>
    lab.dispatch({
      type: 'ui',
      patch: { relColor: { ...stored, [view]: { ...stored[view], ...patch } } },
    });
  const preset = presetOf({
    hue: value.hue,
    bright: value.bright,
    radius: near ? value.radius : undefined,
  });
  return (
    <>
      <Tip k="relColor" as="control" block>
        <div className={classes.metaTitle}>Color</div>
      </Tip>
      <Tip k="relColorPreset" as="control" block>
        <NativeSelect
          size="xs"
          aria-label="Color preset"
          data-testid="relative-color-preset"
          value={preset}
          onChange={(e) => {
            const p = REL_PRESETS.find((x) => x.id === e.currentTarget.value);
            if (p) {
              set(
                near
                  ? { hue: p.hue, bright: p.bright, radius: p.radius }
                  : { hue: p.hue, bright: p.bright }
              );
            }
          }}
          data={[
            ...REL_PRESETS.map((p) => ({ value: p.id, label: p.label })),
            { value: PRESET_CUSTOM, label: 'Custom', disabled: true },
          ]}
        />
      </Tip>
      <Tip k="relColorMeasure" as="control" block>
        <SegmentedControl
          size="xs"
          fullWidth
          aria-label="Color measure"
          data-testid="relative-color-measure"
          value={value.measure}
          onChange={(v) => set({ measure: v === 'landing' ? 'landing' : 'step' })}
          data={[
            { value: 'step', label: 'Step' },
            { value: 'landing', label: 'Landing' },
          ]}
        />
      </Tip>
      {!monzo && (
        <Tip k="relColorFollowAlt" as="control" block>
          <label className={classes.metaCheck}>
            <input
              type="checkbox"
              data-testid="relative-color-follow-alt"
              checked={value.followAlt}
              onChange={(e) => set({ followAlt: e.currentTarget.checked })}
            />
            Colors follow Alt
          </label>
        </Tip>
      )}
      {near && (
        <Tip k="relColorRadius" as="control" block>
          <div className={classes.metaTitle}>Radius</div>
          <NativeSelect
            size="xs"
            aria-label="Radius"
            data-testid="relative-radius"
            value={value.radius}
            onChange={(e) => {
              const v = e.currentTarget.value;
              set({ radius: REL_RADII.find((m) => m === v) ?? value.radius });
            }}
            data={REL_RADII.map((m: RelRadius) => ({ value: m, label: RADIUS_LABELS[m] }))}
          />
        </Tip>
      )}
      <Tip k="relColorHue" as="control" block>
        <div className={classes.metaTitle}>Hue</div>
        <NativeSelect
          size="xs"
          aria-label="Hue"
          data-testid="relative-hue"
          value={value.hue}
          onChange={(e) => {
            const v = e.currentTarget.value;
            set({ hue: REL_HUES.find((h) => h === v) ?? value.hue });
          }}
          data={REL_HUES.map((h) => ({ value: h, label: HUE_LABELS[h] }))}
        />
      </Tip>
      <Tip k="relColorBright" as="control" block>
        <div className={classes.metaTitle}>Brightness</div>
        <NativeSelect
          size="xs"
          aria-label="Brightness"
          data-testid="relative-bright"
          value={value.bright}
          onChange={(e) => {
            const v = e.currentTarget.value;
            set({ bright: REL_BRIGHTS.find((b) => b === v) ?? value.bright });
          }}
          data={REL_BRIGHTS.map((b) => ({ value: b, label: BRIGHT_LABELS[b] }))}
        />
      </Tip>
      {legend}
      {usesRange(value) && (
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
      {usesEntropy({
        hue: value.hue,
        bright: value.bright,
        radius: near ? value.radius : undefined,
      }) && <HeBlurSlider />}
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
      {(usesIntensity(value.bright) || usesRange(value)) && (
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
