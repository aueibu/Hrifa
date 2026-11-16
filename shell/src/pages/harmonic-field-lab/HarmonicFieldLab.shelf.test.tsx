/** M8a step 2: the Sketch row, Stash, the Shelf panel (rename, select, play, reorder, delete, reload) and hover + hold 4. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset, ungroupShapes } from './testUtils';

vi.setConfig({ testTimeout: 15_000 });

let contexts: FakeCtx[] = [];
const oscs = () => contexts.flatMap((c) => c.oscs);
const running = () => oscs().filter((o) => o.stopAt === null);
const hz = (o: { frequency: { events: { v?: number }[] } }) => o.frequency.events[0].v ?? 0;
const down = (key: string) => fireEvent.keyDown(window, { key });
const up = (key: string) => fireEvent.keyUp(window, { key });
const ring = () => screen.getByRole('group', { name: /^Pitch circle/ });
const dot = (name: RegExp) => within(ring()).getByRole('button', { name });
const rail = () => screen.getByRole('navigation', { name: 'Analysis panels' });
const lit = () => document.querySelectorAll('[data-lit="true"]').length;
const sketch = () => screen.getByRole('group', { name: 'Sketch a chord' });
const template = () =>
  within(sketch()).getByRole<HTMLSelectElement>('combobox', { name: 'Sketch template' });
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

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
  vi.useRealTimers();
});

describe('chord shelf UI', () => {
  it('sketch, stash from the row and from a chip, then play, rename, select, reorder, reload and delete on the shelf', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    // the first template is picked on open
    expect(template().value).toBe('4:5:6');
    // Play sketch: the exact chord, root first (the row's root is the mode root)
    fireEvent.click(within(sketch()).getByRole('button', { name: 'Play sketch' }));
    advance(100);
    const heard = oscs().map(hz);
    expect(heard).toHaveLength(3);
    expect(heard[1] / heard[0]).toBeCloseTo(5 / 4, 3);
    expect(heard[2] / heard[0]).toBeCloseTo(3 / 2, 3);
    // every note of 4:5:6 on the mode root is a field note of the default field
    expect(within(sketch()).getAllByRole('listitem').length).toBe(3);
    // stepping the root moves the chord; the stepper wraps
    const first = within(sketch()).getAllByRole('listitem')[0].textContent;
    fireEvent.click(within(sketch()).getByRole('button', { name: 'Next root degree' }));
    expect(within(sketch()).getAllByRole('listitem')[0].textContent).not.toBe(first);
    fireEvent.click(within(sketch()).getByRole('button', { name: 'Previous root degree' }));
    expect(within(sketch()).getAllByRole('listitem')[0].textContent).toBe(first);
    // Stash
    fireEvent.click(within(sketch()).getByRole('button', { name: 'Stash' }));
    expect(within(rail()).getByRole('tab', { name: /^Shelf/ }).textContent).toMatch(/1 chord/);
    // clicking a chord chip arms its template in the row
    const minor = screen.getAllByRole('button', { name: /^minor triad 10:12:15 on /i })[0];
    fireEvent.click(minor);
    expect(template().value).toBe('10:12:15');
    expect(sketch().getAttribute('data-armed')).toBe('true');
    // a found chip stashes its exact notes, root first
    fireEvent.click(screen.getAllByRole('button', { name: /^Stash 10:12:15 on /i })[0]);
    expect(within(rail()).getByRole('tab', { name: /^Shelf/ }).textContent).toMatch(/2 chords/);

    // open the shelf
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Shelf/ }));
    const list = () => screen.getByRole('list', { name: 'Chord shelf' });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list()).getByRole('button', { name: 'Rename Chord 1' })).toBeTruthy();
    expect(within(list()).getAllByText(/3 notes/).length).toBe(2);
    // the shelf card reads like a chip: `<template> on <root> · N notes`, the pitches, the steps, and a select box
    const card1 = within(list()).getAllByTestId('slot-card')[0];
    expect(within(card1).getByTestId('card-subtitle').textContent).toMatch(
      /^\S+ on \S+ · 3 notes$/
    );
    expect(within(card1).getByTestId('card-pitches').textContent).toMatch(/\d\/\d/);
    expect(within(card1).getByTestId('card-steps').textContent).toMatch(/^steps [\d.]+, [\d.]+ c$/);
    expect(within(card1).getByRole('checkbox', { name: 'Select Chord 1' })).toBeTruthy();
    const before = oscs().length;
    // click plays with a sticky highlight; clicking again clears it
    const play1 = within(list()).getByRole('button', { name: 'Play Chord 1' });
    fireEvent.click(play1);
    advance(100);
    expect(oscs().length - before).toBe(3);
    expect(play1.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(play1);
    expect(play1.getAttribute('aria-pressed')).toBe('false');
    // hover + hold 1 on a slot holds it
    const slot1 = within(list()).getAllByRole('listitem')[0];
    fireEvent.mouseEnter(slot1);
    down('1');
    expect(running()).toHaveLength(3);
    up('1');
    expect(running()).toHaveLength(0);
    fireEvent.mouseLeave(slot1);
    // select both, Play selected layers them (6 voices); hold 1 on one of two selected slots layers both
    fireEvent.click(within(list()).getByRole('checkbox', { name: 'Select Chord 1' }));
    fireEvent.click(within(list()).getByRole('checkbox', { name: 'Select Chord 2' }));
    const n0 = oscs().length;
    fireEvent.click(screen.getByRole('button', { name: 'Play selected' }));
    advance(100);
    expect(oscs().length - n0).toBe(6);
    fireEvent.mouseEnter(slot1);
    down('1');
    expect(running()).toHaveLength(6);
    up('1');
    fireEvent.mouseLeave(slot1);
    // rename: only the name text starts it
    fireEvent.click(within(list()).getByRole('button', { name: 'Rename Chord 2' }));
    const box = screen.getByRole('textbox', { name: 'New name' });
    fireEvent.change(box, { target: { value: 'Minor on 1' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(within(list()).getByRole('button', { name: 'Rename Minor on 1' })).toBeTruthy();
    // reorder
    fireEvent.click(within(list()).getByRole('button', { name: 'Move Minor on 1 up' }));
    expect(within(list()).getAllByRole('listitem')[0].textContent).toMatch(/Minor on 1/);
    // reload: a new tab, the old one untouched
    const tabsBefore = screen.getAllByRole('tab').length;
    fireEvent.click(within(list()).getByRole('button', { name: 'Reload Minor on 1 as a new tab' }));
    expect(screen.getAllByRole('tab').length).toBe(tabsBefore + 1);
    expect(screen.getByText(/Reloaded as a new tab/)).toBeTruthy();
    // delete asks first
    fireEvent.click(within(list()).getByRole('button', { name: 'Delete Chord 1' }));
    fireEvent.click(within(list()).getByRole('button', { name: 'Confirm delete Chord 1' }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    // the chord that was stashed from the reloaded tab would say "parent removed" once its parent is gone: the rail count follows
    expect(within(rail()).getByRole('tab', { name: /^Shelf/ }).textContent).toMatch(/1 chord/);
  });

  it('hover a note and hold 4 plays the armed chord on it; sweeping moves it; keys 1, 2, 3 stay as they were; never while typing', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    const a = dot(new RegExp('^9/8'));
    const b = dot(new RegExp('^3/2'));
    // the root note on its own (hold 1)
    fireEvent.mouseEnter(a);
    down('1');
    const root98 = hz(running()[0]);
    up('1');
    // nothing armed yet: the first template (4:5:6) is the row's choice
    down('4');
    advance(100);
    let heard = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(heard).toHaveLength(3);
    expect(heard[0]).toBeCloseTo(root98, 3);
    expect(heard[1] / heard[0]).toBeCloseTo(5 / 4, 3);
    expect(heard[2] / heard[0]).toBeCloseTo(3 / 2, 3);
    expect(lit()).toBeGreaterThan(0);
    // sweeping onto another note while 4 is held moves the whole chord there
    fireEvent.mouseLeave(a);
    fireEvent.mouseEnter(b);
    heard = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(heard).toHaveLength(3);
    expect(heard[0] / root98).toBeCloseTo(3 / 2 / (9 / 8), 3);
    up('4');
    expect(running()).toHaveLength(0);
    expect(lit()).toBe(0);
    fireEvent.mouseLeave(b);
    // playing a chip arms its template: hold 4 now plays the minor triad on the pointed note
    fireEvent.click(screen.getAllByRole('button', { name: /^minor triad 10:12:15 on /i })[0]);
    fireEvent.mouseEnter(a);
    down('4');
    heard = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(heard).toHaveLength(3);
    expect(heard[1] / heard[0]).toBeCloseTo(6 / 5, 3);
    expect(heard[2] / heard[0]).toBeCloseTo(3 / 2, 3);
    up('4');
    // 1 still holds the single note, 2 and 3 still do nothing on a note
    down('2');
    down('3');
    expect(running()).toHaveLength(0);
    up('2');
    up('3');
    down('1');
    expect(running()).toHaveLength(1);
    up('1');
    // nowhere to point: nothing; typing in a box: nothing
    fireEvent.mouseLeave(a);
    down('4');
    expect(running()).toHaveLength(0);
    up('4');
    fireEvent.mouseEnter(a);
    fireEvent.keyDown(screen.getAllByRole('textbox')[0], { key: '4' });
    expect(running()).toHaveLength(0);
    fireEvent.mouseLeave(a);
  });

  it('a stashed chord lights its own field notes and follows Parallel | Relative like mode previews (12-EDO, mode root D)', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    [2, 5, 9].forEach((k) => fireEvent.click(within(ring()).getAllByRole('button')[k]));
    // D-F-A, mode root D (200 c): the minor triad chip on D
    fireEvent.click(
      screen.getAllByRole('button', { name: /^Stash 10:12:15 on 200.0 c on the shelf/ })[0]
    );
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Shelf/ }));
    const slot = within(screen.getByRole('list', { name: 'Chord shelf' })).getAllByRole(
      'listitem'
    )[0];
    vi.useFakeTimers();
    const soundingNames = () =>
      within(ring())
        .getAllByRole('button')
        .filter((b) => /sounding/.test(b.getAttribute('aria-label') ?? ''))
        .map((b) => (b.getAttribute('aria-label') ?? '').slice(0, 7));
    fireEvent.mouseEnter(slot);
    down('1');
    const parallel = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(parallel).toHaveLength(3);
    // Parallel puts the mode root D on 1/1 (0, 300, 700 c) but lights D, F, A, not C, Eb, G
    expect(soundingNames().sort()).toEqual(['200.0 c', '500.0 c', '900.0 c']);
    up('1');
    // key 0 with the pointer resting on the slot: Relative keeps the real pitches (a root up, 200 c), same lights
    down('0');
    up('0');
    down('1');
    const relative = running()
      .map(hz)
      .sort((x, y) => x - y);
    expect(relative[0] / parallel[0]).toBeCloseTo(2 ** (200 / 1200), 3);
    expect(soundingNames().sort()).toEqual(['200.0 c', '500.0 c', '900.0 c']);
    up('1');
    fireEvent.mouseLeave(slot);
  });

  it('chip, Play sketch and the stashed slot sound the same in Parallel and in Relative, and key 0 moves them together', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    // a mode root that is not 1/1
    fireEvent.click(screen.getByRole('button', { name: 'Next mode' }));
    const chipName = new RegExp('^major triad 4:5:6 on 1/1', 'i'); // a chord that does not wrap the repeat, so the chip and the stacked sketch are the same notes
    const chip = () => screen.getAllByRole('button', { name: chipName })[0];
    const ringLit = () =>
      within(ring())
        .getAllByRole('button')
        .filter((b) => /sounding/.test(b.getAttribute('aria-label') ?? '')).length;
    const held = (el: HTMLElement) => {
      fireEvent.mouseEnter(el);
      down('1');
      const out = running()
        .map(hz)
        .sort((x, y) => x - y);
      const l = ringLit();
      up('1');
      fireEvent.mouseLeave(el);
      return { hz: out, lit: l };
    };
    const sketchPlay = () => {
      const before = oscs().length;
      fireEvent.click(within(sketch()).getByRole('button', { name: 'Play sketch' }));
      advance(100);
      const out = oscs()
        .slice(before)
        .map(hz)
        .sort((x, y) => x - y);
      const l = ringLit();
      advance(3000);
      return { hz: out, lit: l };
    };
    const same = (x: number[], y: number[]) =>
      x.forEach((v, i) => expect(v / y[i]).toBeCloseTo(1, 4));
    const parChip = held(chip());
    expect(parChip.hz).toHaveLength(3);
    expect(parChip.lit).toBe(3);
    // playing the chip arms it and puts the Sketch row on the same chord
    fireEvent.click(chip());
    advance(3000);
    fireEvent.click(chip()); // unpick
    const parSketch = sketchPlay();
    same(parSketch.hz, parChip.hz);
    expect(parSketch.lit).toBe(3);
    fireEvent.click(
      screen.getAllByRole('button', { name: new RegExp('^Stash 4:5:6 on 1/1', 'i') })[0]
    );
    down('0');
    up('0');
    const relChip = held(chip());
    const relSketch = sketchPlay();
    same(relSketch.hz, relChip.hz);
    expect(relChip.lit).toBe(3);
    expect(relSketch.lit).toBe(3);
    // the chord sits on 1/1 itself, so Parallel (the chord's own root on 1/1) and Relative (as stored) coincide here;
    // the frames part for a chord on another root (keyboardModes.test.tsx: C major and E minor)
    same(relChip.hz, parChip.hz);
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Shelf/ }));
    const slot = within(screen.getByRole('list', { name: 'Chord shelf' })).getAllByRole(
      'listitem'
    )[0];
    const relSlot = held(slot);
    same(relSlot.hz, relChip.hz);
    expect(relSlot.lit).toBe(3);
    down('0');
    up('0');
    const parSlot = held(slot);
    same(parSlot.hz, parChip.hz);
    expect(parSlot.lit).toBe(3);
  });

  it('hold 4 moves the chord as the field has it, hold 5 plays the exact ratios; the Sketch row follows its switch (12-EDO)', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    vi.useFakeTimers();
    const dotAt = (c: string) => dot(new RegExp(`^${c} c`));
    const sorted = () =>
      running()
        .map(hz)
        .sort((x, y) => x - y);
    const ratioC = (a: number, b: number) => 1200 * Math.log2(b / a);
    const target = dotAt('200\.0');
    // a template only picked in the row is realized by the field at the sketch root: 4:5:6 = 0, 400, 700 c
    fireEvent.mouseEnter(target);
    down('4');
    let h = sorted();
    expect(h).toHaveLength(3);
    expect(ratioC(h[0], h[1])).toBeCloseTo(400, 1);
    expect(ratioC(h[0], h[2])).toBeCloseTo(700, 1);
    up('4');
    // hold 5 = the exact ratios on the same note
    down('5');
    h = sorted();
    expect(h).toHaveLength(3);
    expect(ratioC(h[0], h[1])).toBeCloseTo(386.31, 1);
    expect(ratioC(h[0], h[2])).toBeCloseTo(701.96, 1);
    // sweeping to another note while 5 is held moves the exact chord there
    fireEvent.mouseLeave(target);
    fireEvent.mouseEnter(dotAt('300\.0'));
    h = sorted();
    expect(h).toHaveLength(3);
    up('5');
    expect(running()).toHaveLength(0);
    // the Sketch row's switch: Field plays the field's shape, Exact the true ratios
    const sk = screen.getByRole('group', { name: 'Sketch a chord' });
    const played = () => {
      const before = oscs().length;
      fireEvent.click(within(sk).getByRole('button', { name: 'Play sketch' }));
      advance(100);
      return oscs()
        .slice(before)
        .map(hz)
        .sort((x, y) => x - y);
    };
    let ps = played();
    expect(ratioC(ps[0], ps[1])).toBeCloseTo(400, 1);
    advance(3000);
    fireEvent.click(within(sk).getByText('Exact'));
    ps = played();
    expect(ratioC(ps[0], ps[1])).toBeCloseTo(386.31, 1);
    advance(3000);
    // the pointer must be off any note: 4 and 5 play nothing there
    fireEvent.mouseLeave(dotAt('300\.0'));
    down('4');
    expect(running()).toHaveLength(0);
    up('4');
  });

  it('a chip arms its real shape: hold 4 keeps its errors, hold 5 is exact (12-EDO, minor triad 10:12:15 is 0, 300, 700 c)', async () => {
    render(<HarmonicFieldLabPage />);
    await pickPreset('12-EDO');
    vi.useFakeTimers();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: new RegExp('^minor triad 10:12:15 on (0\.0 c|1/1)'),
      })[0]
    );
    advance(3000);
    const sorted = () =>
      running()
        .map(hz)
        .sort((x, y) => x - y);
    const ratioC = (a: number, b: number) => 1200 * Math.log2(b / a);
    const target = dot(new RegExp('^200\.0 c'));
    fireEvent.mouseEnter(target);
    down('4');
    let h = sorted();
    expect(ratioC(h[0], h[1])).toBeCloseTo(300, 1);
    expect(ratioC(h[0], h[2])).toBeCloseTo(700, 1);
    up('4');
    down('5');
    h = sorted();
    expect(ratioC(h[0], h[1])).toBeCloseTo(315.64, 1);
    expect(ratioC(h[0], h[2])).toBeCloseTo(701.96, 1);
    up('5');
    fireEvent.mouseLeave(target);
  });

  it('switching tab disarms the chord (its shape belongs to the field it came from) and keeps the template', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(screen.getAllByRole('button', { name: /^minor triad 10:12:15 on /i })[0]);
    const sk = () => screen.getByRole('group', { name: 'Sketch a chord' });
    expect(sk().getAttribute('data-armed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'New tuning' }));
    expect(sk().getAttribute('data-armed')).toBeNull();
    expect(
      within(sk()).getByRole<HTMLSelectElement>('combobox', { name: 'Sketch template' }).value
    ).toBe('10:12:15');
  });

  it('a melody key sets the Sketch root to its degree (no sound beyond the note, no stash); = stashes the Sketch, not while typing', () => {
    vi.useFakeTimers();
    render(<HarmonicFieldLabPage />);
    const sk = () => screen.getByRole('group', { name: 'Sketch a chord' });
    const rootText = () => within(sk()).getByText(/^root/).textContent;
    expect(rootText()).toMatch(/^root 1/);
    // x is slot 1 = degree 2 (1-based); the repeat keys map back to the same degree
    fireEvent.keyDown(window, { key: 'x', code: 'KeyX' });
    fireEvent.keyUp(window, { key: 'x', code: 'KeyX' });
    expect(rootText()).toMatch(/^root 2/);
    expect(within(rail()).getByRole('tab', { name: /^Shelf/ }).textContent).toMatch(/0 chords/);
    // = stashes with the current root (Shift+= is the same key)
    fireEvent.keyDown(window, { key: '=', code: 'Equal' });
    expect(within(rail()).getByRole('tab', { name: /^Shelf/ }).textContent).toMatch(/1 chord/);
    fireEvent.keyDown(window, { key: '+', code: 'Equal', shiftKey: true });
    expect(within(rail()).getByRole('tab', { name: /^Shelf/ }).textContent).toMatch(/2 chords/);
    // guards: repeat, Ctrl, Alt and typing do nothing
    fireEvent.keyDown(window, { key: '=', code: 'Equal', repeat: true });
    fireEvent.keyDown(window, { key: '=', code: 'Equal', ctrlKey: true });
    fireEvent.keyDown(window, { key: '=', code: 'Equal', altKey: true });
    fireEvent.keyDown(screen.getAllByRole('textbox')[0], { key: '=', code: 'Equal' });
    expect(within(rail()).getByRole('tab', { name: /^Shelf/ }).textContent).toMatch(/2 chords/);
  });

  it('Delete all: disabled when empty, two clicks, mouse-away cancels, then the shelf is empty', () => {
    render(<HarmonicFieldLabPage />);
    fireEvent.click(within(rail()).getByRole('tab', { name: /^Shelf/ }));
    const del = () => screen.getByRole('button', { name: /delete all/i });
    expect(del().getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(window, { key: '=', code: 'Equal' });
    fireEvent.keyDown(window, { key: '=', code: 'Equal' });
    expect(
      within(screen.getByRole('list', { name: 'Chord shelf' })).getAllByRole('listitem')
    ).toHaveLength(2);
    expect(del().getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(del());
    expect(del().textContent).toBe('Delete all 2?');
    fireEvent.mouseLeave(del());
    expect(del().textContent).toBe('Delete all');
    fireEvent.click(del());
    fireEvent.click(del());
    expect(screen.queryByRole('list', { name: 'Chord shelf' })).toBeNull();
    expect(screen.getByText(/The shelf is empty/)).toBeTruthy();
    expect(del().getAttribute('aria-disabled')).toBe('true');
  });
});
