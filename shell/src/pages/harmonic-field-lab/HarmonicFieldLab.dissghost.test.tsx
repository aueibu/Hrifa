/** Ghost marks on the Dissonance curve: a dashed line and a hollow circle at the exact roughness, caption only while it sounds. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset } from './testUtils';

vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  window.localStorage.clear();
  window.innerWidth = 3840;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.innerWidth = 1024;
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  vi.useRealTimers();
});

it('the dissonance chart draws a ghost line and circle with its roughness while an off-field note sounds, and none otherwise', async () => {
  window.localStorage.setItem(
    'hrifa.harmonic-field-lab.layout.v1',
    JSON.stringify({ left: [['keys', 'chords']], right: [['viz3']] })
  );
  render(<HarmonicFieldLabPage />);
  await pickPreset('12-EDO');
  vi.useFakeTimers();
  const diss = () => screen.getByRole('group', { name: /^Dissonance curve/ });
  expect(within(diss()).queryAllByTestId('diss-ghost')).toHaveLength(0);
  expect(screen.queryByTestId('diss-outside-count')).toBeNull();
  const sketch = screen.getByRole('group', { name: 'Sketch a chord' });
  fireEvent.change(within(sketch).getByRole('combobox', { name: 'Sketch template' }), {
    target: { value: '4:5:6:7' },
  });
  fireEvent.click(within(sketch).getByRole('button', { name: 'Play sketch' }));
  act(() => {
    vi.advanceTimersByTime(200);
  });
  // as in field: only 7/4 stays off the 12-EDO field
  const ghosts = within(diss()).getAllByTestId('diss-ghost');
  expect(ghosts).toHaveLength(1);
  expect(ghosts[0].querySelector('line')).not.toBeNull();
  expect(within(ghosts[0]).getByTestId('diss-ghost-dot')).toBeTruthy();
  expect(ghosts[0].getAttribute('aria-label')).toMatch(/^Ghost: 96\d\.\d c, roughness \d\.\d\d$/);
  const cap = screen.getByTestId('diss-outside-count');
  expect(cap.textContent).toContain('+1 outside');
  // an overlay in the chart host's corner (CSS: position absolute), not a line of the stats below it
  expect(cap.getAttribute('data-corner')).toBe('top');
  expect(cap.getAttribute('role')).toBeNull();
  expect(cap.parentElement!.contains(diss())).toBe(true);
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  expect(within(diss()).queryAllByTestId('diss-ghost')).toHaveLength(0);
  expect(screen.queryByTestId('diss-outside-count')).toBeNull();
});
