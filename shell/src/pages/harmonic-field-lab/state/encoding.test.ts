import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guard against double-encoded text (UTF-8 read as Windows-1252 and written back, for example by PowerShell 5.1
 * `Get-Content` and `Set-Content`): a middle dot, an em dash or an arrow turns into two or three odd Latin letters. It
 * happened once to old entries in texts.ts and no other test noticed. The markers are tested by character code, with
 * no literal example, so this file never matches itself.
 */
function hasMojibake(line: string): boolean {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line.charCodeAt(i);
    const b = line.charCodeAt(i + 1);
    if (a === 0xc2 && b >= 0xa0 && b <= 0xbf) {
      return true;
    }
    if (a === 0xc3 && b >= 0x80 && b <= 0xbf) {
      return true;
    }
    if (a === 0xe2 && (b === 0x20ac || b === 0x2c6 || b === 0x2020 || b === 0xba)) {
      return true;
    }
  }
  return false;
}

describe('lab source files hold no double-encoded text', () => {
  it('the detector recognizes the usual double-encoded pairs and leaves real text alone', () => {
    const odd = (...codes: number[]) => String.fromCharCode(...codes);
    expect(hasMojibake(odd(0xc2, 0xb7))).toBe(true); // a middle dot
    expect(hasMojibake(odd(0xe2, 0x20ac, 0x201d))).toBe(true); // an em dash
    expect(hasMojibake(odd(0xe2, 0x2020, 0x2019))).toBe(true); // an arrow
    expect(hasMojibake(odd(0xb7, 0x20, 0x2014, 0x20, 0x2192))).toBe(false); // the real characters
    expect(hasMojibake('plain ASCII text')).toBe(false);
  });

  it('no .ts, .tsx, .css or .md file under the lab folder or the lib has a mojibake marker', () => {
    const roots = [
      fileURLToPath(new URL('../', import.meta.url)),
      fileURLToPath(new URL('../../../lib/harmonic-field/', import.meta.url)),
    ];
    const bad: string[] = [];
    let scanned = 0;
    for (const dir of roots) {
      for (const entry of readdirSync(dir, { recursive: true })) {
        const name = String(entry);
        if (!/\.(ts|tsx|css|md)$/.test(name)) {
          continue;
        }
        scanned += 1;
        const hit = readFileSync(join(dir, name), 'utf8')
          .split('\n')
          .findIndex((line) => hasMojibake(line));
        if (hit >= 0) {
          bad.push(`${name}:${hit + 1}`);
        }
      }
    }
    expect(scanned).toBeGreaterThan(50);
    expect(bad).toEqual([]);
  });
});
