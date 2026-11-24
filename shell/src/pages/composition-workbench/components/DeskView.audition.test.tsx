import { useEffect } from 'react';
import { render, screen, userEvent, waitFor } from '@test-utils';
import type { MusicalPerformancePlan, PlaybackRequest } from '../audio/types';
import { AUDITION_PREFERENCES_KEY } from '../auditionPreferences';
import { CompositionSettingsProvider, useCompositionSettings } from '../compositionSettings';
import { captureDataBlock, type PacketBlock } from '../dataBlock';
import { DATA_BLOCK_SCHEMA_VERSION } from '../dataBlocks/registry';
import { DeskProvider, useDesk } from '../desk';
import { melodicize } from '../melodicization';
import { packet, type DataDomain, type DataEncoding, type DataKind } from '../model';
import { musicalDuration, rationalToNumber } from '../musicalTime';
import { interpretPitchList } from '../pitch';
import { DeskView } from './DeskView';

// A stand-in engine: it records each request and hands back a session that can be stopped.
const played: PlaybackRequest[] = [];
const stopped = vi.fn();
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    play: async (request: PlaybackRequest) => {
      played.push(request);
      return {
        id: `s${played.length}`,
        sourceId: request.plan.sourceId,
        active: true,
        stop: stopped,
        setBusGain: () => undefined,
      };
    },
    subscribe: () => () => undefined,
  }),
}));

function block(
  typeId: string,
  name: string,
  kind: DataKind,
  domain: DataDomain,
  values: unknown[],
  semantics: { encoding?: DataEncoding } = {}
): PacketBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id: name.toLowerCase(),
    typeId,
    name,
    createdAt: '2026-11-24T00:00:00Z',
    payload: {
      kind: 'packet',
      packet: packet(
        kind,
        domain,
        values.map((value, index) => ({ id: `i${index}`, value, provenance: [] })),
        [],
        undefined,
        semantics
      ),
    },
  };
}

function notesBlock(): PacketBlock {
  const rhythm = packet(
    'list',
    'duration',
    [1, 1, 2].map((value, index) => ({ id: `r${index}`, value, provenance: [] })),
    [],
    undefined,
    { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: 4 } }
  );
  const result = melodicize({
    instanceId: 'melodicization',
    rhythm,
    pitches: interpretPitchList({ instanceId: 'p', format: 'midi-note', inlineText: '60, 64' })
      .packet,
    allocation: 'cycle',
    pulseUnit: musicalDuration(1, 4),
    articulationPercent: 100,
  });
  const captured = captureDataBlock({
    id: 'gesture',
    createdAt: '2026-11-24T00:00:00Z',
    name: 'Gesture',
    nodeInstance: 'mel',
    packet: result.packet,
  });
  if (!captured.ok) {
    throw new Error(captured.error);
  }
  return captured.dataBlock;
}

function Harness({ dataBlock, pulse }: { dataBlock: PacketBlock; pulse?: string }) {
  const { addDataBlock, dataBlocks, loading } = useDesk();
  const { settings, updateSettings } = useCompositionSettings();
  useEffect(() => {
    if (pulse && settings.transport.pulse !== pulse) {
      updateSettings({ transport: { ...settings.transport, pulse } });
    }
  }, [pulse, settings.transport, updateSettings]);
  useEffect(() => {
    if (!loading) {
      addDataBlock(dataBlock);
    }
  }, [addDataBlock, dataBlock, loading]);
  return (
    <>
      <div data-testid="stored">{JSON.stringify(dataBlocks[0]?.payload)}</div>
      {dataBlocks.length > 0 && <DeskView />}
    </>
  );
}

async function renderCard(dataBlock: PacketBlock, pulse?: string) {
  localStorage.clear();
  played.length = 0;
  stopped.mockClear();
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <Harness dataBlock={dataBlock} pulse={pulse} />
      </DeskProvider>
    </CompositionSettingsProvider>
  );
  await screen.findByRole('button', { name: /Play|Stop/ });
}

const lastPlan = () => played[played.length - 1].plan as MusicalPerformancePlan;
const pitches = () => lastPlan().events.map((event) => event.pitchMidicents);
const starts = () => lastPlan().events.map((event) => rationalToNumber(event.at.quarterNotes));
const play = () => userEvent.click(screen.getByRole('button', { name: '▶ Play' }));
const openSettings = () =>
  userEvent.click(screen.getByRole('button', { name: 'Audition settings' }));

