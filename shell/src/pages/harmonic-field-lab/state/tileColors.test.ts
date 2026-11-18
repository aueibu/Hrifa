import { describe, expect, it } from 'vitest';
import { hexToLinearRgb, linearContrast } from '../../../theme/markers';
import { RADIX, RADIX_HUES, radixHex, type RadixHue } from '../../../theme/radix';
import { defaultThemeTokens as T } from '../../../theme/tokens';
import { severity } from '../components/ui';
import {
  BAND4_LIFT,
  BAND_TEXT_MIX,
  FLAT_HUE,
  SHARP_HUE,
  SIGNED_BANDS,
  signedBand,
  signedBandTextColor,
  signedErrorHue,
  signedErrorTextColor,
  signedErrorTile,
  TILE,
  TILE_LOOKS,
  reachBackground,
  tileColors,
  tileStyle,
  wheelHue,
  type TileHue,
  type TileLevel,
  type TileLook,
  type TileScheme,
} from './tileColors';

const SCHEMES: readonly TileScheme[] = ['light', 'dark'];
const LEVELS: readonly TileLevel[] = ['faint', 'normal', 'strong'];
const MIN = 4.5;

const PANEL: Record<TileScheme, string> = { light: T.white, dark: T.dark[7] };
const SLOT: Record<TileScheme, string> = { light: T.gray[1], dark: T.dark[6] };

/** The hex colors a color string stands for: one per hue end (a blend has two, in order a, b). */
function ends(value: string, scheme: TileScheme): string[] {
  if (value === 'var(--panel-slot)') {
    return [SLOT[scheme]];
  }
  if (value === 'var(--mantine-color-black)') {
    return [T.black];
  }
  if (value === 'var(--mantine-color-white)') {
    return [T.white];
  }
  const refs = [...value.matchAll(/var\(--rx-([a-z]+)-(\d+)\)/g)];
  expect(refs.length, value).toBeGreaterThan(0);
  return refs.map((m) => radixHex(scheme, m[1] as RadixHue, Number(m[2])));
}

/** The worse contrast over the ends of a (possibly blended) text color on a (possibly blended) background. */
function contrast(fg: string, bg: string, scheme: TileScheme): number {
  const f = ends(fg, scheme);
  const b = ends(bg, scheme);
  const n = Math.max(f.length, b.length);
  let worst = Infinity;
  for (let i = 0; i < n; i++) {
    const ratio = linearContrast(
      hexToLinearRgb(f[Math.min(i, f.length - 1)]),
      hexToLinearRgb(b[Math.min(i, b.length - 1)])
    );
    worst = Math.min(worst, ratio);
  }
  return worst;
}

const hues = (): { name: string; hue: TileHue }[] => [
  ...[SHARP_HUE, FLAT_HUE].map((h) => ({
    name: `signed error ${h}`,
    hue: { a: h },
  })),
  ...RADIX_HUES.map((h) => ({ name: `wheel ${h}`, hue: { a: h } })),
  // in-between wheel positions blend two hues
  ...[0.0625, 0.3, 0.5, 0.8125].map((p) => ({ name: `wheel @${p}`, hue: wheelHue(p) })),
];

const cases: {
  label: string;
  scheme: TileScheme;
  look: TileLook;
  outline: boolean;
  level: TileLevel;
  hue: TileHue;
}[] = [];
for (const scheme of SCHEMES) {
  for (const look of TILE_LOOKS) {
    for (const outline of [false, true]) {
      for (const level of LEVELS) {
        for (const { name, hue } of hues()) {
          cases.push({
            label: `${scheme} ${look} outline=${outline} ${level} ${name}`,
            scheme,
            look,
            outline,
            level,
            hue,
          });
        }
      }
    }
  }
}

describe('tile colors: text contrast', () => {
  it('every tile text reaches 4.5:1 on its fill (Solid: the picked black or white)', () => {
    for (const c of cases) {
      const t = tileColors(c.look, c.outline, c.level, c.hue, c.scheme);
      expect(contrast(t.text, t.fill, c.scheme), c.label).toBeGreaterThanOrEqual(MIN);
    }
  });

  it('dimmed tiles keep 4.5:1 text on the dim fill', () => {
    for (const c of cases) {
      const t = tileColors(c.look, c.outline, c.level, c.hue, c.scheme);
      expect(contrast(t.dimText, t.dimFill, c.scheme), c.label).toBeGreaterThanOrEqual(MIN);
    }
  });

  it('worst cases: Solid strong red, Outlined text on the slot', () => {
    for (const scheme of SCHEMES) {
      const red = tileColors('solid', false, 'strong', { a: 'red' }, scheme);
      expect(
        contrast(red.text, red.fill, scheme),
        `solid strong red ${scheme}`
      ).toBeGreaterThanOrEqual(MIN);
      for (const hue of RADIX_HUES) {
        const o = tileColors('outlined', false, 'normal', { a: hue }, scheme);
        expect(o.fill).toBe('var(--panel-slot)');
        expect(
          contrast(o.text, o.fill, scheme),
          `outlined ${hue} ${scheme}`
        ).toBeGreaterThanOrEqual(MIN);
      }
    }
  });
});

