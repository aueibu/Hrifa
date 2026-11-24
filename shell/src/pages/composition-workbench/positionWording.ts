/**
 * The workbench's wording for a position in time: "bar X beat Y" in the data-block's meter (the note editor's own phrase, shared
 * so the Chords panel's ready line says the same). Pure.
 */
import { parseMeter } from './transport';

/** `onsetQuarters` is a position in quarter notes from the data-block start; the meter is the data-block's ("3/4", "6/8"). */
export function barBeatText(onsetQuarters: number, meter: string): string {
  const { numerator, denominator } = parseMeter(meter);
  const barLength = (numerator * 4) / denominator;
  const beatLength = 4 / denominator;
  const bar = Math.floor(onsetQuarters / barLength + 1e-9);
  const beat = (onsetQuarters - bar * barLength) / beatLength + 1;
  return `bar ${bar + 1} beat ${Number(beat.toFixed(2))}`;
}
