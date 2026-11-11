import { useEffect } from 'react';
import { render, screen, userEvent, waitFor } from '@test-utils';
import { CompositionSettingsProvider, useCompositionSettings } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { melodicize } from '../melodicization';
import { packet } from '../model';
import { musicalDuration } from '../musicalTime';
import { interpretPitchList } from '../pitch';
import { captureSnippet, type Snippet } from '../snippet';
import { DeskView } from './DeskView';

// Audition is not exercised here, so a silent stand-in engine is enough.
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: async () => undefined, subscribe: () => () => undefined }),
}));

function noteSnippet(text: string): Snippet {
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
  const captured = captureSnippet({
    id: 'snip-1',
    createdAt: '2026-11-11T00:00:00Z',
    name: 'Gesture',
    moduleInstance: 'mel-1',
    packet: result.packet,
  });
  if (!captured.ok) {
    throw new Error(captured.error);
  }
  return captured.snippet;
}

/** Puts a snippet on the desk and sets the project EDO once, then shows the desk. */
function Harness({ snippet, edo }: { snippet: Snippet; edo: number }) {
  const { addSnippet, snippets } = useDesk();
  const { updateSettings } = useCompositionSettings();
  useEffect(() => {
    updateSettings({ edo });
    addSnippet(snippet);
  }, [addSnippet, updateSettings, snippet, edo]);
  return (
    <>
      <div data-testid="count">{snippets.length}</div>
      <div data-testid="encodings">
        {snippets.map((entry) => entry.packet.encoding ?? '-').join(',')}
      </div>
      {snippets.length > 0 && <DeskView />}
    </>
  );
}

function renderDesk(snippet: Snippet, edo: number) {
  localStorage.clear();
  return render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <Harness snippet={snippet} edo={edo} />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
}

describe('DeskView pitch-class conversion', () => {
  it('converts straight away when every pitch is on the project EDO grid', async () => {
    renderDesk(noteSnippet('60, 64, 67, 72'), 12);
    await userEvent.click(await screen.findByRole('button', { name: 'To pitch classes' }));
    expect(screen.queryByText('Pitches off the grid')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('encodings').textContent?.endsWith('chromatic-12')).toBe(true);
  });

  it('prompts when pitches are off the grid; Cancel leaves the desk unchanged', async () => {
    renderDesk(noteSnippet('60, 64, 67, 72'), 19);
    await userEvent.click(await screen.findByRole('button', { name: 'To pitch classes' }));
    expect(
      await screen.findByText('2 pitches are off the 19-EDO grid. Snap them to the nearest step?')
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Pitches off the grid')).toBeNull());
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('prompts when pitches are off the grid; Snap adds a chromatic-19 copy', async () => {
    renderDesk(noteSnippet('60, 64, 67, 72'), 19);
    await userEvent.click(await screen.findByRole('button', { name: 'To pitch classes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Snap' }));
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));
    expect(screen.getByTestId('encodings').textContent?.endsWith('chromatic-19')).toBe(true);
    expect(screen.queryByText('Pitches off the grid')).toBeNull();
  });
});