describe('the desk card Play (R3)', () => {
  // First onset after the 3-pulse start: 0.75 quarter notes on a quarter pulse, half that on an eighth.
  it.each([
    ['1/4', 0.75],
    ['1/8', 0.375],
  ])('a Rhythm plays on the transport pulse %s', async (pulse, secondOnset) => {
    await renderCard(block('rhythm', 'Pulse', 'list', 'duration', [3, 3, 4]), pulse);
    await waitFor(() => expect(screen.getByRole('button', { name: '▶ Play' })).toBeEnabled());
    await play();
    await waitFor(() => expect(played).toHaveLength(1));
    expect(starts()[1]).toBe(secondOnset);
  });

  it('plays a Pitch set in sequence, and Together makes one group; the stored block is untouched', async () => {
    await renderCard(
      block('pitch-set', 'Ring', 'list', 'pitch', [6400, 6000, 6700], { encoding: 'midicent' })
    );
    const stored = screen.getByTestId('stored').textContent;
    await play();
    await waitFor(() => expect(played).toHaveLength(1));
    expect(pitches()).toEqual([6000, 6400, 6700]);
    expect(starts()).toEqual([0, 1, 2]);
    expect(played[0].loop).toBe(true);
    await userEvent.click(await screen.findByRole('button', { name: '■ Stop' }));
    expect(stopped).toHaveBeenCalled();

    await openSettings();
    // Base octave and Offset belong to Pitch classes only.
    expect(screen.queryByLabelText('Base octave')).toBeNull();
    await userEvent.click(screen.getByText('Together'));
    await play();
    await waitFor(() => expect(played).toHaveLength(2));
    expect(starts()).toEqual([0, 0, 0]);
    expect(screen.getByTestId('stored').textContent).toBe(stored);
    expect(JSON.parse(localStorage.getItem(AUDITION_PREFERENCES_KEY) ?? '{}').mode).toBe(
      'together'
    );
  });

  it('Pitch classes show Base octave and Offset; offset 3 on {0,4,7} plays 3, 7, 10', async () => {
    await renderCard(
      block('pitch-classes', 'Three pitches', 'list', 'pitchClass', [0, 4, 7], {
        encoding: 'chromatic-12',
      })
    );
    await openSettings();
    const offset = screen.getByLabelText('Offset');
    expect(screen.getByLabelText('Base octave')).toHaveValue('4');
    await userEvent.clear(offset);
    await userEvent.type(offset, '3');
    await userEvent.keyboard('{Escape}');
    await play();
    await waitFor(() => expect(played).toHaveLength(1));
    // Middle C is 6000 midicents; each step is a semitone here.
    expect(pitches()).toEqual([6300, 6700, 7000]);
  });

  it('a Rhythm loops until Stop; with Loop off it plays one cycle', async () => {
    await renderCard(block('rhythm', 'Clave', 'list', 'duration', [3, 3, 4, 2, 4], {}));
    await play();
    await waitFor(() => expect(played).toHaveLength(1));
    expect(played[0].loop).toBe(true);
    expect(lastPlan().duration).toEqual(musicalDuration(4));
    await userEvent.click(await screen.findByRole('button', { name: '■ Stop' }));
    expect(stopped).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '▶ Play' })).toBeEnabled();

    await openSettings();
    await userEvent.click(screen.getByLabelText('Loop'));
    await userEvent.keyboard('{Escape}');
    await play();
    await waitFor(() => expect(played).toHaveLength(2));
    expect(played[1].loop).toBe(false);
  });

  it('Values cannot Play; Hear as MIDI note numbers plays 3, 5, 8 as 300, 500, 800 midicents', async () => {
    await renderCard(block('values', 'Numbers', 'list', 'integer', [3, 5, 8]));
    const stored = screen.getByTestId('stored').textContent;
    const button = screen.getByRole('button', { name: '▶ Play' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('data-info', 'Values have no sound of their own.');
    const hear = screen.getByRole('button', { name: 'Hear as MIDI note numbers' });
    expect(hear).toHaveAttribute(
      'data-info',
      'Each number is a MIDI note number (60 = C4); the data is not changed.'
    );
    await userEvent.click(hear);
    await waitFor(() => expect(played).toHaveLength(1));
    expect(pitches()).toEqual([300, 500, 800]);
    expect(screen.getByTestId('stored').textContent).toBe(stored);
  });

  it('an empty card is disabled with the reason', async () => {
    await renderCard(block('pitch-set', 'Nothing', 'list', 'pitch', [], { encoding: 'midicent' }));
    const button = screen.getByRole('button', { name: '▶ Play' });
    expect(button).toBeDisabled();
    expect(button.getAttribute('data-info')).toMatch(/empty/);
  });

  it('a Notes card still plays as written, once', async () => {
    await renderCard(notesBlock());
    await play();
    await waitFor(() => expect(played).toHaveLength(1));
    expect(pitches()).toEqual([6000, 6400, 6000]);
    expect(played[0].loop).toBe(false);
    // Nothing to set for a Notes card.
    expect(screen.queryByRole('button', { name: 'Audition settings' })).toBeNull();
  });
});
