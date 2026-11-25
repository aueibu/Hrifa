/** Kit behaviours that are not styling: toggle role and keyboard, the row contract, density through one token set, tip delay. */
import { useState } from 'react';
import { act, fireEvent, render, screen, userEvent } from '@test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { StageStorage } from '../components/Stage/persistence';
import {
  DEFAULT_TIP_DELAY,
  DENSITY_TOKENS,
  FIXED_TOKENS,
  KitScope,
  NumberField,
  Row,
  ScrubNumber,
  SelectField,
  TIP_DELAY_KEY,
  TipDelayContext,
  Tip,
  Toggle,
  loadTipDelay,
  parseTipDelay,
  saveTipDelay,
  tokenStyle,
  useDensity,
} from './index';

function Controlled() {
  const [on, setOn] = useState(false);
  return (
    <Toggle pressed={on} onPressedChange={setOn}>
      Active
    </Toggle>
  );
}

describe('Toggle', () => {
  it('is a button with aria-pressed that follows state', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const b = screen.getByRole('button', { name: 'Active' });
    expect(b).toHaveAttribute('aria-pressed', 'false');
    await user.click(b);
    expect(b).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles with Space and Enter once focused by Tab', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.tab();
    const b = screen.getByRole('button', { name: 'Active' });
    expect(b).toHaveFocus();
    await user.keyboard(' ');
    expect(b).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('{Enter}');
    expect(b).toHaveAttribute('aria-pressed', 'false');
  });

  it('does nothing when disabled', async () => {
    const user = userEvent.setup();
    let calls = 0;
    render(
      <Toggle pressed={false} onPressedChange={() => (calls += 1)} disabled>
        Off
      </Toggle>
    );
    await user.click(screen.getByRole('button', { name: 'Off' }));
    expect(calls).toBe(0);
  });
});

describe('Row alignment contract', () => {
  it('puts the name before the value, and the name labels the field inside', () => {
    render(
      <>
        <Row name="Tempo">
          <NumberField value={96} onChange={() => {}} />
        </Row>
        <Row name="Mode" fill>
          <SelectField value="A" data={['A', 'B']} onChange={() => {}} fill />
        </Row>
      </>
    );
    const rows = document.querySelectorAll('[data-kit="row"]');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const [name, value] = Array.from(row.children);
      expect(name).toHaveAttribute('data-kit', 'row-name');
      expect(value).toHaveAttribute('data-kit', 'row-value');
      // the row carries no inline size: its height is the shared token, identical for every row
      expect(row.getAttribute('style')).toBeNull();
    }
    expect(screen.getByLabelText('Tempo')).toHaveValue('96');
    expect(screen.getByLabelText('Mode')).toHaveValue('A');
    expect(rows[1].querySelector('[data-kit="row-value"]')).toHaveAttribute('data-fill', 'true');
  });
});

describe('density', () => {
  it('writes the one token set (and the fixed tokens) as custom properties', () => {
    const style = tokenStyle('compact') as Record<string, string>;
    expect(style['--kit-row-height']).toBe('1.375rem'); // Q9
    expect(Object.keys(style)).toHaveLength(
      Object.keys(DENSITY_TOKENS.compact).length + Object.keys(FIXED_TOKENS).length
    );
  });

  it('KitScope applies the set through its table', () => {
    function Probe() {
      return <span data-testid="probe">{useDensity()}</span>;
    }
    render(
      <KitScope density="compact">
        <Probe />
      </KitScope>
    );
    const scopes = document.querySelectorAll('[data-kit-density]');
    expect(scopes).toHaveLength(1);
    expect((scopes[0] as HTMLElement).style.getPropertyValue('--kit-row-height')).toBe(
      DENSITY_TOKENS.compact.rowHeight
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('compact');
  });
});

describe('tooltip delay option', () => {
  const store = (): StageStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it('defaults to 330 and clamps or rejects bad values', () => {
    expect(DEFAULT_TIP_DELAY).toBe(330);
    expect(parseTipDelay(null)).toBe(330);
    expect(parseTipDelay('abc')).toBe(330);
    expect(parseTipDelay('')).toBe(330);
    expect(parseTipDelay('150.4')).toBe(150);
    expect(parseTipDelay(-5)).toBe(0);
    expect(parseTipDelay(99999)).toBe(2000);
  });

  it('round trips under the hrifa.stage. prefix and survives broken storage', () => {
    const s = store();
    expect(saveTipDelay(s, 500)).toBe(true);
    expect([...s.data.keys()]).toEqual([TIP_DELAY_KEY]);
    expect(TIP_DELAY_KEY.startsWith('hrifa.stage.')).toBe(true);
    expect(loadTipDelay(s)).toBe(500);
    const broken: StageStorage = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('x');
      },
    };
    expect(loadTipDelay(broken)).toBe(330);
    expect(saveTipDelay(broken, 100)).toBe(false);
    expect(loadTipDelay(undefined)).toBe(330);
  });
});

describe('Tip delay is applied', () => {
  it('opens only after the delay from TipDelayContext', async () => {
    vi.useFakeTimers();
    try {
      render(
        <TipDelayContext.Provider value={700}>
          <Tip term="Snap" text="Jumps to grid.">
            hover me
          </Tip>
        </TipDelayContext.Provider>
      );
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'hover me' }));
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByText('Jumps to grid.')).toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText('Jumps to grid.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ScrubNumber', () => {
  it('switches to textbox on single click, commits on Enter, and steps with arrows', () => {
    const onChange = vi.fn();
    render(
      <KitScope>
        <ScrubNumber
          aria-label="Rotate"
          value={4}
          clamp={[-10, 10]}
          defaultValue={0}
          onChange={onChange}
        />
      </KitScope>
    );
    const spin = screen.getByRole('spinbutton', { name: 'Rotate' });
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
    fireEvent.keyDown(spin, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(5);

    fireEvent.pointerDown(spin, { button: 0, clientX: 10 });
    fireEvent.pointerUp(spin, { button: 0, clientX: 10 });
    const input = screen.getByRole('textbox', { name: 'Rotate' });
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(7);
    expect(screen.getByRole('spinbutton', { name: 'Rotate' })).toBeInTheDocument();
  });

  it('draws a bipolar fill from zero for signed ranges and unipolar from 0% otherwise', () => {
    const { container, rerender } = render(
      <KitScope>
        <ScrubNumber aria-label="Bipolar" value={0} range={[-4, 4]} onChange={() => {}} />
      </KitScope>
    );
    let fill = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(fill.style.left).toBe('50%');
    expect(fill.style.width).toBe('0%');

    rerender(
      <KitScope>
        <ScrubNumber aria-label="Bipolar" value={-2} range={[-4, 4]} onChange={() => {}} />
      </KitScope>
    );
    fill = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(fill.style.left).toBe('25%');
    expect(fill.style.width).toBe('25%');

    rerender(
      <KitScope>
        <ScrubNumber aria-label="Unipolar" value={3} range={[1, 5]} onChange={() => {}} />
      </KitScope>
    );
    fill = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(fill.style.left).toBe('0%');
    expect(fill.style.width).toBe('50%');
  });
});
