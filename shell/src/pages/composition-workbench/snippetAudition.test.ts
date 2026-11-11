import { describe, expect, it } from 'vitest';
import { createNotePacketPerformancePlan } from './audio/performancePlans';
import type { MusicalPerformancePlan } from './audio/types';
import { melodicize, type NoteEventValue } from './melodicization';
import { packet, type DataPacket } from './model';
import { musicalDuration } from './musicalTime';
import { interpretPitchList } from './pitch';
import { captureSnippet } from './snippet';
import {
  applyTransport,
  defaultTransportSettings,
  METER_BUS,
  transportTimeline,
} from './transport';

function notes(): DataPacket<NoteEventValue> {
  const rhythm = packet(
    'list',
    'duration',
    [2, 1, 1, 2, 3, 1].map((value, index) => ({ id: `r:${index}`, value, provenance: [] })),
    [],
    undefined,
    { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: 10 } }
  );
  return melodicize({
    instanceId: 'mel',
    rhythm,
    pitches: interpretPitchList({ instanceId: 'p', format: 'midi-note', inlineText: '60, 62, 66.5' })
      .packet,
    allocation: 'cycle',
    pulseUnit: musicalDuration(1, 4),
    articulationPercent: 100,
  }).packet;
}

describe('auditioning a captured snippet on the transport', () => {
  const settings = { ...defaultTransportSettings, metronome: true };

  function planFor(selected: number[]) {
    const source = notes();
    const captured = captureSnippet({
      id: 's',
      createdAt: 'now',
      name: 'x',
      packet: source,
      moduleInstance: 'mel',
      itemIds: selected.map((index) => source.items[index].id),
    });
    if (!captured.ok) {
      throw new Error(captured.error);
    }
    return createNotePacketPerformancePlan({
      sourceId: 'mel',
      packet: captured.snippet.packet as DataPacket<NoteEventValue>,
      timeline: transportTimeline(settings),
    });
  }

  it('gets meter clicks on the meter bus alongside its notes', () => {
    const withClicks = applyTransport(planFor([2, 3, 4]), settings) as MusicalPerformancePlan;
    const clicks = withClicks.events.filter((event) => event.busId === METER_BUS);
    const material = withClicks.events.filter((event) => event.busId !== METER_BUS);
    expect(material.length).toBeGreaterThan(0);
    expect(clicks.length).toBeGreaterThan(0);
  });

  it('keeps the clicks for a selection that starts late in the clip', () => {
    const early = applyTransport(planFor([0]), settings) as MusicalPerformancePlan;
    const late = applyTransport(planFor([5]), settings) as MusicalPerformancePlan;
    const count = (plan: MusicalPerformancePlan) =>
      plan.events.filter((event) => event.busId === METER_BUS).length;
    expect(count(early)).toBeGreaterThan(0);
    expect(count(late)).toBeGreaterThan(0);
  });
});
