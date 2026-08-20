export interface ForteCatalogEntry {
  forteNumber: string;
  cardinality: number;
  primeForm: number[];
  intervalClassVector: [number, number, number, number, number, number];
  complement: string;
  zMate?: string;
}

export interface ForteSetSelection {
  forteNumber: string;
  primeForm: number[];
  intervalClassVector: [number, number, number, number, number, number];
  transposition: number;
  inverted: boolean;
  pitchClasses: number[];
}

/*
 * Forte/Rahn prime forms checked against the Humdrum **pcset reference table:
 * https://www.humdrum.org/rep/pcset/index.html
 *
 * Open Music Theory provides the corresponding set-class table and terminology
 * under CC BY-SA 4.0:
 * https://viva.pressbooks.pub/openmusictheory/chapter/set-class-and-prime-form/
 *
 * The compact rows below contain all 223 non-empty Fortean set classes of cardinalities 1–12.
 * Cardinalities outside Forte's original 3–9 catalog use the conventional extended labels.
 * Interval vectors, Z-mates, and complements are derived rather than duplicated.
 * A and B denote pitch classes 10 and 11 in the compact prime-form notation.
 */
const compactCatalog = `
1|1-1=0
2|2-1=01;2-2=02;2-3=03;2-4=04;2-5=05;2-6=06
3|3-1=012;3-2=013;3-3=014;3-4=015;3-5=016;3-6=024;3-7=025;3-8=026;3-9=027;3-10=036;3-11=037;3-12=048
4|4-1=0123;4-2=0124;4-3=0134;4-4=0125;4-5=0126;4-6=0127;4-7=0145;4-8=0156;4-9=0167;4-10=0235;4-11=0135;4-12=0236;4-13=0136;4-14=0237;4-Z15=0146;4-16=0157;4-17=0347;4-18=0147;4-19=0148;4-20=0158;4-21=0246;4-22=0247;4-23=0257;4-24=0248;4-25=0268;4-26=0358;4-27=0258;4-28=0369;4-Z29=0137
5|5-1=01234;5-2=01235;5-3=01245;5-4=01236;5-5=01237;5-6=01256;5-7=01267;5-8=02346;5-9=01246;5-10=01346;5-11=02347;5-Z12=01356;5-13=01248;5-14=01257;5-15=01268;5-16=01347;5-Z17=01348;5-Z18=01457;5-19=01367;5-20=01378;5-21=01458;5-22=01478;5-23=02357;5-24=01357;5-25=02358;5-26=02458;5-27=01358;5-28=02368;5-29=01368;5-30=01468;5-31=01369;5-32=01469;5-33=02468;5-34=02469;5-35=02479;5-Z36=01247;5-Z37=03458;5-Z38=01258
6|6-1=012345;6-2=012346;6-Z3=012356;6-Z4=012456;6-5=012367;6-Z6=012567;6-7=012678;6-8=023457;6-9=012357;6-Z10=013457;6-Z11=012457;6-Z12=012467;6-Z13=013467;6-14=013458;6-15=012458;6-16=014568;6-Z17=012478;6-18=012578;6-Z19=013478;6-20=014589;6-21=023468;6-22=012468;6-Z23=023568;6-Z24=013468;6-Z25=013568;6-Z26=013578;6-27=013469;6-Z28=013569;6-Z29=013689;6-30=013679;6-31=013589;6-32=024579;6-33=023579;6-34=013579;6-35=02468A;6-Z36=012347;6-Z37=012348;6-Z38=012378;6-Z39=023458;6-Z40=012358;6-Z41=012368;6-Z42=012369;6-Z43=012568;6-Z44=012569;6-Z45=023469;6-Z46=012469;6-Z47=012479;6-Z48=012579;6-Z49=013479;6-Z50=014679
7|7-1=0123456;7-2=0123457;7-3=0123458;7-4=0123467;7-5=0123567;7-6=0123478;7-7=0123678;7-8=0234568;7-9=0123468;7-10=0123469;7-11=0134568;7-Z12=0123479;7-13=0124568;7-14=0123578;7-15=0124678;7-16=0123569;7-Z17=0124569;7-Z18=0123589;7-19=0123679;7-20=0124789;7-21=0124589;7-22=0125689;7-23=0234579;7-24=0123579;7-25=0234679;7-26=0134579;7-27=0124579;7-28=0135679;7-29=0124679;7-30=0124689;7-31=0134679;7-32=0134689;7-33=012468A;7-34=013468A;7-35=013568A;7-Z36=0123568;7-Z37=0134578;7-Z38=0124578
8|8-1=01234567;8-2=01234568;8-3=01234569;8-4=01234578;8-5=01234678;8-6=01235678;8-7=01234589;8-8=01234789;8-9=01236789;8-10=02345679;8-11=01234579;8-12=01345679;8-13=01234679;8-14=01245679;8-Z15=01234689;8-16=01235789;8-17=01345689;8-18=01235689;8-19=01245689;8-20=01245789;8-21=0123468A;8-22=0123568A;8-23=0123578A;8-24=0124568A;8-25=0124678A;8-26=0124579A;8-27=0124578A;8-28=0134679A;8-Z29=01235679
9|9-1=012345678;9-2=012345679;9-3=012345689;9-4=012345789;9-5=012346789;9-6=01234568A;9-7=01234578A;9-8=01234678A;9-9=01235678A;9-10=01234679A;9-11=01235679A;9-12=01245689A
10|10-1=0123456789;10-2=012345678A;10-3=012345679A;10-4=012345689A;10-5=012345789A;10-6=012346789A
11|11-1=0123456789A
12|12-1=0123456789AB
`;

