import { computeArithmetic } from './arithmetic';
import { defaultModuloTreatment } from './moduloTreatment';
import { packet, type DataDomain, type DataPacket } from './model';

function numberPacket(values: number[], domain: DataDomain = 'integer'): DataPacket<number> {
  return packet(
    values.length === 1 ? 'value' : 'list',
    domain,
    values.map((value, index) => ({ id: `n:${index}`, value, provenance: [] }))
  );
}

// Each element of `groups` is one bracketed pitch group (a chord); a single-number group is
// an unbracketed pitch, matching how Pitch List normalizes `60 [60 64 67] 62` into 3 groups.
// Both 'pitch' and 'pitchClass' items are bare numbers/number[] — no wrapper. Test values are
// authored as MIDI note numbers for 'pitch' (scaled to midicents here) and as raw 0-11 integers
// for 'pitchClass'.
function pitchGroupPacket(groups: number[][], domain: 'pitch' | 'pitchClass' = 'pitch'): DataPacket {
  return packet(
    groups.length === 1 ? 'value' : 'list',
    domain,
    groups.map((midis, index) => {
      const values = domain === 'pitch' ? midis.map((midi) => midi * 100) : midis;
      return {
        id: `g:${index}`,
        value: values.length > 1 ? values : values[0],
        provenance: [],
      };
    })
  );
}

function run(overrides: Partial<Parameters<typeof computeArithmetic>[0]> = {}) {
  return computeArithmetic({
    instanceId: 'arithmetic',
    operator: 'add',
    fallbackA: 0,
    fallbackB: 0,
    combineStrategy: 'zip',
    modulo: defaultModuloTreatment,
    ...overrides,
  });
}

