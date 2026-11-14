/** Kit behaviours that are not styling: toggle role and keyboard, the row contract, density through one token set, tip delay. */
import { useState } from 'react';
import { act, fireEvent, render, screen, userEvent } from '@test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { StageStorage } from '../persistence';
import {
  DEFAULT_TIP_DELAY,
  DENSITY_TOKENS,
  FIXED_TOKENS,
  KitScope,
  NumberField,
  Row,
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
  it('has the same token keys in every density, so a density swaps values and nothing else', () => {
    const keys = (d: keyof typeof DENSITY_TOKENS) => Object.keys(DENSITY_TOKENS[d]).sort();
    expect(keys('roomy')).toEqual(keys('compact'));
  });

  it('writes one custom-property set per density, differing only in the density values', () => {
    const compact = tokenStyle('compact') as Record<string, string>;
    const roomy = tokenStyle('roomy') as Record<string, string>;
    expect(Object.keys(roomy).sort()).toEqual(Object.keys(compact).sort());
    expect(compact['--kit-row-height']).toBe('1.625rem'); // Q9
    expect(roomy['--kit-row-height']).not.toBe(compact['--kit-row-height']);
    for (const k of Object.keys(FIXED_TOKENS)) {
      const name = `--kit-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      expect(roomy[name]).toBe(compact[name]);
    }
  });

  it('KitScope applies the chosen set and nested scopes override it', () => {
    function Probe() {
      return <span data-testid="probe">{useDensity()}</span>;
    }
    render(
      <KitScope density="compact">
        <Probe />
        <KitScope density="roomy">
          <Probe />
        </KitScope>
      </KitScope>
    );
    const scopes = document.querySelectorAll('[data-kit-density]');
    expect(scopes).toHaveLength(2);
    expect((scopes[0] as HTMLElement).style.getPropertyValue('--kit-row-height')).toBe(
      DENSITY_TOKENS.compact.rowHeight
    );
    expect((scopes[1] as HTMLElement).style.getPropertyValue('--kit-row-height')).toBe(
      DENSITY_TOKENS.roomy.rowHeight
    );
    expect(screen.getAllByTestId('probe').map((n) => n.textContent)).toEqual(['compact', 'roomy']);
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
