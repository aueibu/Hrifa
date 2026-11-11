import { describe, expect, it } from 'vitest';
import {
  defaultMarkerHues,
  defaultMarkerRamp,
  hexToLinearRgb,
  linearContrast,
  markerColorHex,
  markerColorNames,
  markLinear,
  markTint,
} from './markers';
import { defaultThemeTokens as tokens } from './tokens';

type Rgb = [number, number, number];

const contrast = (first: string, second: string) =>
  linearContrast(hexToLinearRgb(first), hexToLinearRgb(second));

// The neutral roles, as steps of the shared ramps (see tokens.ts and semantic.ts).
const roles = {
  light: {
    page: tokens.gray[0],
    panel: tokens.white,
    hover: tokens.gray[1],
    border: tokens.gray[2],
    control: tokens.gray[4],
    subtle: tokens.gray[5],
    muted: tokens.gray[6],
    text: tokens.black,
  },
  dark: {
    page: tokens.dark[8],
    panel: tokens.dark[7],
    hover: tokens.dark[5],
    border: tokens.dark[5],
    control: tokens.dark[4],
    subtle: tokens.dark[3],
    muted: tokens.dark[2],
    text: tokens.dark[0],
  },
} as const;

const schemes = ['light', 'dark'] as const;

const tintBase = {
  light: { background: tokens.gray[1], hover: tokens.gray[2] },
  dark: { background: tokens.dark[6], hover: tokens.dark[5] },
} as const;

function lightnessOf(hex: string) {
  const [red, green, blue] = hexToLinearRgb(hex);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

describe('neutral roles', () => {
  it.each(schemes)('%s: text tiers read and recede in order', (scheme) => {
    const { panel, text, muted, subtle } = roles[scheme];
    expect(contrast(text, panel)).toBeGreaterThanOrEqual(7);
    expect(contrast(muted, panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(subtle, panel)).toBeGreaterThanOrEqual(4.5);
    // Muted text must visibly differ from main text, or the hierarchy collapses.
    expect(contrast(text, muted)).toBeGreaterThanOrEqual(1.5);
    expect(contrast(text, panel)).toBeGreaterThan(contrast(muted, panel));
    expect(contrast(muted, panel)).toBeGreaterThan(contrast(subtle, panel));
  });

  it.each(schemes)('%s: panels, borders and controls separate from what they sit on', (scheme) => {
    const { page, panel, hover, border, control } = roles[scheme];
    expect(contrast(panel, page)).toBeGreaterThanOrEqual(1.08);
    expect(contrast(hover, panel)).toBeGreaterThanOrEqual(1.15);
    expect(contrast(border, panel)).toBeGreaterThanOrEqual(1.3);
    // Input outlines and similar control boundaries need 3:1 against the panel.
    expect(contrast(control, panel)).toBeGreaterThanOrEqual(3);
  });

  it('dark: studio tiers climb well < page < panel < slot < body, each visibly apart', () => {
    const tiers = [
      tokens.dark[9], // well
      tokens.dark[8], // page
      tokens.dark[7], // panel
      tokens.dark[6], // slot
      tokens.dark[5], // body
    ];
    for (let index = 1; index < tiers.length; index += 1) {
      expect(contrast(tiers[index], tiers[index - 1]), `tier ${index}`).toBeGreaterThanOrEqual(1.08);
    }
    // Surfaces, borders and subtle text lean only slightly warm: red >= green >= blue, spread of 8 or less.
    for (const step of tokens.dark.slice(3)) {
      const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(step.slice(start, start + 2), 16));
      expect(red >= green && green >= blue && red - blue <= 8, step).toBe(true);
    }
  });

  it('keeps both neutral ramps in strict lightness order, lightest first', () => {
    const light = tokens.gray.map(lightnessOf);
    expect(light).toEqual([...light].sort((left, right) => right - left));
    const dark = tokens.dark.map(lightnessOf);
    expect(dark).toEqual([...dark].sort((left, right) => right - left));
    expect(new Set(light).size).toBe(10);
    expect(new Set(dark).size).toBe(10);
  });
});

describe('accent and filled colors', () => {
  it('holds white text at 4.5:1 or more on the primary shade in both schemes', () => {
    for (const scheme of schemes) {
      expect(contrast('#ffffff', tokens.primary[tokens.primaryShade[scheme]])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('holds white text at 4.5:1 or more on every hue at the shared filled step', () => {
    for (const name of markerColorNames) {
      const fill = markerColorHex(defaultMarkerHues[name], defaultMarkerRamp, 6);
      expect(contrast('#ffffff', fill), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('marks and tints', () => {
  it.each(schemes)('%s: every hue holds 3:1 as a mark on the panel', (scheme) => {
    const panel = hexToLinearRgb(roles[scheme].panel);
    for (const name of markerColorNames) {
      const mark = markLinear(defaultMarkerHues[name], scheme, name);
      expect(linearContrast(mark, panel), name).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(schemes)('%s: tint text keeps 7:1 on its faint fill', (scheme) => {
    for (const name of markerColorNames) {
      const tint = markTint(defaultMarkerHues[name], scheme, tintBase[scheme]);
      expect(contrast(tint.text, tint.background), name).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('categorical hue separation', () => {
  const core = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'pink'] as const;
  const matrices = {
    typical: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    deuteranopia: [
      [0.367322, 0.860646, -0.227968],
      [0.280085, 0.672501, 0.047413],
      [-0.01182, 0.04294, 0.968881],
    ],
    protanopia: [
      [0.152286, 1.052583, -0.204868],
      [0.114503, 0.786281, 0.099216],
      [-0.003882, -0.048116, 1.051998],
    ],
  };

  const simulate = (matrix: number[][], [red, green, blue]: Rgb): Rgb =>
    matrix.map((row) =>
      Math.min(1, Math.max(0, row[0] * red + row[1] * green + row[2] * blue))
    ) as Rgb;

  function oklab([red, green, blue]: Rgb) {
    const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
    const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
    const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }

  function closestPair(scheme: (typeof schemes)[number], matrix: number[][]) {
    const colors = core.map((name) =>
      simulate(matrix, markLinear(defaultMarkerHues[name], scheme, name))
    );
    let closest = Infinity;
    for (let first = 0; first < colors.length; first += 1) {
      for (let second = first + 1; second < colors.length; second += 1) {
        const [l1, a1, b1] = oklab(colors[first]);
        const [l2, a2, b2] = oklab(colors[second]);
        closest = Math.min(closest, Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100);
      }
    }
    return closest;
  }

  it.each(schemes)('%s: the eight core hues stay clearly apart for typical vision', (scheme) => {
    expect(closestPair(scheme, matrices.typical)).toBeGreaterThanOrEqual(7);
  });

  // Red and orange in light mode are the tightest pair under red-green color blindness; any view
  // that shows both together should add a dash pattern, shape or label as a second channel.
  it.each(schemes)('%s: no core pair collapses for red-green color blindness', (scheme) => {
    expect(closestPair(scheme, matrices.deuteranopia)).toBeGreaterThanOrEqual(4);
    expect(closestPair(scheme, matrices.protanopia)).toBeGreaterThanOrEqual(4);
  });
});