describe('computeArithmetic', () => {
  it('adds two scalars', () => {
    const result = run({ operator: 'add', a: numberPacket([2]), b: numberPacket([3]) });
    expect(result.errors).toEqual([]);
    expect(result.packet.items.map((item) => item.value)).toEqual([5]);
    expect(result.packet.kind).toBe('value');
  });

  it('subtracts two scalars', () => {
    const result = run({ operator: 'subtract', a: numberPacket([5]), b: numberPacket([3]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([2]);
  });

  it('multiplies two scalars', () => {
    const result = run({ operator: 'multiply', a: numberPacket([4]), b: numberPacket([3]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([12]);
  });

  it('divides two scalars', () => {
    const result = run({ operator: 'divide', a: numberPacket([9]), b: numberPacket([3]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([3]);
  });

  it('floor-divides two scalars', () => {
    const result = run({ operator: 'floorDivide', a: numberPacket([7]), b: numberPacket([2]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([3]);
  });

  it('raises a to the power of b', () => {
    const result = run({ operator: 'power', a: numberPacket([2]), b: numberPacket([3]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([8]);
  });

  it('computes eˣ, ignoring B entirely', () => {
    const result = run({ operator: 'exp', a: numberPacket([1]), b: numberPacket([999]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([Math.E]);
  });

  it('broadcasts a scalar over a list, matching OM+ 2 (3 4) => (5 6)', () => {
    const result = run({ a: numberPacket([2]), b: numberPacket([3, 4]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([5, 6]);
    expect(result.packet.kind).toBe('list');
  });

  it('broadcasts a scalar on the right, matching OM* (2 3 4) 3 => (6 9 12)', () => {
    const result = run({ operator: 'multiply', a: numberPacket([2, 3, 4]), b: numberPacket([3]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([6, 9, 12]);
  });

  it('combines equal-length lists elementwise, matching OM+ (1 2) (3 4) => (4 6)', () => {
    const result = run({ a: numberPacket([1, 2]), b: numberPacket([3, 4]) });
    expect(result.packet.items.map((item) => item.value)).toEqual([4, 6]);
  });

  it('zip stops at the shorter list and warns about unused items', () => {
    const result = run({
      combineStrategy: 'zip',
      a: numberPacket([1, 2, 3]),
      b: numberPacket([10, 20]),
    });
    expect(result.packet.items.map((item) => item.value)).toEqual([11, 22]);
    expect(result.messages.some((message) => message.includes('trailing A item'))).toBe(true);
  });

  it('cycle repeats B across A when A is longer', () => {
    const result = run({
      combineStrategy: 'cycle',
      a: numberPacket([1, 2, 3, 4]),
      b: numberPacket([10, 20]),
    });
    expect(result.packet.items.map((item) => item.value)).toEqual([11, 22, 13, 24]);
  });

  it('cycle-rhythm repeats A across B when B is longer', () => {
    const result = run({
      combineStrategy: 'cycle-rhythm',
      a: numberPacket([10, 20]),
      b: numberPacket([1, 2, 3, 4]),
    });
    expect(result.packet.items.map((item) => item.value)).toEqual([11, 22, 13, 24]);
  });

  it('cartesian produces every combination', () => {
    // Equal-length lists always pair elementwise (matching OM's documented behavior), so
    // cartesian only actually diverges when lengths differ.
    const result = run({
      operator: 'add',
      combineStrategy: 'cartesian',
      a: numberPacket([1, 2]),
      b: numberPacket([10, 20, 30]),
    });
    expect(result.packet.items.map((item) => item.value)).toEqual([11, 21, 31, 12, 22, 32]);
  });

  it('uses operator defaults when both ports are unconnected', () => {
    const result = run({ operator: 'multiply', fallbackA: 5, fallbackB: 7 });
    expect(result.packet.items.map((item) => item.value)).toEqual([35]);
    expect(result.packet.domain).toBe('integer');
  });

  it('passes the shared domain through when A and B match', () => {
    const result = run({
      a: numberPacket([1], 'duration'),
      b: numberPacket([2], 'duration'),
    });
    expect(result.packet.domain).toBe('duration');
  });

  it('combines mismatched domains rather than refusing, matching OM: om+ has no domain concept', () => {
    // Verified against kernel.lisp: om+ dispatches purely on Lisp type (number/list), never on
    // what a list "means." Mixing a duration list and an integer list is completely normal there.
    const result = run({
      a: numberPacket([1], 'duration'),
      b: numberPacket([2], 'integer'),
    });
    expect(result.errors).toEqual([]);
    expect(result.packet.items.map((item) => item.value)).toEqual([3]);
  });

  it('falls back to an honest neutral domain when A and B disagree, instead of mislabeling the result', () => {
    const result = run({
      a: numberPacket([1], 'duration'),
      b: pitchGroupPacket([[60]]),
    });
    expect(result.errors).toEqual([]);
    expect(result.packet.domain).toBe('integer');
    // B was a single unbracketed pitch — already a bare number (no wrapper), so combining it
    // with A's bare number naturally stays a bare number. Only an actually-bracketed multi-note
    // group would combine into an array (see "broadcasts a scalar fallback across every pitch
    // in a bracketed chord" above).
    expect(result.packet.items[0].value).toEqual(6001);
  });

  it('warns on divide by zero and produces Infinity', () => {
    const result = run({ operator: 'divide', a: numberPacket([5]), b: numberPacket([0]) });
    expect(result.packet.items[0].value).toBe(Infinity);
    expect(result.messages.some((message) => message.includes('divided by zero'))).toBe(true);
  });

  it('warns on floor-divide by zero', () => {
    const result = run({ operator: 'floorDivide', a: numberPacket([5]), b: numberPacket([0]) });
    expect(Number.isNaN(result.packet.items[0].value) || result.packet.items[0].value === Infinity).toBe(
      true
    );
    expect(result.messages.some((message) => message.includes('divided by zero'))).toBe(true);
  });

  it('applies modulo post-processing when enabled', () => {
    const result = run({
      a: numberPacket([10]),
      b: numberPacket([5]),
      modulo: { enabled: true, divisor: 12 },
    });
    expect(result.packet.items.map((item) => item.value)).toEqual([3]);
  });

  it('wraps negative values positively under modulo', () => {
    const result = run({
      operator: 'subtract',
      a: numberPacket([1]),
      b: numberPacket([5]),
      modulo: { enabled: true, divisor: 12 },
    });
    expect(result.packet.items.map((item) => item.value)).toEqual([8]);
  });

  it('leaves values untouched when modulo is disabled', () => {
    const result = run({ a: numberPacket([20]), b: numberPacket([5]), modulo: { enabled: false, divisor: 12 } });
    expect(result.packet.items.map((item) => item.value)).toEqual([25]);
  });

  describe('nested pitch groups (OM-style list recursion)', () => {
    // Verified against OM 7.6's kernel.lisp: om+'s list+list method is a mapcar-based CLOS
    // dispatch that recurses through nested lists automatically. A pitch group's bracketed
    // pitches are exactly that kind of nested list, so a scalar or another pitch list combines
    // one level into the group instead of failing or flattening it away.

    it('broadcasts a scalar fallback over a single unbracketed pitch (transposition)', () => {
      const result = run({ a: pitchGroupPacket([[60]]), fallbackB: 200 });
      expect(result.packet.items.map((item) => item.value)).toEqual([6200]);
      expect(result.packet.domain).toBe('pitch');
    });

    it('broadcasts a scalar fallback across every pitch in a bracketed chord', () => {
      const result = run({ a: pitchGroupPacket([[60, 64, 67]]), fallbackB: 100 });
      expect(result.packet.items.map((item) => item.value)).toEqual([[6100, 6500, 6800]]);
    });

    it('broadcasts a single-pitch group across a multi-pitch chord group', () => {
      const result = run({
        a: pitchGroupPacket([[60, 64, 67]]),
        b: pitchGroupPacket([[100]]),
      });
      expect(result.packet.items.map((item) => item.value)).toEqual([[16000, 16400, 16700]]);
    });

    it('pairs two equal-size chord groups elementwise, matching the outer list pairing rule', () => {
      const result = run({
        a: pitchGroupPacket([[60, 64, 67]]),
        b: pitchGroupPacket([[1, 2, 3]]),
      });
      expect(result.packet.items.map((item) => item.value)).toEqual([[6100, 6600, 7000]]);
    });

    it('wraps pitchClass results into 0-11 regardless of the modulo toggle', () => {
      const result = run({ a: pitchGroupPacket([[10]], 'pitchClass'), fallbackB: 5 });
      expect(result.packet.items.map((item) => item.value)).toEqual([3]);
      expect(result.packet.domain).toBe('pitchClass');
    });

    it('falls back to an honest neutral domain for a mismatched flat domain (single unbracketed pitch)', () => {
      const result = run({ a: pitchGroupPacket([[60]]), b: numberPacket([5], 'duration') });
      expect(result.errors).toEqual([]);
      expect(result.packet.domain).toBe('integer');
      expect(result.packet.items[0].value).toEqual(6005);
    });

    it('keeps a bracketed multi-note chord\'s array structure when the other side is a mismatched flat domain', () => {
      const result = run({ a: pitchGroupPacket([[60, 64]]), b: numberPacket([5], 'duration') });
      expect(result.errors).toEqual([]);
      expect(result.packet.domain).toBe('integer');
      expect(result.packet.items[0].value).toEqual([6005, 6405]);
    });

    it('adds two pitch-class lists of separate single-note groups elementwise: [0 1 4] + [2 3 5] = [2 4 9]', () => {
      const result = run({
        a: pitchGroupPacket([[0], [1], [4]], 'pitchClass'),
        b: pitchGroupPacket([[2], [3], [5]], 'pitchClass'),
      });
      expect(result.packet.items.map((item) => item.value)).toEqual([2, 4, 9]);
      expect(result.packet.items.length).toBe(3);
    });
  });
});
