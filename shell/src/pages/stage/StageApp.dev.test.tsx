/** The Developer option in StageApp: typing keeps the raw text, blur clamps and saves. */
import { fireEvent, render, screen, userEvent } from '@test-utils';
import { describe, expect, it } from 'vitest';
import { TIP_DELAY_KEY } from '../../components/InspectorKit';
import type { StageStorage } from '../../components/Stage/persistence';
import { StageApp } from './StageApp';

describe('Developer option', () => {
  it('does not snap while typing, clamps on blur and persists', async () => {
    const data = new Map<string, string>();
    const storage: StageStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
    const user = userEvent.setup();
    render(
      <StageApp
        storage={storage}
        defaultLayout={{ version: 1, columns: [] }}
        presets={[]}
        inspector={false}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Developer' }));
    const field = await screen.findByLabelText('Tooltip delay (ms)');
    expect(field).toHaveValue('330');
    await user.clear(field);
    expect(field).toHaveValue('');
    await user.type(field, '9999');
    expect(field).toHaveValue('9999');
    fireEvent.blur(field);
    expect(field).toHaveValue('2000');
    expect(data.get(TIP_DELAY_KEY)).toBe('2000');
  });
});
