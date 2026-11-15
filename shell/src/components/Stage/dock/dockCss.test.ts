import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * jsdom has no layout, so the splitter's fill rule is checked in the stylesheet itself: the old Splitter's CSS gives only a
 * thickness, and in the dock's absolute wrapper a bar without a cross-axis size is not hit-testable in a real browser.
 */
describe('dock.module.css splitter wrapper', () => {
  const css = readFileSync(new URL('./dock.module.css', import.meta.url), 'utf8').replace(
    /"/g,
    "'"
  );
  const body = (selector: string): string => {
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it('makes the separator fill its wrapper in both axes, above the dockers', () => {
    const fill = body(".splitterPos > [role='separator'][data-orientation]");
    expect(fill).toMatch(/width:\s*100%/);
    expect(fill).toMatch(/height:\s*100%/);
    const pos = body('.splitterPos');
    expect(pos).toMatch(/position:\s*absolute/);
    expect(pos).toMatch(/z-index:\s*[1-9]/);
  });
});