describe('tile colors: borders', () => {
  it('every border step used exists in the table', () => {
    const steps = new Set<number>();
    for (const c of cases) {
      const t = tileColors(c.look, c.outline, c.level, c.hue, c.scheme);
      for (const v of [t.border, t.dimBorder]) {
        for (const m of v.matchAll(/--rx-([a-z]+)-(\d+)\)/g)) {
          steps.add(Number(m[2]));
          expect(RADIX[c.scheme][m[1] as RadixHue][Number(m[2]) - 1], c.label).toMatch(
            /^#[0-9a-f]{6}$/
          );
        }
      }
    }
    expect([...steps].every((s) => s >= 2 && s <= 12)).toBe(true);
  });

  it('the stacked Tinted border is not weaker than the fill against the panel', () => {
    for (const scheme of SCHEMES) {
      for (const level of LEVELS) {
        for (const { name, hue } of hues()) {
          const t = tileColors('tinted', true, level, hue, scheme);
          const panel = hexToLinearRgb(PANEL[scheme]);
          const against = (v: string) =>
            Math.min(...ends(v, scheme).map((h) => linearContrast(hexToLinearRgb(h), panel)));
          expect(against(t.border), `${scheme} ${level} ${name}`).toBeGreaterThanOrEqual(
            against(t.fill)
          );
        }
      }
    }
  });

  it('the TILE constants refer only to steps 2 to 12', () => {
    const nums: number[] = [];
    const walk = (v: unknown, key: string) => {
      if (typeof v === 'number') {
        if (key !== 'solidMinContrast') {
          nums.push(v);
        }
      } else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          walk(x, k);
        }
      }
    };
    walk(TILE, '');
    expect(nums.length).toBeGreaterThan(10);
    for (const n of nums) {
      expect(Number.isInteger(n) && n >= 2 && n <= 12, String(n)).toBe(true);
    }
  });
});

describe('the signed error scale (H-38): orange sharp, cyan flat, strength by band, exact neutral', () => {
  it('the hues are the tuner strip: sharp orange, flat cyan', () => {
    expect(SHARP_HUE).toBe('orange');
    expect(FLAT_HUE).toBe('cyan');
  });
  it('the four 12-EDO examples', () => {
    // 3/2 is +2.0 c: band 1, sharp, orange
    expect(signedBand(2.0)).toBe(1);
    expect(signedErrorHue(2.0)).toBe('orange');
    // 5/4 is -13.7 c: band 2, flat, cyan
    expect(signedBand(-13.7)).toBe(-2);
    expect(signedErrorHue(-13.7)).toBe('cyan');
    // 7/4 is -31.2 c: band 4, flat, cyan
    expect(signedBand(-31.2)).toBe(-4);
    expect(signedErrorHue(-31.2)).toBe('cyan');
    // 81/80 is +21.5 c: band 3, sharp, orange
    expect(signedBand(21.5)).toBe(3);
    expect(signedErrorHue(21.5)).toBe('orange');
    for (const scheme of SCHEMES) {
      expect(JSON.stringify(signedErrorTile(2.0, 'tinted', false, scheme))).toContain(
        '--rx-orange-'
      );
      expect(signedErrorTile(-13.7, 'tinted', false, scheme).fill).toBe(
        `var(--rx-cyan-${TILE.tinted.fill.normal})`
      );
      expect(signedErrorTile(-31.2, 'tinted', false, scheme).fill).toBe(
        `var(--rx-cyan-${BAND4_LIFT.tinted})`
      );
      expect(signedErrorTile(21.5, 'tinted', false, scheme).fill).toBe(
        `var(--rx-orange-${TILE.tinted.fill.strong})`
      );
      expect(signedErrorTile(2.0, 'tinted', false, scheme).fill).toBe(
        `var(--rx-orange-${TILE.tinted.fill.faint})`
      );
    }
  });
  it('exact is neutral (no hue, plain text), also for a tiny error and -0', () => {
    expect(signedBand(0)).toBe(0);
    expect(signedBand(-0.0000001)).toBe(0);
    expect(signedErrorHue(0)).toBeNull();
    for (const look of TILE_LOOKS) {
      for (const outline of [false, true]) {
        for (const scheme of SCHEMES) {
          const c = signedErrorTile(0, look, outline, scheme);
          expect(JSON.stringify(c), look).not.toMatch(/--rx-/);
          expect(c.text).toBe('var(--text)');
          // a fill a little lighter than the surface, so the tile does not blend into the screen
          expect(c.fill).toMatch(/--text\) 14%|var\(--panel\)/);
        }
      }
    }
    expect(signedErrorTextColor(0)).toBe('var(--text)');
  });
  it('every inexact band uses only its own hue (never red, yellow, green) in every look, and the two signs are mirror images', () => {
    for (const look of TILE_LOOKS) {
      for (const outline of [false, true]) {
        for (const scheme of SCHEMES) {
          for (const band of SIGNED_BANDS) {
            if (band === 0) {
              continue;
            }
            const all = JSON.stringify(signedErrorTile(band * 8, look, outline, scheme));
            const hue = band > 0 ? 'orange' : 'cyan';
            const other = band > 0 ? 'cyan' : 'orange';
            expect(all, `${look} ${band}`).toContain(`--rx-${hue}-`);
            expect(all, `${look} ${band}`).not.toMatch(new RegExp(`${other}|red|yellow|green`));
          }
        }
      }
    }
  });
  it('the fill gets stronger band by band in the Tinted look (3, 4, 5, then the lifted step)', () => {
    const steps = [2, 7, 20, 40].map((e) => {
      const m = signedErrorTile(e, 'tinted', false, 'light').fill.match(/-(\d+)\)$/);
      return Number(m![1]);
    });
    expect(steps).toEqual([
      TILE.tinted.fill.faint,
      TILE.tinted.fill.normal,
      TILE.tinted.fill.strong,
      BAND4_LIFT.tinted,
    ]);
    expect(BAND4_LIFT.tinted).toBeGreaterThan(TILE.tinted.fill.strong);
  });
  it('text-only values: the hue text step mixed in by band, full at band 4', () => {
    expect(signedErrorTextColor(2.0)).toBe(
      `color-mix(in srgb, var(--rx-orange-11) ${BAND_TEXT_MIX[1]}%, var(--text))`
    );
    expect(signedErrorTextColor(-13.7)).toBe(
      `color-mix(in srgb, var(--rx-cyan-11) ${BAND_TEXT_MIX[2]}%, var(--text))`
    );
    expect(signedErrorTextColor(-31.2)).toBe('var(--rx-cyan-11)');
    expect(signedErrorTextColor(21.5)).toBe(signedBandTextColor(3));
  });
  it('the thresholds are unchanged', () => {
    expect(severity(0)).toBe(0);
    expect(severity(0.0000005)).toBe(0);
    expect(severity(1)).toBe(1);
    expect(severity(4.99)).toBe(1);
    expect(severity(5)).toBe(2);
    expect(severity(14.99)).toBe(2);
    expect(severity(15)).toBe(3);
    expect(severity(29.99)).toBe(3);
    expect(severity(30)).toBe(4);
  });
});

