/** M8c step 2: the `-` popup (open, preview, digits, refusal, key capture and release) on the page. */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset, ungroupShapes } from './testUtils';

vi.setConfig({ testTimeout: 15_000 });

let contexts: FakeCtx[] = [];
const running = () => contexts.flatMap((c) => c.oscs).filter((o) => o.stopAt === null);
const down = (key: string, init: object = {}) => fireEvent.keyDown(window, { key, ...init });
const up = (key: string) => fireEvent.keyUp(window, { key });
const chip = (re: RegExp) => screen.getAllByRole('button', { name: re })[0];
const popup = () => screen.queryByRole('dialog', { name: 'Send to composite' });
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const mode = () => screen.getByRole('radiogroup', { name: 'Mode playback' });

beforeEach(() => {
  window.localStorage.clear();
  ungroupShapes();
  contexts = [];
  class TestCtx extends FakeCtx {
    constructor() {
      super();
      contexts.push(this);
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = TestCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
});

const JI_MAJOR = /^major triad 4:5:6 on 1\/1/i;
const EDO_MAJOR = /^major triad 4:5:6 on (1\/1|0\.0 c)/i;
const EDO_MINOR = /^minor triad 10:12:15 on (1\/1|0\.0 c)/i;

describe('send popup on -', () => {
  it('opens on - over a hovered chord chip, names it, and previews 5 c merging: 400 vs 386.3 added, 700 vs 702 common', async () => {
    render(<HarmonicFieldLabPage />);
    // composite 1 = the just 4:5:6 (0, 386.3, 702 c) from the default harmonic field
    const ji = chip(JI_MAJOR);
    fireEvent.mouseEnter(ji);
    expect(popup()).toBeNull();
    down('-');
    expect(popup()).not.toBeNull();
    expect(within(popup()!).getByText(/major triad on 1\/1/i)).toBeInTheDocument();
    expect(within(popup()!).getByText(/chord, 3 notes/)).toBeInTheDocument();
    down('0');
    expect(popup()).toBeNull();
    fireEvent.mouseLeave(ji);
    // 12-EDO C major (0, 400, 700 c) as the candidate
    await pickPreset('12-EDO');
    const edo = chip(EDO_MAJOR);
    fireEvent.mouseEnter(edo);
    down('-');
    const row = within(popup()!).getByRole('button', { name: /^1: Composite 1/ });
    const ring = within(row).getByTestId('composite-ring');
    // 0 and 700 merge into 0 and 702 (common); 400 is 13.7 c from 386.3 so it is a new note
    expect(ring.querySelectorAll('[data-kind="common"]')).toHaveLength(2);
    expect(ring.querySelectorAll('[data-kind="added"]')).toHaveLength(1);
    expect(ring.querySelectorAll('[data-kind="dropped"]')).toHaveLength(0);
    expect(ring.querySelectorAll('[data-kind="note"]')).toHaveLength(3);
    expect(row).toHaveAccessibleName(/1 new, 2 common/);
    down('Escape');
    expect(popup()).toBeNull();
  });

  it('digit 2 sends to composite 2; the same chord again is refused with "already in composite 2"', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    const major = chip(EDO_MAJOR);
    const minor = chip(EDO_MINOR);
    fireEvent.mouseEnter(major);
    down('-');
    down('0'); // New composite: Composite 1
    fireEvent.mouseLeave(major);
    fireEvent.mouseEnter(minor);
    down('-');
    down('0'); // Composite 2
    fireEvent.mouseLeave(minor);
    fireEvent.mouseEnter(major);
    down('-');
    expect(
      within(popup()!).getByRole('button', { name: /^1: Composite 1.*already in composite 1/ })
    ).toBeInTheDocument();
    down('2');
    expect(popup()).toBeNull();
    expect(screen.getAllByText(/Added major triad on .* to Composite 2/).length).toBeGreaterThan(0);
    // the same chord again: the popup shows it disabled, and the key is refused with a visible reason
    down('-');
    expect(
      within(popup()!).getByRole('button', { name: /^2: Composite 2.*already in composite 2/ })
    ).toBeInTheDocument();
    down('2');
    expect(popup()).toBeNull();
    expect(screen.getAllByText(/Already in Composite 2/i).length).toBeGreaterThan(0);
    // the rail counts the composites
    expect(within(rail()).getByRole('tab', { name: /Composites/ })).toHaveTextContent(
      '2 composites'
    );
  });

  it('takes the digits while open (no hold preview, no 0 toggle, no Alt+digit tab) and releases everything on Esc and on blur', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getByRole('button', { name: 'New tuning' }));
    const tabs = () => within(screen.getByRole('tablist', { name: 'Tunings' })).getAllByRole('tab');
    const active = () => tabs().findIndex((t) => t.getAttribute('aria-selected') === 'true');
    expect(tabs()).toHaveLength(2);
    expect(active()).toBe(1);
    const radio = (name: string) => within(mode()).getByRole('radio', { name });
    expect(radio('Parallel')).toBeChecked();
    fireEvent.mouseEnter(chip(JI_MAJOR));
    down('-');
    expect(popup()).not.toBeNull();
    // 1 would hold-preview the chord and Alt+1 would switch to the first tab: the popup took both (no composite 1 yet)
    down('1');
    down('1', { altKey: true });
    expect(running()).toHaveLength(0);
    expect(active()).toBe(1);
    expect(popup()).not.toBeNull();
    // 0 is New composite here: it sends and closes, and does NOT flip Parallel | Relative
    down('0');
    expect(popup()).toBeNull();
    expect(radio('Parallel')).toBeChecked();
    expect(screen.getAllByText(/Added major triad on 1\/1 to Composite 1/).length).toBeGreaterThan(
      0
    );
    // Esc releases everything: 0 flips the frame, Alt+1 switches tab, hold 1 sounds
    down('-');
    expect(popup()).not.toBeNull();
    down('Escape');
    expect(popup()).toBeNull();
    down('0');
    up('0');
    expect(radio('Relative')).toBeChecked();
    down('1', { altKey: true });
    expect(active()).toBe(0);
    fireEvent.mouseEnter(chip(JI_MAJOR));
    down('1');
    expect(running().length).toBeGreaterThan(0);
    up('1');
    expect(running()).toHaveLength(0);
    // blur releases it too, and the digits work again
    down('-');
    expect(popup()).not.toBeNull();
    fireEvent.blur(window);
    expect(popup()).toBeNull();
    down('0');
    up('0');
    expect(radio('Parallel')).toBeChecked();
  });
});
