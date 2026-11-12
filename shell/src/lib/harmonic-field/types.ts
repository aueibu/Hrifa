/**
 * Shared types for the harmonic-field core.
 *
 * Data model (see README.md):
 *   Monzo : plain object `{ prime: exponent }` (keys are prime numbers written as strings), e.g. 3/2 = `{ 2: -1, 3: 1 }`.
 *   Note  : `{ m, c }`. `m === null` means irrational (cents only, e.g. EDO steps).
 *   Field : array of notes reduced into [0, repeat), sorted by cents, de-duplicated.
 */

/** Prime -> non-zero integer exponent. Keys are decimal strings of the prime. */
export type Monzo = Record<string, number>;

/** A pitch above the root: exact monzo (or `null` when irrational) plus its cents. */
export interface Note {
  m: Monzo | null;
  c: number;
  /** Generator exponents (box and diamond generators). Survives reduction into the repeat. */
  x?: number[];
  /** Factor indices used (combination product sets), sorted. */
  f?: number[];
  /** Field index this note came from (set by `rotateSubset`). */
  src?: number;
}

/** A note of a subset read from a mode root: always carries `src`. */
export type RelNote = Note & { src: number };

/** 25 switches: primes 2..89 then the shared "97+" slot. */
export type PrimeMask = boolean[];

export interface FieldResult {
  notes: Note[];
  truncated: boolean;
}

/** One lattice axis for the box generator. */
export interface AdditiveAxis {
  g: Note;
  n: number;
  ctr: number;
}

/** One axis for the diamond generator. */
export interface OrthoplexAxis {
  g: Note;
}

export interface SizeGroup {
  size: number;
  count: number;
}

/** A step-size group with its pattern letter (set by `analyzeSubset`). */
export interface LetteredGroup extends SizeGroup {
  letter?: string;
}