describe('tint band (H-23)', () => {
  const tint = 'var(--rx-red-4)';
  it('center mode: hard two-position stops around the centered band', () => {
    expect(reachBackground(tint, 100)).toBe(
      `linear-gradient(to right, transparent 0 0%, ${tint} 0% 100%, transparent 100% 100%)`
    );
    expect(reachBackground(tint, 67.5)).toBe(
      `linear-gradient(to right, transparent 0 16.25%, ${tint} 16.25% 83.75%, transparent 83.75% 100%)`
    );
    expect(reachBackground(tint, 35)).toBe(
      `linear-gradient(to right, transparent 0 32.5%, ${tint} 32.5% 67.5%, transparent 67.5% 100%)`
    );
  });
  it('left mode: the band starts at the left edge', () => {
    expect(reachBackground(tint, 67.5, 'left')).toBe(
      `linear-gradient(to right, ${tint} 0 67.5%, transparent 67.5% 100%)`
    );
    expect(reachBackground(tint, 100, 'left')).toBe(
      `linear-gradient(to right, ${tint} 0 100%, transparent 100% 100%)`
    );
  });
  it('Tinted and Outlined carry the Tinted fill step in bg and the dim step in dimBg, same positions; Solid has none', () => {
    const red = { a: 'red' as const };
    for (const band of ['center', 'left'] as const) {
      for (const look of ['tinted', 'outlined'] as const) {
        const t = tileColors(look, true, 'normal', red, 'light', 67.5, band);
        expect(t.bg).toBe(reachBackground('var(--rx-red-4)', 67.5, band));
        expect(t.dimBg).toBe(reachBackground('var(--rx-red-2)', 67.5, band));
        expect(t.bg).not.toContain('radial');
      }
      const solid = tileColors('solid', true, 'normal', red, 'light', 67.5, band);
      expect(solid.bg).toBeUndefined();
      expect(solid.dimBg).toBeUndefined();
    }
    expect(tileColors('tinted', true, 'normal', red, 'light').dimBg).toBeUndefined();
    const style = tileStyle(tileColors('outlined', true, 'normal', red, 'light', 67.5));
    expect(style).toHaveProperty('--mx-bg');
    expect(style).toHaveProperty('--mx-dim-bg');
    expect(tileStyle(tileColors('solid', true, 'normal', red, 'light', 67.5))).not.toHaveProperty(
      '--mx-bg'
    );
  });
});
