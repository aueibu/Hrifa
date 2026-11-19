import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// jsdom lays nothing out, so the no-shift rule is guarded on the stylesheet itself: the header has a fixed height that
// fits the compact-xs Close button (1.375rem) plus its padding, so the ready line below never moves when Close appears.
describe('ChordsPanel stylesheet', () => {
  it('gives the header a fixed height that holds the Close button', () => {
    const css = readFileSync(new URL('./ChordsPanel.module.css', import.meta.url), 'utf8');
    const header = /\.header\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const height = /(?:^|[\s;])height:\s*([\d.]+)rem/.exec(header);
    expect(height).not.toBeNull();
    expect(Number(height?.[1])).toBeGreaterThanOrEqual(1.375 + 0.5);
    expect(header).not.toMatch(/min-height/);
  });
});
