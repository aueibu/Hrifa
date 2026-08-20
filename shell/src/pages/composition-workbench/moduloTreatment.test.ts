import { applyModulo, acceptsModuloTreatment, defaultModuloTreatment } from './moduloTreatment';

function items(values: number[]) {
  return values.map((value, index) => ({ id: `item:${index}`, value, provenance: [] }));
}

describe('applyModulo', () => {
  it('passes items through unchanged when disabled', () => {
    const result = applyModulo(items([5, 20, -3]), { enabled: false, divisor: 12 });
    expect(result.map((item) => item.value)).toEqual([5, 20, -3]);
  });

  it('wraps positive values into range', () => {
    const result = applyModulo(items([15, 24, 5]), { enabled: true, divisor: 12 });
    expect(result.map((item) => item.value)).toEqual([3, 0, 5]);
  });

  it('wraps negative values into a positive range', () => {
    const result = applyModulo(items([-1, -13]), { enabled: true, divisor: 12 });
    expect(result.map((item) => item.value)).toEqual([11, 11]);
  });

  it('appends modulo provenance when enabled', () => {
    const result = applyModulo(items([5]), { enabled: true, divisor: 12 });
    expect(result[0].provenance.at(-1)).toMatchObject({
      transformation: 'modulo',
      parameters: { divisor: 12 },
    });
  });
});

describe('acceptsModuloTreatment', () => {
  it('accepts the default treatment', () => {
    expect(acceptsModuloTreatment(defaultModuloTreatment)).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(acceptsModuloTreatment(null)).toBe(false);
    expect(acceptsModuloTreatment({ enabled: true })).toBe(false);
    expect(acceptsModuloTreatment({ enabled: 'yes', divisor: 12 })).toBe(false);
  });
});
