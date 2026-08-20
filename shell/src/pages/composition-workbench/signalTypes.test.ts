import { signalTypeFor, signalTypeRegistry } from './signalTypes';
import { packet, type DataPacket } from './model';

function samplePacket(domain: DataPacket['domain'], kind: DataPacket['kind'] = 'list'): DataPacket {
  return packet(kind, domain, [{ id: '0', value: 1, provenance: [] }]);
}

describe('signalTypeFor', () => {
  it('classifies pitch and pitch-class packets as pitch', () => {
    expect(signalTypeFor(samplePacket('pitch'))).toBe('pitch');
    expect(signalTypeFor(samplePacket('pitchClass'))).toBe('pitch');
  });

  it('classifies duration lists as rhythm', () => {
    expect(signalTypeFor(samplePacket('duration'))).toBe('rhythm');
  });

  it('does not classify a non-list duration value as rhythm', () => {
    expect(signalTypeFor(samplePacket('duration', 'value'))).toBe('numeric');
  });

  it('falls back to numeric for everything else, including undefined', () => {
    expect(signalTypeFor(samplePacket('integer'))).toBe('numeric');
    expect(signalTypeFor(undefined)).toBe('numeric');
  });
});

describe('signalTypeRegistry', () => {
  it('every entry is internally consistent: default is identity and accepted', () => {
    for (const definition of Object.values(signalTypeRegistry)) {
      expect(definition.accepts(definition.default)).toBe(true);
      expect(definition.isIdentity(definition.default, undefined)).toBe(true);
    }
  });

  it('pitch apply() only transforms pitch/pitchClass domains, passing everything else through', () => {
    const source = samplePacket('duration');
    const result = signalTypeRegistry.pitch.apply(source, signalTypeRegistry.pitch.default, 'route:test');
    expect(result).toBe(source);
  });

  it('rhythm apply() only transforms duration-domain lists, passing everything else through', () => {
    const source = samplePacket('pitch');
    const result = signalTypeRegistry.rhythm.apply(source, signalTypeRegistry.rhythm.default, 'route:test');
    expect(result).toBe(source);
  });

  it('numeric apply() always passes the source through unchanged', () => {
    const source = samplePacket('integer');
    const result = signalTypeRegistry.numeric.apply(source, { bypassed: false }, 'route:test');
    expect(result).toBe(source);
  });
});
