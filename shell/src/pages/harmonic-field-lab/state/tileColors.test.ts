import { describe, expect, it } from 'vitest';
import { hexToLinearRgb, linearContrast } from '../../../theme/markers';
import { RADIX, RADIX_HUES, radixHex, type RadixHue } from '../../../theme/radix';
import { defaultThemeTokens as T } from '../../../theme/tokens';
import {
  SEV_HUES,
  TILE,
  TILE_LOOKS,
  tileColors,
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
  ...SEV_HUES.map((h) => ({ name: `sev ${h}`, hue: { a: h } })),
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
