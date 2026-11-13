/** Helpers shared by the consonance tests (not part of the library API). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { midiToHz } from './pitch';

/** Frequencies of MIDI note numbers, A4 = 440 Hz. */
export const midiChord = (midis: readonly number[]): number[] => midis.map(midiToHz);

/** Frequencies of 12-EDO semitone offsets above `rootHz`. */
export const edo12 = (rootHz: number, semis: readonly number[]): number[] =>
  semis.map((s) => rootHz * 2 ** (s / 12));

/** Frequencies of just ratios above `rootHz`. */
export const ji = (rootHz: number, ratios: readonly number[]): number[] =>
  ratios.map((r) => rootHz * r);

/** Frequencies of EDO steps above `rootHz`. */
export const steps = (rootHz: number, edo: number, st: readonly number[]): number[] =>
  st.map((s) => rootHz * 2 ** (s / edo));

/** Average ranks (ties share the mean rank). */
function ranks(xs: readonly number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const r = new Array<number>(xs.length).fill(0);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && xs[idx[j + 1]] === xs[idx[i]]) {
      j++;
    }
    const mean = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      r[idx[k]] = mean;
    }
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation (Pearson on average ranks). */
export function spearman(x: readonly number[], y: readonly number[]): number {
  const rx = ranks(x);
  const ry = ranks(y);
  const n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - mx) * (ry[i] - my);
    sxx += (rx[i] - mx) ** 2;
    syy += (ry[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Rows of a CSV file in `data/` (simple comma split, header row as keys; no quoted commas in these files). */
export function readCsv(name: string): Record<string, string>[] {
  const text = readFileSync(join(__dirname, 'data', name), 'utf8')
    .replace(/^﻿/, '')
    .trim();
  const [head, ...rows] = text.split(/\r?\n/);
  const keys = head.split(',');
  return rows.map((r) => {
    const cells = r.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? '']));
  });
}
