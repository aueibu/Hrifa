import { packet, type DataItem, type DataPacket, type Provenance } from './model';

export type PitchInputFormat = 'midi-note' | 'midicent' | 'note-name' | 'pitch-class';

// A pitch(-class) item's stored value is a bare number (a single pitch, in midicents; or a
// pitch class, 0-11) or number[] (a bracketed simultaneity) — no wrapper object. This matches
// how every other domain's items already work (a duration, an interval, is just a number) and
// how OM itself represents pitch material: a chord is a plain list of numbers, not an object
// with a `pitches` field. It also keeps the door open for higher-EDO pitch-class domains later —
// the number is already bare, so a `chromatic-19`/`chromatic-24` encoding only needs a
// steps-per-octave fact somewhere, not a second wrapper hierarchy. Display labels are computed
// on demand (pitchClassNames[] / formatMidicents() / pitchLabel() in routeTreatments.ts) rather
// than cached on the value, and a literal typed spelling ("Bb" vs canonical "A#") is recorded
// once as source metadata (see PitchSpellings) rather than as a per-item field every producer
// must carry forward.
export type PitchItemValue = number | number[];
export type PitchClassItemValue = number | number[];

export function pitchGroupToArray(value: PitchItemValue): number[] {
  return Array.isArray(value) ? value : [value];
}

export function pitchClassGroupToArray(value: PitchClassItemValue): number[] {
  return Array.isArray(value) ? value : [value];
}

// General meantone pitch-class spelling, not a 12-EDO special case with a numeric fallback
// everywhere else. Any EDO with a usable best-fifth approximation (12, 19, 31, and others) gets
// real letter names generated from that fifth via the standard line-of-fifths construction
// (F C G D A E B, extended by sharps/flats): for each step, find its nearest natural letter and
// express the distance as an accidental. The size of one accidental (the "apotome") falls out of
// the fifth itself — 1 step at 12- and 19-EDO, 2 steps at 31-EDO — so nothing about which EDOs
// get letters is hardcoded.
//
// When the apotome is even, its half is a genuine, separately-meaningful pitch in that tuning
// (31-EDO's defining feature: sharps and flats are distinct, and there's a real note *between* a
// natural and its neighboring single-sharp/flat) — rendered with an up/down-notation arrow
// rather than stacking a second whole accidental, since every case actually reachable this way
// (12, 19, 31) stays within one accidental of the nearest natural. A step further out than that
// falls back to its plain number rather than guessing an unfamiliar double-accidental spelling.
const naturalLetters = ['F', 'C', 'G', 'D', 'A', 'E', 'B'] as const;
const halfSharpSuffix = '↑'; // ↑ — "ups and downs" notation for a half-accidental raise
const halfFlatSuffix = '↓'; // ↓ — same, for a half-accidental lower

interface MeantoneSpelling {
  edo: number;
  fifth: number;
  apotome: number;
  halfUnit?: number;
  naturals: { letter: (typeof naturalLetters)[number]; position: number }[];
}

const meantoneSpellingCache = new Map<number, MeantoneSpelling | undefined>();

function meantoneSpellingFor(edo: number): MeantoneSpelling | undefined {
  if (meantoneSpellingCache.has(edo)) {
    return meantoneSpellingCache.get(edo);
  }
  const fifth = Math.round(edo * Math.log2(1.5));
  const apotome = 7 * fifth - 4 * edo;
  // A degenerate "fifth" (out of range, or an apotome that isn't a small positive step) means
  // this EDO has no usable meantone-style letter spelling at all.
  const spelling: MeantoneSpelling | undefined =
    fifth > 0 && fifth < edo && apotome > 0 && apotome <= edo / 2
      ? {
          edo,
          fifth,
          apotome,
          halfUnit: apotome % 2 === 0 ? apotome / 2 : undefined,
          naturals: naturalLetters.map((letter, index) => {
            const k = index - 1; // F=-1, C=0, G=1, D=2, A=3, E=4, B=5
            return { letter, position: (((k * fifth) % edo) + edo) % edo };
          }),
        }
      : undefined;
  meantoneSpellingCache.set(edo, spelling);
  return spelling;
}

