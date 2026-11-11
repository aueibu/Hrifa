/**
 * Typed rhythm notation with rests and ties (see ARCHITECTURE.md, "Rests and ties").
 *
 * - `3` is a three-pulse attack. A length may be a fraction (`6/5`) or a decimal (`1.5`); fractional
 *   lengths are exact (see `rationalFromNumber`).
 * - `r2` is a two-pulse rest ("rest, two"). A rest is stored as a negative duration, as in OpenMusic.
 * - `2~` is a two-pulse attack tied into the next item, so `2~ 1` plays as one three-pulse event.
 *   The marker sits on the item that starts the tie.
 *
 * Items are separated by spaces or commas.
 */

import type { DataItem } from './model';
import { rationalFromNumber } from './musicalTime';
import type { RhythmStep } from './rhythmRealization';

/** A pulse count as text: whole numbers plain, anything else as its exact fraction (`6/5`). */
export function formatPulses(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const { numerator, denominator } = rationalFromNumber(value);
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
}

export interface ParsedRhythmText {
  steps: RhythmStep[];
  errors: string[];
}

const token = /^(r?)(\d+\/\d+|\d*\.\d+|\d+)(~?)$/i;

export function parseRhythmText(text: string): ParsedRhythmText {
  const steps: RhythmStep[] = [];
  const errors: string[] = [];
  text
    .split(/[\s,]+/)
    .filter(Boolean)
    .forEach((raw) => {
      const match = token.exec(raw);
      if (!match) {
        errors.push(
          `${raw}: enter a length in pulses such as 2, 6/5 or 1.5, a rest such as r1, or a tie such as 2~`
        );
        return;
      }
      const [, rest, digits, tie] = match;
      const [top, bottom] = digits.split('/');
      const pulses = bottom === undefined ? Number(top) : Number(top) / Number(bottom);
      if (!Number.isFinite(pulses) || pulses <= 0) {
        errors.push(`${raw}: a length must be greater than zero`);
        return;
      }
      if (rest && tie) {
        errors.push(`${raw}: a rest cannot be tied`);
        return;
      }
      steps.push(
        rest ? { duration: -pulses } : { duration: pulses, ...(tie ? { tie: true } : {}) }
      );
    });
  return { steps, errors };
}

export function formatRhythmStep(step: Pick<RhythmStep, 'duration' | 'tie'>): string {
  return step.duration < 0
    ? `r${formatPulses(-step.duration)}`
    : `${formatPulses(step.duration)}${step.tie ? '~' : ''}`;
}

export function formatRhythmText(steps: Pick<RhythmStep, 'duration' | 'tie'>[]): string {
  return steps.map(formatRhythmStep).join(' ');
}

/** A rhythm item as the notation reads it, for labels and summaries. */
export function rhythmItemNotation(item: Pick<DataItem<unknown>, 'value' | 'tie'>): string {
  return formatRhythmStep({ duration: Number(item.value), tie: item.tie });
}

/** Whether any item in the list is a rest or starts a tie. */
export function hasRestsOrTies(items: Pick<DataItem<unknown>, 'value' | 'tie'>[]): boolean {
  return items.some((item) => Number(item.value) < 0 || item.tie);
}
