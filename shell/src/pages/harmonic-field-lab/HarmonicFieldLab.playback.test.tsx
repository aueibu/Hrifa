/** Parallel | Relative mode playback: the top-bar switch, the 5 key, persistence and the transposed sound. */
import { fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { KEY_SETTINGS, loadSettings, sanitizeSettings } from './state/persist';

vi.setConfig({ testTimeout: 15_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const hzs = () => oscs().map((o) => o.frequency.events[0].v ?? 0);
const stored = () =>
  JSON.parse(window.localStorage.getItem(KEY_SETTINGS) ?? 'null') as {
    modePlayback?: string;
  } | null;
const key = (k: string, init: KeyboardEventInit = {}, target: Element | Window = window) =>
  fireEvent.keyDown(target, { key: k, ...init });
const radio = (n: string) => screen.getByRole('radio', { name: n });
const openModes = () =>
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Analysis panels' })).getByRole('tab', {
      name: /^Modes/,
    })
  );
const tile = (row: number, i: number) =>
  within(screen.getAllByTestId('mode-row')[row]).getAllByTestId('mode-tile')[i];

beforeEach(() => {
  window.localStorage.clear();
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

describe('settings', () => {
  it('defaults to Parallel for old data and bad values, and round-trips Relative', () => {
    expect(sanitizeSettings({ scalePreview: 'updown' }).modePlayback).toBe('parallel');
    expect(sanitizeSettings({ modePlayback: 'sideways' }).modePlayback).toBe('parallel');
    expect(sanitizeSettings({ modePlayback: 'relative' }).modePlayback).toBe('relative');
    window.localStorage.setItem(KEY_SETTINGS, JSON.stringify({ modePlayback: 'relative' }));
    expect(loadSettings().modePlayback).toBe('relative');
  });
});

describe('Parallel | Relative switch', () => {
  it('shows the state, stores nothing on mount, and follows clicks and key 5', () => {
    render(<HarmonicFieldLabPage />);
    expect(stored()).toBeNull();
    expect(radio('Parallel')).toBeChecked();
    fireEvent.click(radio('Relative'));
    expect(radio('Relative')).toBeChecked();
    expect(stored()?.modePlayback).toBe('relative');
    key('5');
    expect(radio('Parallel')).toBeChecked();
    key('5');
    expect(radio('Relative')).toBeChecked();
    expect(stored()?.modePlayback).toBe('relative');
  });

  it('key 5 is ignored while typing, with Alt (tab shortcut) and on repeat, and plays no note', () => {
    render(<HarmonicFieldLabPage />);
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    key('5', {}, input);
    expect(radio('Parallel')).toBeChecked();
    key('5', { altKey: true });
    expect(radio('Parallel')).toBeChecked();
    key('5', { repeat: true });
    expect(radio('Parallel')).toBeChecked();
    key('5', { ctrlKey: true });
    expect(radio('Parallel')).toBeChecked();
    key('5');
    expect(radio('Relative')).toBeChecked();
    expect(oscs()).toHaveLength(0);
    input.remove();
  });
});

describe('Relative sound', () => {
  it('a Ctrl+click on a mode-2 tile sounds at the transposed Hz', () => {
    render(<HarmonicFieldLabPage />);
    openModes();
    fireEvent.click(tile(1, 0), { ctrlKey: true });
    expect(hzs()[0]).toBeCloseTo(261.6256, 2);
    contexts.forEach((c) => (c.oscs.length = 0));
    key('5');
    fireEvent.click(tile(1, 0), { ctrlKey: true });
    expect(hzs()[0]).toBeCloseTo(261.6256 * (9 / 8), 2);
  });
});