export function pitchClassName(pitchClass: number, edo = 12): string {
  const step = ((pitchClass % edo) + edo) % edo;
  const spelling = meantoneSpellingFor(edo);
  if (!spelling) {
    return String(step);
  }
  // Shortest signed distance from each natural to `step`, picking the nearest; on an exact tie
  // (the classic 12-EDO black-key case) prefer the sharp side, matching this app's existing
  // "always sharp, never flat" convention for 12-EDO.
  let best: { letter: string; distance: number } | undefined;
  for (const natural of spelling.naturals) {
    let distance = step - natural.position;
    if (distance > edo / 2) distance -= edo;
    if (distance < -edo / 2) distance += edo;
    if (
      !best ||
      Math.abs(distance) < Math.abs(best.distance) ||
      (Math.abs(distance) === Math.abs(best.distance) && distance > best.distance)
    ) {
      best = { letter: natural.letter, distance };
    }
  }
  const { letter, distance } = best!;
  const magnitude = Math.abs(distance);
  if (magnitude === 0) return letter;
  if (magnitude === spelling.apotome) return letter + (distance > 0 ? '#' : 'b');
  if (magnitude === spelling.apotome * 2) return letter + (distance > 0 ? '##' : 'bb');
  if (spelling.halfUnit !== undefined && magnitude === spelling.halfUnit) {
    return letter + (distance > 0 ? halfSharpSuffix : halfFlatSuffix);
  }
  return String(step);
}

