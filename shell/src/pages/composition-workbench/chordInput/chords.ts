/**
 * Chord engine: which chords a PitchSet offers, for a root or for a common tone.
 *
 * One function, `findChords`, does both: root mode asks for chords whose root is a pitch,
 * common-tone mode asks for chords that contain a pitch (at any tone). Both public functions
 * are thin wrappers over it. A chord is included only if all its tones lie in the set.
 *
 * 12-EDO uses the named library (chordTemplates.CHORD_LIBRARY_12); every other EDO uses
 * degree stacking of the set with step-based names. Output stays in exact EDO steps:
 * `pcs` are absolute pitch classes in stacking order, `steps` the offsets from the root
 * (ascending, may exceed the EDO for 9ths) for the voicing engine.
 */
import { pitchClassName } from '../pitch';
import {
  CHORD_LIBRARY_12,
  ROLE_ORDER,
  degreeStackChords,
  type ChordRole,
  type ChordTemplate,
} from './chordTemplates';
import { normalizePc, type PitchSet } from './pitchSet';

export interface Chord {
  /** "Am7" at 12-EDO; "D[0-6-11]" (spelled root, then step stack) elsewhere. See chordName. */
  name: string;
  templateId: string;
  edo: number;
  rootPc: number;
  /** Offsets from the root in EDO steps, ascending. */
  steps: number[];
  roles: ChordRole[];
  /** Absolute pitch classes, one per tone, in stacking order. */
  pcs: number[];
}

export interface ChordColumn {
  role: ChordRole;
  chords: Chord[];
}

/**
 * The one place chord names are made. The root is always spelled with `pitchClassName` (as
 * `pitchSetLabel` does): 12-EDO gives "Am7"; other EDOs give the spelled root plus the step
 * stack in brackets, e.g. "D[0-6-11]" at 19-EDO (bare number, e.g. "2[0-6-11]", where the
 * EDO has no letter spelling). Step-based suffixes are provisional pending a naming decision.
 */
function chordName(template: ChordTemplate, rootPc: number, edo: number): string {
  const root = pitchClassName(rootPc, edo);
  return edo === 12 ? `${root}${template.suffix}` : `${root}[${template.suffix}]`;
}

function buildChord(template: ChordTemplate, rootPc: number, edo: number): Chord {
  return {
    name: chordName(template, rootPc, edo),
    templateId: template.id,
    edo,
    rootPc,
    steps: [...template.steps],
    roles: [...template.roles],
    pcs: template.steps.map((step) => (rootPc + step) % edo),
  };
}

function templatesFor(set: PitchSet, rootPc: number): readonly ChordTemplate[] {
  return set.edo === 12 ? CHORD_LIBRARY_12 : degreeStackChords(set, rootPc);
}

export interface ChordQuery {
  /** Only chords with this root. */
  root?: number;
  /** Only chords containing this pitch class. */
  contains?: number;
}

/**
 * The single engine function. Returns every chord (all roots in the set unless `root` is
 * given) whose tones all lie in the set and which satisfy the query.
 */
export function findChords(set: PitchSet, query: ChordQuery = {}): Chord[] {
  const { edo } = set;
  const inSet = new Set(set.pcs);
  const roots =
    query.root === undefined
      ? set.pcs
      : set.pcs.filter((pc) => pc === normalizePc(query.root as number, edo));
  const contains = query.contains === undefined ? undefined : normalizePc(query.contains, edo);
  const out: Chord[] = [];
  for (const rootPc of roots) {
    for (const template of templatesFor(set, rootPc)) {
      const chord = buildChord(template, rootPc, edo);
      if (
        chord.pcs.every((pc) => inSet.has(pc)) &&
        (contains === undefined || chord.pcs.includes(contains))
      ) {
        out.push(chord);
      }
    }
  }
  return out;
}

/** Chords built on `rootPc` as root, in library order. */
export function chordsOnRoot(set: PitchSet, rootPc: number): Chord[] {
  return findChords(set, { root: rootPc });
}

/**
 * Chords containing `pc`, grouped into columns by the role `pc` plays, columns in
 * ROLE_ORDER, empty columns omitted.
 */
export function chordsWithCommonTone(set: PitchSet, pc: number): ChordColumn[] {
  const target = normalizePc(pc, set.edo);
  const byRole = new Map<ChordRole, Chord[]>();
  for (const chord of findChords(set, { contains: target })) {
    const role = chord.roles[chord.pcs.indexOf(target)];
    byRole.set(role, [...(byRole.get(role) ?? []), chord]);
  }
  return ROLE_ORDER.filter((role) => byRole.has(role)).map((role) => ({
    role,
    chords: byRole.get(role) as Chord[],
  }));
}
