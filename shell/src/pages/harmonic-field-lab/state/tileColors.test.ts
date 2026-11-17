import { describe, expect, it } from 'vitest';
import { hexToLinearRgb, linearContrast } from '../../../theme/markers';
import { RADIX, RADIX_HUES, radixHex, type RadixHue } from '../../../theme/radix';
import { defaultThemeTokens as T } from '../../../theme/tokens';
import { severity } from '../components/ui';
import {
  RED_TINT_STEP,
  SEV1_MIX,
  SEV_HUES,
  sevTileColors,
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
  ...SEV_HUES.filter((h): h is RadixHue => h !== null).map((h) => ({
    name: `sev ${h}`,
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

describe('error band colors (M4c, H-25): one warm heat family', () => {
  it('no band maps to cyan or green; band 0 is neutral; bands 2, 3, 4 are yellow, orange, red', () => {
    expect(SEV_HUES).toEqual([null, 'yellow', 'yellow', 'orange', 'red']);
    for (const look of TILE_LOOKS) {
      for (const outline of [false, true]) {
        for (const scheme of SCHEMES) {
          for (let s = 0; s < 5; s++) {
            const c = sevTileColors(look, outline, s, scheme);
            const all = JSON.stringify(c);
            expect(all, `${look} ${s}`).not.toMatch(/cyan|green|blue/);
            if (s === 0) {
              expect(all, `${look} neutral`).not.toMatch(/--rx-/);
              expect(c.text).toBe('var(--text)');
              // a fill a little lighter than the surface, so the tile does not blend into the screen
              expect(c.fill).toMatch(/--text\) 14%|var\(--panel\)/);
            } else {
              const hue = ['', 'yellow', 'yellow', 'orange', 'red'][s];
              expect(all, `${look} ${s}`).toContain(`--rx-${hue}-`);
            }
          }
        }
      }
    }
  });
  it('band 1 is a faint yellow hint mixed into the text color and the surface', () => {
    const c = sevTileColors('tinted', false, 1, 'light');
    expect(c.text).toBe(`color-mix(in srgb, var(--rx-yellow-11) ${SEV1_MIX.text}%, var(--text))`);
    expect(c.fill).toContain('var(--rx-yellow-4) 30%');
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

describe('the worst band tile (red) is lifted in the Tinted look only', () => {
  it('uses RED_TINT_STEP for the band 4 Tinted fill and leaves the other fills alone', () => {
    for (const scheme of SCHEMES) {
      expect(sevTileColors('tinted', false, 4, scheme).fill).toBe(`var(--rx-red-${RED_TINT_STEP})`);
      expect(RED_TINT_STEP).toBeGreaterThan(TILE.tinted.fill.normal);
      expect(sevTileColors('tinted', false, 3, scheme).fill).toBe(
        `var(--rx-orange-${TILE.tinted.fill.normal})`
      );
      expect(sevTileColors('tinted', false, 2, scheme).fill).toBe(
        `var(--rx-yellow-${TILE.tinted.fill.normal})`
      );
      expect(sevTileColors('solid', false, 4, scheme).fill).not.toContain(`red-${RED_TINT_STEP}`);
    }
  });
});
