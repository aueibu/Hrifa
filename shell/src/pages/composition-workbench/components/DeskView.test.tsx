import { useEffect } from 'react';
import { render, screen, userEvent, waitFor } from '@test-utils';
import { CompositionSettingsProvider, useCompositionSettings } from '../compositionSettings';
import { captureDataBlock, type PacketBlock } from '../dataBlock';
import { DeskProvider, useDesk } from '../desk';
import { melodicize } from '../melodicization';
import { packet } from '../model';
import { musicalDuration } from '../musicalTime';
import { interpretPitchList } from '../pitch';
import { DeskView } from './DeskView';

// Audition is not exercised here, so a silent stand-in engine is enough.
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: async () => undefined, subscribe: () => () => undefined }),
}));

function noteDataBlock(text: string): PacketBlock {
  const rhythm = packet(
    'list',
    'duration',
    [1, 1, 2, 1].map((value, index) => ({ id: `rhythm:${index}`, value, provenance: [] })),
    [],
    undefined,
    { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: 5 } }
  );
  const result = melodicize({
    instanceId: 'melodicization',
    rhythm,
    pitches: interpretPitchList({ instanceId: 'pitch-list', format: 'midi-note', inlineText: text })
      .packet,
    allocation: 'cycle',
    pulseUnit: musicalDuration(1, 4),
    articulationPercent: 100,
  });
  const captured = captureDataBlock({
    id: 'data-block-1',
    createdAt: '2026-11-11T00:00:00Z',
    name: 'Gesture',
    nodeInstance: 'mel-1',
    packet: result.packet,
  });
  if (!captured.ok) {
    throw new Error(captured.error);
  }
  return captured.dataBlock;
}

/** Puts a data-block on the desk and sets the project EDO once, then shows the desk. */
function Harness({ dataBlock, edo }: { dataBlock: PacketBlock; edo: number }) {
  const { addDataBlock, dataBlocks, loading } = useDesk();
  const { updateSettings } = useCompositionSettings();
  useEffect(() => {
    if (loading) {
      return;
    }
    updateSettings({ edo });
    addDataBlock(dataBlock);
  }, [addDataBlock, updateSettings, dataBlock, edo, loading]);
  return (
    <>
      <div data-testid="count">{dataBlocks.length}</div>
      <div data-testid="encodings">
        {dataBlocks.map((entry) => entry.payload.packet.encoding ?? '-').join(',')}
      </div>
      {dataBlocks.length > 0 && <DeskView />}
    </>
  );
}

function renderDesk(dataBlock: PacketBlock, edo: number) {
  localStorage.clear();
  return render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <Harness dataBlock={dataBlock} edo={edo} />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
}

describe('DeskView pitch-class conversion', () => {
  it('converts straight away when every pitch is on the project EDO grid', async () => {
    renderDesk(noteDataBlock('60, 64, 67, 72'), 12);
    await userEvent.click(await screen.findByRole('button', { name: 'To pitch classes' }));
    expect(screen.queryByText('Pitches off the grid')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('encodings').textContent?.endsWith('chromatic-12')).toBe(true);
  });

  it('prompts when pitches are off the grid; Cancel leaves the desk unchanged', async () => {
    renderDesk(noteDataBlock('60, 64, 67, 72'), 19);
    await userEvent.click(await screen.findByRole('button', { name: 'To pitch classes' }));
    expect(
      await screen.findByText('2 pitches are off the 19-EDO grid. Snap them to the nearest step?')
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Pitches off the grid')).toBeNull());
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('prompts when pitches are off the grid; Snap adds a chromatic-19 copy', async () => {
    renderDesk(noteDataBlock('60, 64, 67, 72'), 19);
    await userEvent.click(await screen.findByRole('button', { name: 'To pitch classes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Snap' }));
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('encodings').textContent?.endsWith('chromatic-19')).toBe(true);
    expect(screen.queryByText('Pitches off the grid')).toBeNull();
  });
});
