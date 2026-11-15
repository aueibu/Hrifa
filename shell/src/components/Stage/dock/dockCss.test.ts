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

describe('dock.module.css drag-to-dock layers', () => {
  const css = readFileSync(new URL('./dock.module.css', import.meta.url), 'utf8');
  const body = (selector: string): string => {
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };
  const z = (selector: string) => Number(/z-index:\s*(\d+)/.exec(body(selector))?.[1]);

  it('covers the whole Stage with a transparent shield above every docker, splitter and the notice', () => {
    const shield = body('.shield');
    expect(shield).toMatch(/position:\s*absolute/);
    expect(shield).toMatch(/inset:\s*0/);
    expect(shield).toMatch(/background:\s*transparent/);
    expect(shield).not.toMatch(/pointer-events:\s*none/); // it must take the pointer
    expect(z('.shield')).toBeGreaterThan(z('.splitterPos'));
    expect(z('.shield')).toBeGreaterThan(z('.notice'));
  });

  it('keeps the preview and the label above the shield and out of the pointer path', () => {
    for (const cls of ['.dropPreview', '.dragLabel']) {
      expect(body(cls)).toMatch(/position:\s*absolute/);
      expect(body(cls)).toMatch(/pointer-events:\s*none/);
      expect(z(cls)).toBeGreaterThan(z('.shield'));
    }
  });

  it('isolates each docker so panel content cannot draw over the shield', () => {
    expect(body('.dockerPos')).toMatch(/isolation: isolate/);
  });

  it('draws the preview with theme roles only', () => {
    const preview = body('.dropPreview');
    expect(preview).toContain('var(--accent)');
    expect(preview).not.toContain('#');
    expect(preview).not.toContain('rgb(');
  });
});
