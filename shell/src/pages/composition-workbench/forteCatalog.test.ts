import {
  createForteSetSelection,
  forteCatalog,
  formatPitchClassGroup,
  intervalClassVector,
  realizeForteSet,
} from './forteCatalog';

describe('Forte set-class catalog', () => {
  it('contains all 223 non-empty set classes from cardinalities one through twelve', () => {
    expect(forteCatalog).toHaveLength(223);
    expect(
      Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => {
          const cardinality = index + 1;
          return [
            cardinality,
            forteCatalog.filter((entry) => entry.cardinality === cardinality).length,
          ];
        })
      )
    ).toEqual({
      1: 1,
      2: 6,
      3: 12,
      4: 29,
      5: 38,
      6: 50,
      7: 38,
      8: 29,
      9: 12,
      10: 6,
      11: 1,
      12: 1,
    });
    expect(forteCatalog.find((entry) => entry.forteNumber === '12-1')).toMatchObject({
      primeForm: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      complement: '0-0',
    });
  });

  it('identifies the major/minor triad class and its complement', () => {
    expect(forteCatalog.find((entry) => entry.forteNumber === '3-11')).toEqual({
      forteNumber: '3-11',
      cardinality: 3,
      primeForm: [0, 3, 7],
      intervalClassVector: [0, 0, 1, 1, 1, 0],
      complement: '9-11',
      zMate: undefined,
    });
  });

  it('derives Z-mates and self-cardinality complements independently', () => {
    expect(forteCatalog.find((entry) => entry.forteNumber === '6-Z17')).toMatchObject({
      intervalClassVector: [3, 2, 2, 3, 3, 2],
      complement: '6-Z43',
      zMate: '6-Z43',
    });
    expect(forteCatalog.find((entry) => entry.forteNumber === '4-Z15')).toMatchObject({
      complement: '8-Z15',
      zMate: '4-Z29',
    });
  });

  it('realizes inversion and transposition without assigning register', () => {
    const triad = forteCatalog.find((entry) => entry.forteNumber === '3-11')!;
    expect(realizeForteSet(triad, 0, false)).toEqual([0, 3, 7]);
    expect(realizeForteSet(triad, 0, true)).toEqual([0, 5, 9]);
    expect(realizeForteSet(triad, 2, false)).toEqual([2, 5, 9]);
    expect(formatPitchClassGroup(realizeForteSet(triad, 2, true))).toBe('[2 7 11]');
    expect(createForteSetSelection(triad, 14, true)).toMatchObject({
      transposition: 2,
      inverted: true,
      pitchClasses: [2, 7, 11],
    });
  });

  it('counts interval classes from unordered pitch-class pairs', () => {
    expect(intervalClassVector([0, 4, 8])).toEqual([0, 0, 0, 3, 0, 0]);
    expect(intervalClassVector([0, 1, 2, 4, 7, 8])).toEqual([3, 2, 2, 3, 3, 2]);
  });
});
