export const defaultWordsA = [
  'wind',
  'dusk',
  'moss',
  'root',
  'ash',
  'glow',
  'tide',
  'fog',
  'stone',
  'thorn',
  'gloam',
  'fern',
  'reed',
  'slate',
  'dust',
  'rill',
];
export const defaultWordsB = [
  'ward',
  'seal',
  'mark',
  'plot',
  'well',
  'pool',
  'wake',
  'march',
  'croft',
  'holt',
  'span',
  'fold',
  'gap',
  'form',
];

export const cycleDurationMilliseconds = 3 * 60 * 60 * 1000;
export const savedListsKey = 'time-derived-username-lists';

export interface DerivationResult {
  username: string;
  minutesSinceMidnight: number;
  flatIndex: number;
  aIndex: number;
  bIndex: number;
  wordA: string;
  wordB: string;
}

export function getMillisecondsSinceMidnight(date: Date): number {
  return (
    ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 +
    date.getMilliseconds()
  );
}

export function greatestCommonDivisor(first: number, second: number): number {
  let dividend = first;
  let divisor = second;
  while (divisor !== 0) {
    [dividend, divisor] = [divisor, dividend % divisor];
  }
  return dividend;
}

export function getInterleaveStride(listLength: number): number {
  for (let stride = Math.floor(listLength / 2); stride > 0; stride -= 1) {
    if (greatestCommonDivisor(stride, listLength) === 1) {
      return stride;
    }
  }
  return 1;
}

export function deriveUsernameFromMilliseconds(
  millisecondsSinceMidnight: number,
  wordsA: string[],
  wordsB: string[]
): DerivationResult {
  const totalCombinations = wordsA.length * wordsB.length;
  const millisecondsInCycle = millisecondsSinceMidnight % cycleDurationMilliseconds;
  const flatIndex = Math.floor(
    (millisecondsInCycle / cycleDurationMilliseconds) * totalCombinations
  );
  const aIndex = flatIndex % wordsA.length;
  const bCycle = Math.floor(flatIndex / wordsA.length);
  const bIndex = (bCycle + aIndex * getInterleaveStride(wordsB.length)) % wordsB.length;
  return {
    username: `${wordsA[aIndex]}${wordsB[bIndex]}`,
    minutesSinceMidnight: Math.floor(millisecondsSinceMidnight / 60000),
    flatIndex,
    aIndex,
    bIndex,
    wordA: wordsA[aIndex],
    wordB: wordsB[bIndex],
  };
}

export function deriveUsernameFromDate(
  date: Date,
  wordsA: string[],
  wordsB: string[]
): DerivationResult {
  return deriveUsernameFromMilliseconds(getMillisecondsSinceMidnight(date), wordsA, wordsB);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function parseWordList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

export interface SavedLists {
  wordsA: string[];
  wordsB: string[];
}

export function loadSavedLists(): SavedLists | null {
  try {
    const raw = localStorage.getItem(savedListsKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed?.wordsA) &&
      parsed.wordsA.length &&
      Array.isArray(parsed?.wordsB) &&
      parsed.wordsB.length
    ) {
      return { wordsA: parsed.wordsA, wordsB: parsed.wordsB };
    }
  } catch {
    // Invalid or unavailable local storage simply leaves the built-in lists active.
  }
  return null;
}
