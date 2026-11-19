import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SVG_FS_LABEL, SVG_FS_SMALL } from './state/typeScale';

const FILES = [
  'components/lab.module.css',
  'components/panels.module.css',
  'components/relativeMenu.module.css',
].map((f) => [f, readFileSync(new URL(f, import.meta.url), 'utf8')]);

describe('type scale (M8k)', () => {
  it('uses only the --lab-* tokens (or inherit, 1em, 0.92em) for font-size', () => {
    const bad: string[] = [];
    for (const [f, css] of FILES) {
      for (const m of css.matchAll(/(?:^|[\s;{])(--sc-)?font-size\s*:\s*([^;}]+)/g)) {
        const v = m[2].trim();
        // the Monzo matrix's compact digits (relativeMenu.module.css) are 0.85 x the small step: no exact --lab-fs-* match
        const ok = /^(inherit|0\.92em|1em|var\(--lab-[a-z-]+\))$/.test(v);
        if (!ok && v !== 'calc(var(--lab-fs-small) * 0.85)') {
          bad.push(`${f}: font-size: ${v}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('has no `font:` shorthand with a size (only `font: inherit`)', () => {
    const bad: string[] = [];
    for (const [f, css] of FILES) {
      for (const m of css.matchAll(/(?:^|[\s;{])font\s*:\s*([^;}]+)/g)) {
        if (m[1].trim() !== 'inherit') {
          bad.push(`${f}: font: ${m[1].trim()}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('SVG_FS_SMALL and SVG_FS_LABEL equal the --lab-svg-fs-* custom properties', () => {
    const css = FILES.map(([, c]) => c).join(' ');
    const px = (name: string) =>
      Number(new RegExp(String.raw`${name}\s*:\s*([0-9.]+)px`).exec(css)?.[1]);
    expect(px('--lab-svg-fs-small')).toBe(SVG_FS_SMALL);
    expect(px('--lab-svg-fs-label')).toBe(SVG_FS_LABEL);
  });

  it('defines each --lab-fs-* and --lab-svg-fs-* property once', () => {
    const seen = new Map<string, number>();
    for (const [, css] of FILES) {
      for (const m of css.matchAll(/(--lab-(?:fs|svg-fs)-[a-z-]+)\s*:/g)) {
        seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(8);
    expect([...seen].filter(([, n]) => n !== 1)).toEqual([]);
  });
});
