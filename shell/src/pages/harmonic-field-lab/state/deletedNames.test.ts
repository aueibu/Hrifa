import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LAB = fileURLToPath(new URL('..', import.meta.url));
const DELETED = [
  '--text-on-mark',
  'DARK_FLOOR',
  'HUE_CAP',
  'tileTextRole',
  '--tile-floor',
  '--tile-share',
  'wheelJewelFill',
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      return files(p);
    }
    return /\.(css|ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe('deleted tile color names', () => {
  it('no lab CSS or TS refers to them (this file excluded)', () => {
    const hits: string[] = [];
    for (const f of files(LAB)) {
      if (f.endsWith('deletedNames.test.ts')) {
        continue;
      }
      const src = readFileSync(f, 'utf8');
      for (const n of DELETED) {
        if (src.includes(n)) {
          hits.push(`${f}: ${n}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
