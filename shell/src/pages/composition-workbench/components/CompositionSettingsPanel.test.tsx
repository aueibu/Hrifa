import { render, screen, userEvent, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionSettingsProvider, useCompositionSettings } from '../compositionSettings';
import { resetHistory } from '../history';
import { CompositionSettingsPanel } from './CompositionSettingsPanel';

vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ stopAll: vi.fn(), play: vi.fn(), stop: vi.fn() }),
}));

function Probe() {
  const { settings } = useCompositionSettings();
  return (
    <output data-testid="pcs">{`${settings.pitchSet.preset}:${settings.pitchSet.pcs.join(',')}`}</output>
  );
}

function renderPanel() {
  render(
    <CompositionSettingsProvider>
      <CompositionSettingsPanel onClose={() => undefined} />
      <Probe />
    </CompositionSettingsProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  resetHistory();
});

describe('pitch set control', () => {
  it('shows one chip per pitch of the EDO, checked for the major default', () => {
    renderPanel();
    const group = screen.getByRole('group', { name: 'Pitches in the set' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(12);
    expect(within(group).getByRole('checkbox', { name: 'C' })).toBeChecked();
    expect(within(group).getByRole('checkbox', { name: 'C#' })).not.toBeChecked();
  });

  it('toggling a pitch changes the set', async () => {
    const user = userEvent.setup();
    renderPanel();
    const group = screen.getByRole('group', { name: 'Pitches in the set' });
    await user.click(within(group).getByRole('checkbox', { name: 'F#' }));
    expect(screen.getByTestId('pcs')).toHaveTextContent('major:0,2,4,5,6,7,9,11');
    await user.click(within(group).getByRole('checkbox', { name: 'C' }));
    expect(screen.getByTestId('pcs')).toHaveTextContent('major:2,4,5,6,7,9,11');
  });

  it('changing the preset fills the set from the tonic', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getAllByLabelText('Tonic')[0]);
    await user.click(await screen.findByRole('option', { name: 'D' }));
    expect(screen.getByTestId('pcs')).toHaveTextContent('major:1,2,4,6,7,9,11');
    await user.click(screen.getAllByLabelText('Preset')[0]);
    await user.click(await screen.findByRole('option', { name: 'Natural minor' }));
    expect(screen.getByTestId('pcs')).toHaveTextContent('natural-minor:0,2,4,5,7,9,10');
  });

  it('outside 12-EDO offers only chromatic and disables the tonic', async () => {
    const user = userEvent.setup();
    localStorage.setItem('hrifa.composition-workbench.settings.v1', JSON.stringify({ edo: 19 }));
    renderPanel();
    expect(screen.getByTestId('pcs')).toHaveTextContent('chromatic:');
    expect(screen.getAllByLabelText('Tonic')[0]).toBeDisabled();
    await user.click(screen.getAllByLabelText('Preset')[0]);
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Chromatic' })).toBeInTheDocument();
  });
});
