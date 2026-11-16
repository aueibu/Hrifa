/** Ghost marks: a sketch note that is no field note shows dashed on the ring and strip while it sounds, then vanishes. */
import { act, fireEvent, render, screen, within } from '@test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HarmonicFieldLabPage } from '../HarmonicFieldLab.page';
import { FakeCtx } from './audio/fakeContext';
import { pickPreset } from './testUtils';

vi.setConfig({ testTimeout: 15_000 });

beforeEach(() => {
  window.localStorage.clear();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
});
afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  vi.useRealTimers();
});

it('Play sketch of 4:5:6:7 on a 12-EDO field ghosts the notes the field lacks, counts them, and clears them when the sound ends', async () => {
  render(<HarmonicFieldLabPage />);
  await pickPreset('12-EDO');
  vi.useFakeTimers();
  const sketch = screen.getByRole('group', { name: 'Sketch a chord' });
  fireEvent.change(within(sketch).getByRole('combobox', { name: 'Sketch template' }), {
    target: { value: '4:5:6:7' },
  });
  expect(screen.queryAllByTestId('ring-ghost')).toHaveLength(0);
  fireEvent.click(within(sketch).getByRole('button', { name: 'Play sketch' }));
  act(() => {
    vi.advanceTimersByTime(200);
  });
  // Field (the default): 5/4 and 3/2 land on 12-EDO notes, only 7/4 (31 c from the nearest) stays exact: one ghost
  expect(screen.getAllByTestId('ring-ghost')).toHaveLength(1);
  expect(screen.getAllByTestId('strip-ghost')).toHaveLength(1);
  expect(screen.getByTestId('outside-count').textContent).toContain('+1 outside');
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  expect(screen.queryAllByTestId('ring-ghost')).toHaveLength(0);
  // Exact: 5/4, 3/2 and 7/4 are all off the field
  fireEvent.click(within(sketch).getByText('Exact'));
  fireEvent.click(within(sketch).getByRole('button', { name: 'Play sketch' }));
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(screen.getAllByTestId('ring-ghost')).toHaveLength(3);
  expect(screen.getAllByTestId('strip-ghost')).toHaveLength(3);
  expect(screen.getByTestId('outside-count').textContent).toContain('+3 outside');
  expect(screen.getAllByTestId('ring-ghost')[0].getAttribute('aria-label')).toMatch(
    /outside the field, nearest field note/
  );
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  expect(screen.queryAllByTestId('ring-ghost')).toHaveLength(0);
  expect(screen.queryAllByTestId('strip-ghost')).toHaveLength(0);
  expect(screen.queryByTestId('outside-count')).toBeNull();
});
