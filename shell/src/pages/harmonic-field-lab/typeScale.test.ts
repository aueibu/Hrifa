import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = [
  'components/lab.module.css',
  'components/panels.module.css',
  'components/relativeMenu.module.css',
].map((f) => [f, readFileSync(new URL(f, import.meta.url), 'utf8')]);

describe('type scale', () => {
  it('uses only --mantine-font-size-* or inherit for font-size', () => {
    const bad: string[] = [];
    for (const [f, css] of FILES) {
      for (const m of css.matchAll(/(?:^|[\s;{])(--sc-)?font-size\s*:\s*([^;}]+)/g)) {
        const v = m[2].trim();
        const ok = /^(inherit|var\(--mantine-font-size-(xs|sm|md|lg|xl)\))$/.test(v);
        if (!ok) {
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
});
