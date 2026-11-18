import type { ForteSetSelection } from '../../forteCatalog';
import type { PitchInputFormat } from '../../pitch';
import { acceptsString, compositionStateKeys } from '../../usePersistentState';
import type { PitchListState } from '../evaluators/pitchList';
import { defineModuleState } from '../moduleState';

export const pitchListInitialValues: Record<PitchInputFormat, string> = {
  'midi-note': '60, 62, 64, 67, 66.5',
  midicent: '6000, 6200, 6400, 6700, 6650',
  'note-name': 'C4, D4, E4, G4, F#4',
  'pitch-class': '0, 2, 4, 7, 6',
};

export type CatalogOrigins = Record<string, ForteSetSelection>;

export function acceptsCatalogOrigins(value: unknown): value is CatalogOrigins {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (origin) =>
      Boolean(origin) &&
      typeof origin === 'object' &&
      typeof (origin as ForteSetSelection).forteNumber === 'string' &&
      Array.isArray((origin as ForteSetSelection).primeForm) &&
      Array.isArray((origin as ForteSetSelection).intervalClassVector) &&
      typeof (origin as ForteSetSelection).transposition === 'number' &&
      typeof (origin as ForteSetSelection).inverted === 'boolean' &&
      Array.isArray((origin as ForteSetSelection).pitchClasses)
  );
}

/** The Pitch List fields its evaluator reads (the rest of its state is view-only). */
export const pitchListState = defineModuleState<PitchListState>('pitch-list', {
  format: {
    key: compositionStateKeys.pitchFormat,
    fallback: 'midi-note',
    accepts: (value): value is PitchInputFormat =>
      value === 'midi-note' ||
      value === 'midicent' ||
      value === 'note-name' ||
      value === 'pitch-class',
  },
  // The default text depends on the format read just before it.
  inlineValues: {
    key: compositionStateKeys.pitchValues,
    fallback: (earlier) => pitchListInitialValues[earlier.format ?? 'midi-note'],
    accepts: acceptsString,
  },
  catalogOrigins: {
    key: compositionStateKeys.pitchCatalogOrigins,
    fallback: {},
    accepts: acceptsCatalogOrigins,
  },
});
