import type { IntervalPlacementStyle } from '../../../theme/diagram';
import { intervalColor, intervalLightness } from '../visuals';

const SEMIS: Record<string, number> = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  F: 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11,
};

const MARKER_FRETS = new Set([0, 3, 5, 7, 9]);
const FRET_COUNT = 24;

/** Relative fret-width weights (fret 0 widest, narrowing toward the bridge) — unitless, used as CSS grid `fr` shares. */
const FRET_WEIGHTS = (() => {
  const decay = (1 / 1.3) ** (1 / 11);
  return Array.from({ length: FRET_COUNT + 1 }, (_, idx) =>
    idx === 0 ? 1 : Math.max(0.6, decay ** (idx - 1))
  );
})();

/** `minmax(0, Nfr)`, not plain `Nfr` — otherwise the fixed-size pitch dots force their track's min-content
 *  above its fr share, which can push the grid past 100% width and bring back the scrollbar this avoids. */
const GRID_TEMPLATE = FRET_WEIGHTS.map((w) => `minmax(0, ${w}fr)`).join(' ');

function parseTuning(text: string): number[] {
  if (!text) {
    return [];
  }
  const tokens = text.trim().includes(' ')
    ? text.trim().split(/\s+/)
    : text.match(/[A-Ga-g](?:#|b)?/g) || [];
  return tokens.map((t) => SEMIS[t.toUpperCase()]).filter((v): v is number => v !== undefined);
}

interface FretboardViewProps {
  pitches: number[];
  hoverPitch: number | null;
  baseMidi: number;
  edoSteps: number;
  tuning: string;
  style: IntervalPlacementStyle;
  onHoverPitch: (pitch: number | null) => void;
}

/**
 * React port of the source tool's `renderFretboard`: a fret grid for a
 * parsed guitar tuning. Uses a CSS grid with `fr`-weighted columns (matching
 * the original's narrowing-toward-the-bridge proportions) instead of fixed
 * pixel widths, so the whole board always fills its container exactly — no
 * horizontal scrollbar regardless of window width. Fret/string lines mix
 * `style.neutral` (the theme's text color) via `color-mix()` at
 * `boardLineOpacity`/`boardMarkerOpacity` rather than a literal rgba —
 * that keeps them theme-resolved (works with any underlying color function,
 * oklch included) while still reading clearly in both schemes.
 */
export function FretboardView({
  pitches,
  hoverPitch,
  baseMidi,
  edoSteps,
  tuning,
  style,
  onHoverPitch,
}: FretboardViewProps) {
  if (edoSteps !== 12) {
    return <div style={{ fontSize: 12, opacity: 0.6 }}>Fretboard view uses 12-EDO.</div>;
  }
  const tuningPcs = parseTuning(tuning);
  if (!tuningPcs.length) {
    return <div style={{ fontSize: 12, opacity: 0.6 }}>Enter a tuning to show the fretboard.</div>;
  }
  const pitchMidis = pitches.map((p) => baseMidi + p);
  const activeMidis = new Set(pitchMidis);
  const midiToPitch = new Map(pitchMidis.map((midi, idx) => [midi, pitches[idx]]));
  const hoverMidi = hoverPitch === null ? null : baseMidi + hoverPitch;

  const openMidis: number[] = [];
  tuningPcs.forEach((pc, idx) => {
    if (idx === 0) {
      const offsetDown = (baseMidi - pc + 12) % 12;
      openMidis.push(baseMidi - offsetDown);
      return;
    }
    const prev = openMidis[idx - 1];
    let offsetUp = (pc - (prev % 12) + 12) % 12;
    if (offsetUp === 0) {
      offsetUp = 12;
    }
    openMidis.push(prev + offsetUp);
  });

  const rows = [...openMidis].reverse();
  const fretLine = `color-mix(in srgb, ${style.neutral} ${style.boardLineOpacity * 100}%, transparent)`;
  const markerFill = `color-mix(in srgb, ${style.neutral} ${style.boardMarkerOpacity * 100}%, transparent)`;

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: GRID_TEMPLATE,
          gap: 2,
          fontSize: 9,
          opacity: 0.6,
          marginBottom: 4,
        }}
      >
        {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => (
          <div key={fret} style={{ textAlign: 'center' }}>
            {fret === 0 ? 'OPEN' : MARKER_FRETS.has(fret % 12) ? fret : ''}
          </div>
        ))}
      </div>
      {rows.map((openMidi, rowIdx) => (
        <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: GRID_TEMPLATE, gap: 2 }}>
          {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => {
            const midi = openMidi + fret;
            const isActive = activeMidis.has(midi);
            const pitch = midiToPitch.get(midi);
            const color = Number.isFinite(pitch)
              ? intervalColor(pitch as number, edoSteps, style.isDark)
              : undefined;
            const dotTextColor = Number.isFinite(pitch)
              ? intervalLightness(pitch as number, edoSteps, style.isDark) < 55
                ? 'var(--mantine-color-white)'
                : 'var(--mantine-color-black)'
              : undefined;
            const isMarker = MARKER_FRETS.has(fret % 12);
            return (
              <div
                key={fret}
                onMouseEnter={() => Number.isFinite(pitch) && onHoverPitch(pitch as number)}
                onMouseLeave={() => onHoverPitch(null)}
                style={{
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isMarker ? markerFill : 'transparent',
                  borderBottom: `1px solid ${fretLine}`,
                  borderRight: fret < FRET_COUNT ? `1px solid ${fretLine}` : undefined,
                  cursor: isActive ? 'pointer' : 'default',
                }}
              >
                {isActive && (
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: color,
                      outline:
                        hoverMidi === midi ? `2px solid ${style.base.hoverHighlight}` : undefined,
                      outlineOffset: 1,
                      fontSize: 9,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: dotTextColor,
                    }}
                  >
                    {pitch}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
