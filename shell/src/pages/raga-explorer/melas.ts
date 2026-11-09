/** The standard 12-chakra grouping of the 72 melakarta system (the katapayadi scheme): each chakra holds 6
 * consecutive melas. This is generic Carnatic theory, independent of any of this project's own source lists —
 * not something read off the masterlist. */
export const CHAKRA_NAMES = [
  'Indu',
  'Netra',
  'Agni',
  'Veda',
  'Bana',
  'Ruthu',
  'Rishi',
  'Vasu',
  'Brahma',
  'Disi',
  'Rudra',
  'Aditya',
] as const;

export function chakraOf(mela: number): number {
  return Math.floor((mela - 1) / 6) + 1;
}

export function chakraName(chakra: number): string {
  return CHAKRA_NAMES[chakra - 1] ?? `Chakra ${chakra}`;
}

export function positionInChakra(mela: number): number {
  return ((mela - 1) % 6) + 1;
}
