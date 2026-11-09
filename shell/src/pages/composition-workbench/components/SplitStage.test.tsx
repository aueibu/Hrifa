import { useState } from 'react';
import { render, screen, userEvent } from '@test-utils';
import { clampSplit, MAX_SPLIT, MIN_SPLIT, SplitStage } from './SplitStage';

function Harness({ initialCollapsed = false }: { initialCollapsed?: boolean }) {
  const [split, setSplit] = useState(0.5);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <SplitStage
      split={split}
      onSplit={setSplit}
      collapsed={collapsed}
      onCollapsed={setCollapsed}
      top={<div>canvas</div>}
      bottom={<div>editor</div>}
    />
  );
}

describe('clampSplit', () => {
  it('keeps the canvas share within bounds', () => {
    expect(clampSplit(0)).toBe(MIN_SPLIT);
    expect(clampSplit(1)).toBe(MAX_SPLIT);
    expect(clampSplit(0.5)).toBe(0.5);
  });
});

describe('SplitStage', () => {
  it('collapses the detail panel without unmounting its content', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('editor')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Hide detail panel' }));
    // Module editors publish outputs, so they must stay mounted while hidden.
    expect(screen.getByText('editor', { ignore: '' })).toBeInTheDocument();
    expect(screen.getByText('editor').closest('[hidden]')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show detail panel' }));
    expect(screen.getByText('editor')).toBeVisible();
  });

  it('resizes from the keyboard within limits', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const grip = screen.getByRole('separator', { name: 'Resize detail panel' });
    expect(grip).toHaveAttribute('aria-valuenow', '50');

    grip.focus();
    await user.keyboard('{ArrowDown}');
    expect(grip).toHaveAttribute('aria-valuenow', '55');
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(grip).toHaveAttribute('aria-valuenow', String(Math.round(MIN_SPLIT * 100)));
  });

  it('is not resizable while collapsed', () => {
    render(<Harness initialCollapsed />);
    expect(screen.getByRole('separator', { name: 'Resize detail panel' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });
});
