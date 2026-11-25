import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexToLinearRgb, linearContrast, markHex, markTint } from '../../../theme/markers';
import { defaultThemeTokens as T } from '../../../theme/tokens';

/**
 * The lab's red text (a can't-read message, a refusal, an alert note, an input error) uses the
 * theme role `--text-danger`, not `--mark-red` and not Mantine's own red. The theme points `--mantine-color-error` at
 * it, so the lab only sizes the message (the role itself is tested in src/theme/danger.test.ts).
 */
function danger(scheme: 'light' | 'dark') {
  if (scheme === 'light') {
    const channel = (hex: string, i: number) =>
      Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const red = markHex(T.markerHues.red, 'light', 'red');
    const text = `#${[0, 1, 2]
      .map((i) =>
        Math.round(channel(red, i) * 0.85 + channel(T.black, i) * 0.15)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')}`;
    return { text, surfaces: [T.white, T.gray[1], T.white] };
  }
  const tint = markTint(T.markerHues.red, 'dark', { background: T.dark[6], hover: T.dark[5] });
  return { text: tint.text, surfaces: [T.dark[7], T.dark[6], T.dark[6]] };
}

describe('red text role', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: --text-danger keeps at least 4.5:1 on the panel, the slot and the input background`, () => {
      const { text, surfaces } = danger(scheme);
      for (const bg of surfaces) {
        expect(linearContrast(hexToLinearRgb(text), hexToLinearRgb(bg))).toBeGreaterThanOrEqual(
          4.5
        );
      }
    });
  }

  it('both lab CSS modules use --text-danger for the red text rules and size the input message from the lab type scale', () => {
    for (const f of ['lab', 'panels']) {
      const css = readFileSync(new URL(`../components/${f}.module.css`, import.meta.url), 'utf8');
      expect(css).not.toMatch(/errorScope/);
      expect(css).not.toMatch(/--tint-red-text/);
      expect(css).toMatch(/p\.inputError\s*\{[^}]*font-size:\s*var\(--mantine-font-size-sm\)/);
    }
    const lab = readFileSync(new URL('../components/lab.module.css', import.meta.url), 'utf8');
    const panels = readFileSync(
      new URL('../components/panels.module.css', import.meta.url),
      'utf8'
    );
    expect(lab).toMatch(/\.fieldMsg\[data-kind=["']err["']\]\s*\{\s*color:\s*var\(--text-danger\)/);
    // the error text is no longer red (H-38: orange sharp, cyan flat, set inline); it must not use the danger role either
    expect(panels).not.toMatch(/\.err\[data-sev/);
    expect(panels).toMatch(/\.shelfRefusal\s*\{\s*color:\s*var\(--text-danger\)/);
    expect(panels).toMatch(
      /\.sendNote\[data-alert\]\s*\{\s*border-color:\s*var\(--mark-red\);\s*color:\s*var\(--text-danger\)/
    );
  });

  it('every lab input with an error prop carries the inputError message class', () => {
    const dir = new URL('../components/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.tsx'));
    let withError = 0;
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      const uses = (src.match(/\berror=\{/g) ?? []).length;
      if (uses === 0) {
        continue;
      }
      withError += uses;
      const scoped = (src.match(/classNames=\{\{\s*error:\s*classes\.inputError\s*\}\}/g) ?? [])
        .length;
      expect(scoped, `${f}: ${uses} error props, ${scoped} with inputError`).toBe(uses);
    }
    expect(withError).toBeGreaterThanOrEqual(3);
  });

  it('the lab CSS sets no text color from --mark-red, --tint-red-text or Mantine red', () => {
    for (const f of ['lab', 'panels']) {
      const css = readFileSync(new URL(`../components/${f}.module.css`, import.meta.url), 'utf8');
      expect(css).not.toMatch(/(^|[\s;{])color:\s*var\(--mark-red\)/);
      expect(css).not.toMatch(/(^|[\s;{])color:\s*var\(--tint-red-text\)/);
      expect(css).not.toMatch(/(^|[\s;{])color:\s*var\(--mantine-color-(red|error)/);
    }
  });
});
