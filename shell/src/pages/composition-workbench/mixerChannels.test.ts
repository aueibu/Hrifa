import { defaultMixerPorts, mixerPortLabels } from './compositionWorkspace';
import type { NoteEventValue } from './melodicization';
import { compileMixerPlan, defaultChannelConfig } from './mixer';
import {
  acceptsMixerChannels,
  defaultMixerChannelSettings,
  isMixerSourceCandidate,
  mixerChannelMaterial,
} from './mixerChannels';
import { packet, type DataItem } from './model';
import { defaultMusicalTimeline, musicalDuration, musicalPosition } from './musicalTime';
import { defaultSoundSettings, layerSound } from './sounds';

const options = {
  sourceId: 'mix',
  channelId: 'a',
  pulseUnit: musicalDuration(1, 4),
  sound: layerSound(defaultSoundSettings.rhythm, 0),
  gatePercent: 95,
};

const item = <T>(index: number, value: T): DataItem<T> => ({
  id: `i${index}`,
  value,
  provenance: [],
});
const rhythm = (values: number[], role?: 'interOnset') =>
  packet<number>(
    'list',
    'duration',
    values.map((v, i) => item(i, v)),
    [],
    undefined,
    {
      role,
      frame: { topology: 'cyclic', extent: values.reduce((a, b) => a + Math.abs(b), 0) },
    }
  );

describe('mixerChannelMaterial', () => {
  it('plays an inter-onset rhythm on a rhythm voice', () => {
    const result = mixerChannelMaterial(rhythm([2, 1, 1, 2], 'interOnset'), options);
    expect(result).toMatchObject({ status: 'ready', source: 'rhythm' });
  });

  it('plays rests as silence', () => {
    const result = mixerChannelMaterial(rhythm([2, -1, 2], 'interOnset'), options);
    expect(result.status === 'ready' && result.material.events).toHaveLength(2);
  });

  it('plays a note stream directly', () => {
    const notes = packet<NoteEventValue>(
      'events',
      'note',
      [
        item(0, {
          onset: musicalPosition(0),
          interOnset: musicalDuration(1),
          duration: musicalDuration(1),
          pitches: [6000],
          velocity: 1,
        }),
      ],
      [],
      undefined,
      { frame: { topology: 'linear', musicalExtent: musicalDuration(2) } }
    );
    expect(mixerChannelMaterial(notes, options)).toMatchObject({
      status: 'ready',
      source: 'notes',
    });
  });

  it('asks for an explicit rhythm interpretation instead of guessing at plain numbers', () => {
    const numeric = packet<number>('list', 'integer', [item(0, 2), item(1, 3)]);
    const result = mixerChannelMaterial(numeric, options);
    expect(result).toMatchObject({ status: 'error' });
    expect(result.status === 'error' && result.message).toMatch(/Interpret as rhythm/);
  });

  it('refuses a pitch list, which has no rhythm', () => {
    const pitches = packet<number>('list', 'pitch', [item(0, 6000)]);
    const result = mixerChannelMaterial(pitches, options);
    expect(result.status === 'error' && result.message).toMatch(/no rhythm to play/);
  });

  it('reports an unconnected channel as empty', () => {
    expect(mixerChannelMaterial(undefined, options)).toEqual({ status: 'empty' });
  });

  it('feeds the mixer: a rhythm and a different-length rhythm realign at their LCM', () => {
    const a = mixerChannelMaterial(rhythm([3, 3], 'interOnset'), options);
    const b = mixerChannelMaterial(rhythm([4, 4, 4], 'interOnset'), { ...options, channelId: 'b' });
    if (a.status !== 'ready' || b.status !== 'ready') {
      throw new Error('expected ready channels');
    }
    const result = compileMixerPlan({
      sourceId: 'mix',
      timeline: defaultMusicalTimeline,
      channels: [
        { config: defaultChannelConfig('a'), material: a.material },
        { config: defaultChannelConfig('b'), material: b.material },
      ],
    });
    // 6 and 12 sixteenth-note pulses realign every 12 pulses = 3 quarter notes.
    expect(result.realignment).toEqual(musicalDuration(3));
    expect(result.loopable).toBe(true);
  });
});

describe('source candidates', () => {
  it('offers note streams and rhythm-interpretable lists, not pitch lists', () => {
    expect(isMixerSourceCandidate(packet('events', 'note', []))).toBe(true);
    expect(isMixerSourceCandidate(packet('list', 'duration', []))).toBe(true);
    expect(isMixerSourceCandidate(packet('list', 'integer', []))).toBe(true);
    expect(isMixerSourceCandidate(packet('list', 'pitch', []))).toBe(false);
  });
});

describe('channel settings persistence guard', () => {
  it('accepts the defaults and an empty record, and rejects malformed entries', () => {
    expect(acceptsMixerChannels({})).toBe(true);
    expect(acceptsMixerChannels({ a: defaultMixerChannelSettings })).toBe(true);
    expect(acceptsMixerChannels({ a: { ...defaultMixerChannelSettings, loop: 'sideways' } })).toBe(
      false
    );
    expect(acceptsMixerChannels({ a: { ...defaultMixerChannelSettings, offsetPulses: -1 } })).toBe(
      false
    );
    expect(acceptsMixerChannels({ a: { ...defaultMixerChannelSettings, offsetPulses: 1.5 } })).toBe(
      false
    );
    expect(acceptsMixerChannels(null)).toBe(false);
  });
});

describe('mixer ports', () => {
  it('numbers channels by position while ids stay stable', () => {
    const ports = defaultMixerPorts();
    expect(new Set(ports.map((port) => port.id)).size).toBe(2);
    const state = Object.fromEntries(ports.map((port) => [port.id, {} as never]));
    expect(mixerPortLabels(state).map((port) => port.label)).toEqual(['Ch 1', 'Ch 2']);
    expect(mixerPortLabels(undefined)).toEqual([]);
  });
});