function modulo12(value: number) {
  return ((value % 12) + 12) % 12;
}

function decodePitchClass(character: string) {
  if (character === 'A') {
    return 10;
  }
  if (character === 'B') {
    return 11;
  }
  return Number(character);
}

export function intervalClassVector(
  pitchClasses: number[]
): [number, number, number, number, number, number] {
  const vector: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
  for (let left = 0; left < pitchClasses.length; left += 1) {
    for (let right = left + 1; right < pitchClasses.length; right += 1) {
      const distance = Math.abs(pitchClasses[right] - pitchClasses[left]);
      const intervalClass = Math.min(distance, 12 - distance);
      if (intervalClass >= 1 && intervalClass <= 6) {
        vector[intervalClass - 1] += 1;
      }
    }
  }
  return vector;
}

function classKey(pitchClasses: number[]) {
  const candidates: string[] = [];
  for (const direction of [1, -1]) {
    for (let transposition = 0; transposition < 12; transposition += 1) {
      candidates.push(
        [
          ...new Set(
            pitchClasses.map((pitchClass) => modulo12(direction * pitchClass + transposition))
          ),
        ]
          .sort((left, right) => left - right)
          .join(',')
      );
    }
  }
  return candidates.sort()[0];
}

const catalogCore = compactCatalog
  .trim()
  .split('\n')
  .flatMap((line) => {
    const [cardinalityText, entriesText] = line.split('|');
    const cardinality = Number(cardinalityText);
    return entriesText.split(';').map((encodedEntry) => {
      const [forteNumber, encodedPrimeForm] = encodedEntry.split('=');
      const primeForm = [...encodedPrimeForm].map(decodePitchClass);
      return {
        forteNumber,
        cardinality,
        primeForm,
        intervalClassVector: intervalClassVector(primeForm),
      };
    });
  });

const emptyComplement = {
  forteNumber: '0-0',
  cardinality: 0,
  primeForm: [] as number[],
  intervalClassVector: [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number],
};
const entryByClass = new Map(
  [emptyComplement, ...catalogCore].map((entry) => [classKey(entry.primeForm), entry])
);

export const forteCatalog: ForteCatalogEntry[] = catalogCore.map((entry) => {
  const complementPitchClasses = Array.from({ length: 12 }, (_, index) => index).filter(
    (pitchClass) => !entry.primeForm.includes(pitchClass)
  );
  const complement = entryByClass.get(classKey(complementPitchClasses));
  const zMate = entry.forteNumber.includes('Z')
    ? catalogCore.find(
        (candidate) =>
          candidate.forteNumber !== entry.forteNumber &&
          candidate.cardinality === entry.cardinality &&
          candidate.intervalClassVector.join(',') === entry.intervalClassVector.join(',')
      )
    : undefined;

  if (!complement) {
    throw new Error(`Missing Forte complement for ${entry.forteNumber}.`);
  }

  return {
    ...entry,
    complement: complement.forteNumber,
    zMate: zMate?.forteNumber,
  };
});

export function realizeForteSet(
  entry: ForteCatalogEntry,
  transposition: number,
  inverted: boolean
) {
  const direction = inverted ? -1 : 1;
  return [
    ...new Set(
      entry.primeForm.map((pitchClass) => modulo12(direction * pitchClass + transposition))
    ),
  ].sort((left, right) => left - right);
}

export function createForteSetSelection(
  entry: ForteCatalogEntry,
  transposition: number,
  inverted: boolean
): ForteSetSelection {
  return {
    forteNumber: entry.forteNumber,
    primeForm: entry.primeForm,
    intervalClassVector: entry.intervalClassVector,
    transposition: modulo12(transposition),
    inverted,
    pitchClasses: realizeForteSet(entry, transposition, inverted),
  };
}

export function formatPitchClassGroup(pitchClasses: number[]) {
  return `[${pitchClasses.join(' ')}]`;
}
