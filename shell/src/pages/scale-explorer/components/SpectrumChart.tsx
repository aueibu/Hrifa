import { SegmentedControl } from '@mantine/core';
import { spectrumOf, SPECTRUM_COMPONENTS } from '../spectrum';
import { ROLE, STROKE, useScaleStyle } from '../useScaleStyle';
import classes from '../ScaleExplorer.module.css';

export type SpectrumMode = 'comp' | 'set';

export interface SpectrumSet {
  name: string;
  abs: number[];
  /** 'L' is the loaded set; 0-3 are comparison slots. */
  slot: 'L' | number;
}

const W = 420;
const H = 170;
const BASE = 112;
const TOP = 22;

interface SpectrumChartProps {
  sets: SpectrumSet[];
  mode: SpectrumMode;
  label: string;
}

/** Fourier power of the loaded set and any comparison sets, grouped by component or by scale. */
export function SpectrumChart({ sets, mode, label }: SpectrumChartProps) {
  const style = useScaleStyle();
  const spectra = sets.map((o) => spectrumOf(o.abs));
  const maxP = Math.max(1, ...spectra.flatMap((s) => s.map((t) => t.pow)));
  const nS = sets.length;

  if (mode === 'set') {
    // one group per scale, so its whole profile reads as a single block of six bars
    const G = (W - 20) / nS;
    const bw = Math.min(22, (G - 14) / 6);
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        <line
          stroke={ROLE.border}
          strokeWidth={STROKE.hairline}
          x1={10}
          y1={BASE}
          x2={W - 10}
          y2={BASE}
        />
        {sets.map((o, qi) => {
          const gx0 = 10 + qi * G + G / 2;
          const start = gx0 - 3 * bw;
          return (
            <g key={qi}>
              {qi > 0 && (
                <line
                  stroke={ROLE.border}
                  strokeWidth={STROKE.hairline}
                  strokeDasharray="2 3"
                  x1={10 + qi * G}
                  y1={TOP}
                  x2={10 + qi * G}
                  y2={BASE + 30}
                />
              )}
              {spectra[qi].map((t, k) => {
                const h = (t.pow / maxP) * (BASE - TOP);
                const x = start + k * bw;
                return (
                  <g key={k}>
                    <rect
                      fill={style.slotColor(o.slot)}
                      x={x}
                      y={BASE - h}
                      width={bw - 1.5}
                      height={Math.max(h, 0.5)}
                    >
                      <title>{`${o.name}, ${SPECTRUM_COMPONENTS[k].id} ${SPECTRUM_COMPONENTS[k].name}: power ${t.pow.toFixed(2)} of a possible ${o.abs.length * o.abs.length}`}</title>
                    </rect>
                    {bw >= 15 && (
                      <text className={classes.chartSmall} x={x + (bw - 1.5) / 2} y={BASE - h - 3}>
                        {t.pow.toFixed(1)}
                      </text>
                    )}
                    <text className={classes.chartSmall} x={x + (bw - 1.5) / 2} y={BASE + 11}>
                      {SPECTRUM_COMPONENTS[k].id}
                    </text>
                  </g>
                );
              })}
              <text
                className={classes.specSetName}
                fill={style.slotColor(o.slot)}
                x={gx0}
                y={BASE + 26}
              >
                {o.name}
              </text>
            </g>
          );
        })}
        <text className={`${classes.chartText} ${classes.chartStart}`} x={10} y={12}>
          Power
        </text>
      </svg>
    );
  }

  const gw = (W - 20) / 6;
  const bw = Math.min(22, (gw - 10) / nS);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      <line
        stroke={ROLE.border}
        strokeWidth={STROKE.hairline}
        x1={10}
        y1={BASE}
        x2={W - 10}
        y2={BASE}
      />
      {SPECTRUM_COMPONENTS.map((c, k) => {
        const gx = 10 + k * gw + gw / 2;
        const start = gx - (nS * bw) / 2;
        return (
          <g key={c.id}>
            {sets.map((o, qi) => {
              const pow = spectra[qi][k].pow;
              const h = (pow / maxP) * (BASE - TOP);
              const x = start + qi * bw;
              return (
                <g key={qi}>
                  <rect
                    fill={style.slotColor(o.slot)}
                    x={x}
                    y={BASE - h}
                    width={bw - 1.5}
                    height={Math.max(h, 0.5)}
                  >
                    <title>{`${o.name}, ${c.id} power ${pow.toFixed(2)} of a possible ${o.abs.length * o.abs.length}`}</title>
                  </rect>
                  {nS === 1 && (
                    <text className={classes.chartSmall} x={x + bw / 2} y={BASE - h - 3}>
                      {pow.toFixed(1)}
                    </text>
                  )}
                </g>
              );
            })}
            <text className={`${classes.chartText} ${classes.chartStrong}`} x={gx} y={BASE + 14}>
              {c.id}
            </text>
            <text className={classes.chartText} x={gx} y={BASE + 27}>
              {c.name}
              <title>{c.hint}</title>
            </text>
          </g>
        );
      })}
      <text className={`${classes.chartText} ${classes.chartStart}`} x={10} y={12}>
        Power
      </text>
    </svg>
  );
}

interface SpectrumModeToggleProps {
  value: SpectrumMode;
  onChange: (mode: SpectrumMode) => void;
}

export function SpectrumModeToggle({ value, onChange }: SpectrumModeToggleProps) {
  return (
    <SegmentedControl
      size="xs"
      value={value}
      onChange={(v) => onChange(v as SpectrumMode)}
      data={[
        { value: 'comp', label: 'By Component' },
        { value: 'set', label: 'By Scale' },
      ]}
    />
  );
}
