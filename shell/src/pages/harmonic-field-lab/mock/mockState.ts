/**
 * The mock's fixed state: "Harmonics 8-15" without 11/8, with 1/1, 5/4 and 3/2 sounding as the highlighted 4:5:6 chord,
 * and six saved subsets of that collection (the same ones the layout mock showed).
 */
import { fmtRatio } from '../../../lib/harmonic-field';
import { initialState, makeTab, presetGen, type LabState, type Saved } from '../state/labState';

export function mockState(): LabState {
  const base = initialState();
  const tab = makeTab('t1', presetGen());
  const field = tab.field;
  const ratio = (r: string) => field.findIndex((n) => fmtRatio(n) === r);
  const cents = (idx: number[]) => idx.filter((i) => i >= 0).map((i) => field[i].c);
  const pick = (...r: string[]) => cents(r.map(ratio));
  // field index 3 is 11/8
  const sel = field.map((_, i) => i).filter((i) => i !== 3);
  const defs: [string, number[]][] = [
    ['M4 subset (no 11/8)', cents(sel)],
    ['Full field', cents(field.map((_, i) => i))],
    ['Major pentatonic-like', pick('1/1', '9/8', '5/4', '3/2', '13/8')],
    ['Septimal tetrad 4:5:6:7', pick('1/1', '5/4', '3/2', '7/4')],
    ['11 and 13 heavy', pick('1/1', '11/8', '3/2', '13/8', '15/8')],
    ['Otonal 4:5:6', pick('1/1', '5/4', '3/2')],
  ];
  const saved: Saved[] = defs.map(([name, selCents], k) => ({
    id: `s${k + 1}`,
    name,
    gen: tab.gen,
    selCents,
    mode: 0,
  }));
  const chord = new Set([0, 2, 4]);
  return {
    ...base,
    tabs: [{ ...tab, sel }],
    saved,
    nextSaved: saved.length + 1,
    sounding: chord,
    chordPick: chord,
  };
}