// The inverse of pitchClassName, for parsing typed pitch-class input back into a step number —
// accepts exactly the spellings pitchClassName can produce for the given edo, so display and
// input stay symmetric rather than accepting a wider or narrower vocabulary than what's shown.
function parseMeantoneSpelling(token: string, edo: number): number | undefined {
  const match = /^([A-Ga-g])(##|bb|#|♯|b|♭|↑|↓)?$/.exec(token);
  if (!match) return undefined;
  const spelling = meantoneSpellingFor(edo);
  if (!spelling) return undefined;
  const natural = spelling.naturals.find((n) => n.letter === match[1].toUpperCase());
  if (!natural) return undefined;
  const rawAccidental = match[2];
  const accidental =
    rawAccidental === '♯' ? '#' : rawAccidental === '♭' ? 'b' : rawAccidental;
  let offset: number | undefined;
  switch (accidental) {
    case undefined:
      offset = 0;
      break;
    case '#':
      offset = spelling.apotome;
      break;
    case 'b':
      offset = -spelling.apotome;
      break;
    case '##':
      offset = spelling.apotome * 2;
      break;
    case 'bb':
      offset = -spelling.apotome * 2;
      break;
    case halfSharpSuffix:
      offset = spelling.halfUnit;
      break;
    case halfFlatSuffix:
      offset = spelling.halfUnit === undefined ? undefined : -spelling.halfUnit;
      break;
  }
  if (offset === undefined) return undefined;
  return (((natural.position + offset) % edo) + edo) % edo;
}

export function pitchClassGroupLabel(value: PitchClassItemValue, edo = 12): string {
  const values = pitchClassGroupToArray(value);
  const label = values.map((pitchClass) => pitchClassName(pitchClass, edo)).join(' ');
  return values.length > 1 ? `[${label}]` : label;
}

export function pitchClassPreviewMidicents(
  value: PitchClassItemValue,
  previewOctave: number,
  edo = 12
): number[] {
  const centsPerStep = 1200 / edo;
  return pitchClassGroupToArray(value).map(
    (pitchClass) => (previewOctave + 1) * 1200 + pitchClass * centsPerStep
  );
}

// The literal text the user typed for one pitch(-class) item (e.g. "Bb", not the canonical
// "A#"/"Bb3" pitchClassNames/pitchLabel would produce). This lives ONLY as metadata on the
// authoring packet — Pitch List's own inline output — keyed by item id, not as a field every
// downstream producer has to carry forward. Transposing/inverting a pitch has no coherent
// "preserve the original spelling" semantic, so it's correct that this doesn't propagate
// through transformations; a consumer that wants "what did the user literally type" looks at
// the untransformed source packet's metadata.
export type PitchSpellings = Record<string, string>;

export interface InterpretedPitchList {
  packet: DataPacket;
  errors: string[];
  source: 'inline' | 'upstream';
}

export type InlinePitchGroupProvenance = Record<string, Provenance[]>;

const pitchClassByLetter: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
export const pitchClassNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function tokenizePitchGroups(value: string) {
  const groups: string[][] = [];
  const errors: string[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    while (cursor < value.length && /[\s,]/.test(value[cursor])) cursor += 1;
    if (cursor >= value.length) break;
    if (value[cursor] === ']') {
      errors.push(`Unexpected closing bracket at character ${cursor + 1}.`);
      cursor += 1;
      continue;
    }
    if (value[cursor] === '[') {
      const closesAt = value.indexOf(']', cursor + 1);
      if (closesAt < 0) {
        errors.push(`Chord beginning at character ${cursor + 1} is missing a closing bracket.`);
        break;
      }
      const contents = value.slice(cursor + 1, closesAt);
      if (contents.includes('[')) {
        errors.push('Nested chord brackets are not supported.');
      } else {
        const tokens = contents.split(/[\s,]+/).filter(Boolean);
        if (tokens.length) groups.push(tokens);
        else errors.push('Chord brackets must contain at least one pitch.');
      }
      cursor = closesAt + 1;
      continue;
    }
    let endsAt = cursor;
    while (endsAt < value.length && !/[\s,[\]]/.test(value[endsAt])) endsAt += 1;
    groups.push([value.slice(cursor, endsAt)]);
    cursor = endsAt;
  }
  return { groups, errors };
}

function accidentalOffset(accidental = '') {
  if (accidental === '#' || accidental === '♯') return 1;
  if (accidental === 'b' || accidental === '♭') return -1;
  return 0;
}

export function formatMidicents(midicents: number) {
  const midi = midicents / 100;
  const nearest = Math.round(midi);
  const pitchClass = ((nearest % 12) + 12) % 12;
  const octave = Math.floor(nearest / 12) - 1;
  const cents = Math.round((midi - nearest) * 100);
  return `${pitchClassNames[pitchClass]}${octave}${cents === 0 ? '' : ` ${cents > 0 ? '+' : ''}${cents}c`}`;
}

// The result of parsing one token — an internal parse-time struct, not the shape stored in a
// packet item. `value` and (optionally) `spelling` get pulled out of it into the item's bare
// number and the packet's `metadata.spellings` respectively.
interface ParsedToken {
  value: number;
  spelling?: string;
}

function parsePitchClassToken(token: string, edo = 12): ParsedToken | string {
  const numeric = Number(token);
  if (Number.isInteger(numeric)) {
    if (numeric < 0 || numeric > edo - 1) return `${token}: pitch-class integers must be from 0 to ${edo - 1}`;
    return { value: numeric };
  }
  // A letter name only has a standard meaning where this EDO has a usable meantone spelling
  // (pitchClassName's own criterion — see meantoneSpellingFor) — and only for the exact
  // spellings that generates, so a typed name always round-trips to the label that would be
  // shown for it.
  const value = parseMeantoneSpelling(token, edo);
  if (value === undefined) {
    return meantoneSpellingFor(edo)
      ? `${token}: enter a pitch-class integer from 0 to ${edo - 1}, or a note name such as C, F#, or Bb`
      : `${token}: enter a pitch-class integer from 0 to ${edo - 1} (this EDO has no standard note-name spelling)`;
  }
  return { value, spelling: token.length > 1 ? `${token[0].toUpperCase()}${token.slice(1)}` : token.toUpperCase() };
}

function parseConcretePitchToken(
  token: string,
  format: Exclude<PitchInputFormat, 'pitch-class'>
): ParsedToken | string {
  if (format === 'note-name') {
    const match = /^([A-Ga-g])([#b♯♭]?)(-?\d+)$/.exec(token);
    if (!match) return `${token}: enter a note name with octave, such as C4, F#3, or Bb5`;
    const spelling = `${match[1].toUpperCase()}${match[2]}${match[3]}`;
    const midi =
      (Number(match[3]) + 1) * 12 +
      pitchClassByLetter[match[1].toUpperCase()] +
      accidentalOffset(match[2]);
    return { value: midi * 100, spelling };
  }

  const value = Number(token);
  if (!Number.isFinite(value)) return `${token}: enter a finite number`;
  if (format === 'midi-note' && (value < 0 || value > 127)) {
    return `${token}: MIDI-note values must be from 0 to 127`;
  }
  return { value: format === 'midi-note' ? value * 100 : value };
}

function parseToken(token: string, format: PitchInputFormat, edo = 12): ParsedToken | string {
  return format === 'pitch-class'
    ? parsePitchClassToken(token, edo)
    : parseConcretePitchToken(token, format);
}

function labelForToken(value: number, format: PitchInputFormat, edo = 12, spelling?: string): string {
  if (spelling) return spelling;
  return format === 'pitch-class' ? pitchClassName(value, edo) : formatMidicents(value);
}

export function pitchFrequency(midicents: number) {
  return 440 * 2 ** ((midicents - 6900) / 1200);
}

export function interpretPitchList({
  instanceId,
  format,
  inlineText,
  inlineProvenance,
  upstream,
  edo = 12,
}: {
  instanceId: string;
  format: PitchInputFormat;
  inlineText: string;
  inlineProvenance?: InlinePitchGroupProvenance;
  upstream?: DataPacket;
  edo?: number;
}): InterpretedPitchList {
  // Already the target shape — a pitch(-class) item's value is already bare, nothing to
  // rewrap or reinterpret. This is domain-preserving regardless of the currently-selected
  // `format`: connecting a pitchClass upstream while `format` still says "midi-note" (a stale
  // UI selection) still passes the pitchClass packet through as pitchClass, matching how the
  // interface disables the format selector once an upstream connection defines it.
  if (upstream && (upstream.domain === 'pitch' || upstream.domain === 'pitchClass')) {
    return { packet: upstream, errors: [], source: 'upstream' };
  }

  const tokenized = upstream ? undefined : tokenizePitchGroups(inlineText);
  const sourceItems = upstream
    ? upstream.items.map((item) => ({
        tokens: [String(item.value)],
        sourceId: item.id,
        inherited: item.provenance,
      }))
    : (tokenized?.groups ?? []).map((tokens, index) => ({
        tokens,
        sourceId: `${instanceId}:inline:${index}`,
        inherited: inlineProvenance?.[String(index)] ?? ([] as Provenance[]),
      }));
  const errors: string[] = [...(tokenized?.errors ?? [])];
  const items: DataItem<PitchItemValue>[] = [];
  const spellings: PitchSpellings = {};

  sourceItems.forEach(({ tokens, sourceId, inherited }, index) => {
    const parsed = tokens.map((token) => parseToken(token, format, edo));
    const groupErrors = parsed.filter((value): value is string => typeof value === 'string');
    if (groupErrors.length) {
      errors.push(...groupErrors);
      return;
    }
    const parsedTokens = parsed as ParsedToken[];
    const value: PitchItemValue =
      parsedTokens.length > 1 ? parsedTokens.map((p) => p.value) : parsedTokens[0].value;
    const id = `${instanceId}:pitch-group:${index}`;
    // A typed letter-name spelling becomes both the displayed label (matching prior behavior:
    // "Bb" displayed as "Bb", not canonicalized to "A#") and the source-metadata record.
    const label = parsedTokens.map((p) => labelForToken(p.value, format, edo, p.spelling)).join(' ');
    if (parsedTokens.some((p) => p.spelling)) {
      spellings[id] = label;
    }
    items.push({
      id,
      value,
      label: parsedTokens.length > 1 ? `[${label}]` : label,
      provenance: [
        ...inherited,
        {
          sourceModuleInstance: instanceId,
          sourceItemIds: upstream ? [sourceId] : [],
          transformation: `read-as-${format}`,
          parameters: {
            sourceValues: parsedTokens.map((p) => p.value),
            grouped: parsedTokens.length > 1,
          },
        },
      ],
    });
  });

  if (!sourceItems.length) errors.push('Enter at least one pitch value.');
  const domain = format === 'pitch-class' ? 'pitchClass' : 'pitch';
  return {
    packet: packet(
      'list',
      domain,
      items,
      errors,
      {
        source: upstream ? 'upstream' : 'inline',
        ...(Object.keys(spellings).length ? { spellings } : {}),
      },
      { role: 'pitchMaterial', encoding: format === 'pitch-class' ? `chromatic-${edo}` : format }
    ),
    errors,
    source: upstream ? 'upstream' : 'inline',
  };
}
