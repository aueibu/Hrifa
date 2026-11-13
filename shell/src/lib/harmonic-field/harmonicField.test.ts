/* eslint-disable @typescript-eslint/no-explicit-any */
// Port of the frozen prototype's tests/run_tests.js: every case in vectors.json runs through an op handler, and every
// preset must generate a field. Each vector and each preset is its own test, so a failure names the case.
// Tolerances are the same as the JS runner (1e-3 for cents unless a handler says otherwise).
import { describe, expect, it } from 'vitest';
import vectors from './vectors.json';
import * as H from './index';
import { PRESETS, type Note, type Preset, type PrimeMask } from './index';

type Case = { name: string; op: string; [key: string]: any };
const cases = vectors.cases as Case[];
const KATA = vectors.katapayadiTable as Record<string, number>;
const TOL = 1e-3;

const P = (s: string): Note => {
  const n = H.parseInterval(s);
  if (!n) {
    throw new Error(`bad interval in vector: ${s}`);
  }
  return n;
};
function maskOf(primes?: number[]): PrimeMask {
  if (!primes) {
    return Array<boolean>(25).fill(true);
  }
  const m = Array<boolean>(25).fill(false);
  for (const p of primes) {
    m[H.slotOf(p)] = true;
  }
  return m;
}
function rawNotes(g: any, rep: Note): Note[] {
  switch (g.type) {
    case 'harmonic':
      return H.genHarmonic(g.H, rep, false);
    case 'subharmonic':
      return H.genHarmonic(g.H, rep, true);
    case 'edo':
      return H.genEdo(g.N, rep);
    case 'additive':
      return H.genAdditive(g.axes.map((a: any) => ({ g: P(a.g), n: a.n, ctr: a.ctr })));
    case 'diamond':
      return H.genOrthoplex(
        g.axes.map((a: string) => ({ g: P(a) })),
        g.D,
        g.bidir
      );
    case 'cps':
      return H.genCps(g.factors.map(P), g.k);
    case 'custom':
      return H.parseCustom(g.text, rep);
    default:
      throw new Error(`unknown generator ${g.type}`);
  }
}
function fieldOf(c: { gen: any; rep: string; primes?: number[] }) {
  const rep = P(c.rep);
  return { rep, field: H.buildField(rawNotes(c.gen, rep), rep, maskOf(c.primes)).notes };
}
function cardOf(c: { notes: string[]; rep?: string; base?: string }): H.RetunerCard {
  return {
    name: 'card',
    notes: c.notes.map(P),
    rep: P(c.rep ?? '2/1'),
    base: P(c.base ?? '1/1'),
  };
}
const eqList = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number) => Math.abs(a - b) < TOL;
const selIdx = (c: Case, field: Note[]): number[] =>
  c.select === 'all' ? field.map((_, i) => i) : c.select;

/** Returns null when the case passes, otherwise a message. */
function check(c: Case): string | null {
  const e = c.expect;
  switch (c.op) {
    case 'parse': {
      const n = H.parseInterval(c.input);
      if (e === null) {
        return n === null ? null : `expected null, got ${JSON.stringify(n)}`;
      }
      if (!n) {
        return 'got null';
      }
      if (e.ratio && H.fmtRatio(n) !== e.ratio) {
        return `ratio ${H.fmtRatio(n)}`;
      }
      if (e.cents != null && !near(n.c, e.cents)) {
        return `cents ${n.c}`;
      }
      if (e.irrational && n.m !== null) {
        return 'expected irrational';
      }
      return null;
    }
    case 'field': {
      const { field } = fieldOf(c as any);
      if (e.ratios && !eqList(field.map(H.fmtRatio), e.ratios)) {
        return `got ${field.map(H.fmtRatio).join(' ')}`;
      }
      if (
        e.cents &&
        !(field.length === e.cents.length && field.every((n, i) => near(n.c, e.cents[i])))
      ) {
        return `got ${field.map((n) => n.c.toFixed(3)).join(' ')}`;
      }
      if (e.count != null && field.length !== e.count) {
        return `count ${field.length}`;
      }
      for (const k in e.cents_at || {}) {
        if (!near(field[Number(k)].c, e.cents_at[k])) {
          return `cents[${k}] ${field[Number(k)].c}`;
        }
      }
      return null;
    }
    case 'mos': {
      const s = H.mosSizes(P(c.generator).c, P(c.rep).c, c.maxN).map((x) => x.n);
      return eqList(s, e.sizes) ? null : `got ${s.join(' ')}`;
    }
    case 'analyze': {
      const { field, rep } = fieldOf(c as any);
      const a = H.analyzeSubset(H.rotateSubset(field, selIdx(c, field), c.mode, rep), rep);
      if (!a) {
        return 'no analysis';
      }
      const S = a.structure;
      const st =
        S.kind === 'equal' ? 'equal' : S.kind === 'mos' ? `${S.L}L ${S.s}s` : `${S.sizes} sizes`;
      if (e.pattern && a.pattern !== e.pattern) {
        return `pattern ${a.pattern}`;
      }
      if (e.structure && st !== e.structure) {
        return `structure ${st}`;
      }
      if (e.primeLimit != null && a.primeLimit !== e.primeLimit) {
        return `prime limit ${a.primeLimit}`;
      }
      if (e.meanTenney != null && !near(a.meanTenney as number, e.meanTenney)) {
        return `mean Tenney ${a.meanTenney}`;
      }
      return null;
    }
    case 'shape': {
      const { field, rep } = fieldOf(c as any);
      const rel = H.rotateSubset(field, selIdx(c, field), c.mode, rep);
      const sp = H.intervalSpectrum(rel, rep.c);
      const pr = H.propriety(sp);
      const cs = H.constantStructure(rel, rep.c, 0.01, e.csFromSpectrum ? sp : undefined);
      if (e.csFromSpectrum) {
        const cs2 = H.constantStructure(rel, rep.c);
        if (cs2.cs !== cs.cs || JSON.stringify(cs2.example) !== JSON.stringify(cs.example)) {
          return 'precomputed-spectrum constantStructure differs';
        }
      }
      if (
        e.variety &&
        !eqList(
          sp.map((r) => r.variety),
          e.variety
        )
      ) {
        return `variety ${sp.map((r) => r.variety)}`;
      }
      if (e.propriety && pr.verdict !== e.propriety) {
        return `propriety ${pr.verdict}`;
      }
      if (e.clashCount != null && pr.pairs.length !== e.clashCount) {
        return `clashes ${pr.pairs.length}`;
      }
      for (const w of e.clashes || []) {
        if (
          !pr.pairs.some(
            (p) => p.k === w.k && Math.abs(p.a - w.a) < 0.01 && Math.abs(p.b - w.b) < 0.01
          )
        ) {
          return `missing clash ${JSON.stringify(w)}`;
        }
      }
      if (e.cs != null && cs.cs !== e.cs) {
        return `cs ${cs.cs}`;
      }
      if (e.csExample) {
        const x = cs.example;
        if (!x || Math.abs(x.size - e.csExample.size) > 0.01 || !eqList(x.ks, e.csExample.ks)) {
          return `cs example ${JSON.stringify(x)}`;
        }
      }
      for (const k in e.spectrum || {}) {
        const r = sp.find((row) => row.k === +k);
        const w = e.spectrum[k];
        if (
          !r ||
          r.sizes.length !== w.length ||
          !r.sizes.every((s, i) => Math.abs(s.size - w[i][0]) < 0.01 && s.count === w[i][1])
        ) {
          return `spectrum k=${k} ${JSON.stringify(r && r.sizes)}`;
        }
      }
      return null;
    }
    case 'template': {
      const t = H.parseTemplate(c.input);
      if (e.error) {
        return t.ok ? 'expected an error' : null;
      }
      if (!t.ok) {
        return `error: ${t.error}`;
      }
      if (e.utonal != null && t.utonal !== e.utonal) {
        return `utonal ${t.utonal}`;
      }
      if (e.otonal && t.otonal !== e.otonal) {
        return `otonal ${t.otonal}`;
      }
      if (
        e.cents &&
        !(
          t.cents.length === e.cents.length &&
          t.cents.every((x, i) => Math.abs(x - e.cents[i]) < 0.01)
        )
      ) {
        return `cents ${t.cents}`;
      }
      return null;
    }
    case 'tkey': {
      const k = (c.inputs as string[]).map((s) =>
        H.templateKey(H.parseTemplate(s) as Parameters<typeof H.templateKey>[0], P(c.rep).c)
      );
      const dup = k.map((x, i) => k.indexOf(x) !== i);
      return eqList(dup, e.duplicate) ? null : `duplicate flags ${dup}`;
    }
    case 'folds': {
      const f = H.templateFolds(
        H.parseTemplate(c.input) as Parameters<typeof H.templateFolds>[0],
        P(c.rep).c
      );
      return f === e.folds ? null : `folds ${f}`;
    }
    case 'chords': {
      const { field, rep } = fieldOf(c as any);
      const rel = H.rotateSubset(field, selIdx(c, field), c.mode || 0, rep);
      const r = H.findChords(rel, rep.c, c.templates, c.tol);
      if (e.count != null && r.length !== e.count) {
        return `count ${r.length}`;
      }
      if (e.roots) {
        const got = r.map((x) => H.fmtRatio(field[x.root])).sort();
        if (!eqList(got, [...e.roots].sort())) {
          return `roots ${got}`;
        }
      }
      if (e.exact != null && !r.every((x) => x.exact === e.exact)) {
        return `exact flags ${r.map((x) => x.exact)}`;
      }
      if (
        e.maxErr != null &&
        !(r.length && Math.abs(Math.max(...r.map((x) => x.maxErr)) - e.maxErr) < 0.01)
      ) {
        return `maxErr ${r.map((x) => x.maxErr.toFixed(3))}`;
      }
      if (e.members) {
        const x = r.find((y) => H.fmtRatio(field[y.root]) === e.members.root);
        if (!x) {
          return `no chord on ${e.members.root}`;
        }
        if (
          !eqList(
            x.members.map((i) => H.fmtRatio(field[i])),
            e.members.notes
          )
        ) {
          return `members ${x.members.map((i) => H.fmtRatio(field[i]))}`;
        }
        if (
          e.members.errors &&
          !(
            x.errors.length === e.members.errors.length &&
            x.errors.every((v, i) => Math.abs(v - e.members.errors[i]) < 0.01)
          )
        ) {
          return `errors ${x.errors.map((v) => v.toFixed(3))}`;
        }
      }
      if (e.templates && !eqList([...new Set(r.map((x) => x.template))], e.templates)) {
        return `templates ${[...new Set(r.map((x) => x.template))]}`;
      }
      return null;
    }
    case 'closest': {
      const { field, rep } = fieldOf(c as any);
      const lab = (x: number) => {
        const f = H.fmtRatio(field[x]);
        return f && f !== '—' ? f : `${Math.round(field[x].c)}c`;
      };
      const rel = H.rotateSubset(field, selIdx(c, field), c.mode || 0, rep);
      const r = H.closestChord(rel, rep.c, c.template);
      if (e.none) {
        if (r.chord !== null) {
          return `expected no chord, got ${r.chord.template}`;
        }
        return r.reason && r.reason.includes(e.reason) ? null : `reason ${r.reason}`;
      }
      if (!r.chord) {
        return `no chord: ${r.reason}`;
      }
      if (Math.abs(r.tol - e.tol) > 0.01) {
        return `tol ${r.tol.toFixed(3)}`;
      }
      if (e.root && lab(r.chord.root) !== e.root) {
        return `root ${lab(r.chord.root)}`;
      }
      if (e.notes && !eqList(r.chord.members.map(lab), e.notes)) {
        return `notes ${r.chord.members.map(lab)}`;
      }
      if (
        e.errors &&
        !(
          r.chord.errors.length === e.errors.length &&
          r.chord.errors.every((v, i) => Math.abs(v - e.errors[i]) < 0.01)
        )
      ) {
        return `errors ${r.chord.errors.map((v) => v.toFixed(3))}`;
      }
      return null;
    }
    case 'ladder': {
      const { field, rep } = fieldOf(c as any);
      const r = H.chordLadder(
        H.rotateSubset(field, selIdx(c, field), c.mode || 0, rep),
        rep.c,
        c.template
      );
      if (e.none) {
        return r.rungs.length === 0 && r.reason && r.reason.includes(e.reason)
          ? null
          : `expected empty with reason, got ${JSON.stringify(r)}`;
      }
      const got = r.rungs.map((x) => [x.tol, x.count]);
      return got.length === e.rungs.length &&
        got.every((x, i) => Math.abs(x[0] - e.rungs[i][0]) < 0.01 && x[1] === e.rungs[i][1])
        ? null
        : `rungs ${JSON.stringify(got.map((x) => [+x[0].toFixed(3), x[1]]))}`;
    }
    case 'nearestEd': {
      const { field, rep } = fieldOf(c as any);
      const s = [...H.nearestEdSubset(field, rep.c, c.m)].sort((a, b) => a - b);
      return eqList(s, e.indices) ? null : `got ${s.join(' ')}`;
    }
    case 'oddLimit': {
      const { field } = fieldOf(c as any);
      const s = [...H.oddLimitSubset(field, c.L)].sort((a, b) => a - b);
      return eqList(s, e.indices) ? null : `got ${s.join(' ')}`;
    }
    case 'lattice': {
      const { field, rep } = fieldOf(c as any);
      const L = H.latticeCoords(field, rep, c.mode);
      if (e.unavailable) {
        return L === null ? null : 'expected unavailable';
      }
      if (!L) {
        return 'unavailable';
      }
      if (e.axes && !eqList(L.axes, e.axes)) {
        return `axes ${JSON.stringify(L.axes)}`;
      }
      if (e.count != null && L.pts.length !== e.count) {
        return `count ${L.pts.length}`;
      }
      if (e.skipped != null && L.skipped !== e.skipped) {
        return `skipped ${L.skipped}`;
      }
      if (e.dropped != null && L.dropped !== e.dropped) {
        return `dropped ${L.dropped}`;
      }
      if (e.edges != null) {
        const n = H.latticeEdges(L.pts, c.mode === 'cps' ? 'swap' : 'step').length;
        if (n !== e.edges) {
          return `edges ${n}`;
        }
      }
      for (const r in e.coords || {}) {
        const p = L.pts.find((q) => H.fmtRatio(field[q.i]) === r);
        if (!p || !eqList(p.x, e.coords[r])) {
          return `coords of ${r} ${JSON.stringify(p && p.x)}`;
        }
      }
      return null;
    }
    case 'cpsChords': {
      const { field } = fieldOf(c as any);
      const ch = H.cpsChords(field);
      const lab = c.gen.factors as string[];
      const nH = ch.filter((g) => g.type === 'harmonic').length;
      const nS = ch.length - nH;
      if (e.harmonic != null && nH !== e.harmonic) {
        return `harmonic ${nH}`;
      }
      if (e.subharmonic != null && nS !== e.subharmonic) {
        return `subharmonic ${nS}`;
      }
      const sizes = [...new Set(ch.map((g) => g.members.length))].sort((a, b) => a - b);
      if (e.sizes && !eqList(sizes, e.sizes)) {
        return `sizes ${sizes}`;
      }
      if (e.contains) {
        const w = e.contains;
        if (
          !ch.some(
            (g) =>
              g.type === w.type &&
              eqList(
                g.common.map((x) => lab[x]),
                w.common
              ) &&
              eqList(
                g.members.map((m) => lab[m.x]),
                w.factors
              )
          )
        ) {
          return `missing chord ${JSON.stringify(w)}`;
        }
      }
      return null;
    }
    case 'scl': {
      const { field, rep } = fieldOf(c as any);
      const t = H.toScl(
        H.rotateSubset(
          field,
          field.map((_, i) => i),
          0,
          rep
        ),
        rep,
        c.scaleName
      );
      return t === e.text ? null : `got ${JSON.stringify(t)}`;
    }
    case 'melakarta': {
      const m = H.melakarta(c.n);
      if (!m) {
        return 'null';
      }
      if (m.name !== e.name) {
        return `name ${m.name}`;
      }
      if (!eqList(m.edo12, e.edo12)) {
        return `notes ${m.edo12}`;
      }
      return e.ji && !eqList(m.ji, e.ji) ? `ji ${m.ji}` : null;
    }
    case 'melakartaAll': {
      const names = new Set<string>();
      const RG = [
        [1, 2],
        [1, 3],
        [1, 4],
        [2, 3],
        [2, 4],
        [3, 4],
      ];
      const DN = [
        [8, 9],
        [8, 10],
        [8, 11],
        [9, 10],
        [9, 11],
        [10, 11],
      ];
      for (let n = 1; n <= 72; n++) {
        const m = H.melakarta(n);
        if (!m) {
          return `${n}: null`;
        }
        names.add(m.name);
        const s = m.edo12;
        if (s.length !== 7 || s[0] !== 0 || s.some((x, i) => i && x <= s[i - 1])) {
          return `${n}: not 7 ascending notes from S ${s}`;
        }
        if (s[3] !== (n <= 36 ? 5 : 6)) {
          return `${n}: wrong Ma`;
        }
        if (s[4] !== 7) {
          return `${n}: P not 7`;
        }
        const k = (n - 1) % 36;
        const rg = RG[Math.floor(k / 6)];
        const dn = DN[k % 6];
        if (s[1] !== rg[0] || s[2] !== rg[1] || s[5] !== dn[0] || s[6] !== dn[1]) {
          return `${n}: R/G/D/N pairs wrong ${s}`;
        }
        if (m.ji.length !== 7 || m.ji[0] !== '1/1') {
          return `${n}: ji`;
        }
        const cc = H.scaleTargets(m, 'ji');
        if (cc.some((x, i) => i && x <= cc[i - 1])) {
          return `${n}: JI not ascending`;
        }
      }
      return names.size === 72 ? null : `names ${names.size}`;
    }
    case 'melakartaSwaras': {
      for (const n in c.list) {
        const m = H.melakarta(+n);
        if (!m || !eqList(m.swaras, c.list[n])) {
          return `${n} got ${m && m.swaras}`;
        }
      }
      return null;
    }
    case 'melakartaBad': {
      for (const n of c.list) {
        if (H.melakarta(n) !== null) {
          return `${n} accepted`;
        }
      }
      return null;
    }
    case 'katapayadi': {
      // first two syllables' consonants -> digits, written in reverse order (consonant table of the Katapayadi rule)
      const d = (c.syll as string[]).map((s) => {
        const k = `${s.replace(/[aeiou]+$/, '')}a`;
        return KATA[k];
      });
      if (d.some((x) => x === undefined)) {
        return `unknown syllable in ${c.syll}`;
      }
      const num = d[1] * 10 + d[0];
      if (num !== e.number) {
        return `rule gives ${num}`;
      }
      const m = H.melakarta(c.n);
      return m && m.name === c.name_ ? null : `melakarta(${c.n}) is ${m && m.name}`;
    }
    case 'melaWestern': {
      for (const [n, nm, notes] of c.pairs as [number, string, number[] | undefined][]) {
        const sc = notes ? { edo12: notes } : H.SCALE_LIBRARY.find((s) => s.name === nm);
        if (!sc) {
          return `no scale ${nm}`;
        }
        const mk = H.melakarta(n);
        if (!mk || !eqList(sc.edo12, mk.edo12)) {
          return `${n} vs ${nm}`;
        }
      }
      return null;
    }
    case 'scaleLibrary': {
      const L = H.SCALE_LIBRARY;
      if (L.length !== e.count) {
        return `count ${L.length}`;
      }
      for (const s of L) {
        if (
          s.ji.length !== s.edo12.length ||
          s.ji[0] !== '1/1' ||
          s.edo12[0] !== 0 ||
          !s.desc ||
          s.family !== 'Western'
        ) {
          return `${s.name}: shape`;
        }
        const a = H.scaleTargets(s, 'edo12');
        const b = H.scaleTargets(s, 'ji');
        if (b.some((x, i) => i && x <= b[i - 1]) || a.some((x, i) => i && x <= a[i - 1])) {
          return `${s.name}: not ascending`;
        }
        if (a.some((x, i) => Math.abs(x - b[i]) > 25)) {
          return `${s.name}: JI too far from 12-EDO`;
        }
      }
      return new Set(L.map((s) => s.name)).size === L.length ? null : 'duplicate names';
    }
    case 'scaleJi': {
      const s = H.SCALE_LIBRARY.find((x) => x.name === c.scale);
      return s && eqList(s.ji, e.ji) ? null : `got ${s && s.ji}`;
    }
    case 'pickScale': {
      const { field, rep } = fieldOf(c as any);
      const sc = c.mela ? H.melakarta(c.mela) : H.SCALE_LIBRARY.find((s) => s.name === c.scale);
      if (!sc) {
        return 'no scale';
      }
      const r = H.nearestScaleSubset(
        field,
        H.scaleTargets(sc, c.kind, c.stretch ? rep.c : undefined),
        rep.c,
        c.root || 0
      );
      if (r.ok !== e.ok) {
        return `ok ${r.ok} ${r.ok ? '' : r.reason}`;
      }
      if (!r.ok) {
        return e.reasonHas && !r.reason.includes(e.reasonHas) ? `reason ${r.reason}` : null;
      }
      if (
        e.idx &&
        !eqList(
          [...r.idx].sort((a, b) => a - b),
          e.idx.slice().sort((a: number, b: number) => a - b)
        )
      ) {
        return `idx ${r.idx}`;
      }
      if (new Set(r.idx).size !== r.idx.length) {
        return 'not distinct';
      }
      if (e.maxErr != null && Math.abs(r.maxErr - e.maxErr) > 0.01) {
        return `maxErr ${r.maxErr}`;
      }
      if (e.meanAbsErr != null && Math.abs(r.meanAbsErr - e.meanAbsErr) > 0.01) {
        return `mean ${r.meanAbsErr}`;
      }
      for (const k in e.errAt || {}) {
        if (Math.abs(r.errors[Number(k)] - e.errAt[k]) > 0.01) {
          return `error[${k}] ${r.errors[Number(k)]}`;
        }
      }
      return null;
    }
    case 'nearestRatio': {
      const r = H.nearestRatio(c.cents, c.limit, P(c.rep).c);
      if (r.ratio !== e.ratio) {
        return `ratio ${r.ratio}`;
      }
      if (Math.abs(r.err - e.err) > 0.01) {
        return `err ${r.err}`;
      }
      return null;
    }
    case 'vsJI': {
      const t = H.vsJI(c.cents, c.limit, P(c.rep).c);
      return t === e.text ? null : `got ${t}`;
    }
    case 'fmtSigned': {
      const t = H.fmtSigned(c.x, c.dp);
      return t === e.text ? null : `got ${t}`;
    }
    case 'deviations': {
      const rel = (c.notes as number[]).map((x, i) => ({ c: x, src: i + 100 }));
      const rc = P(c.rep).c;
      const d = c.ji ? H.deviationsJI(rel, c.ji, rc) : H.deviations(rel, c.ref, rc);
      if (d.length !== e.dev.length) {
        return `length ${d.length}`;
      }
      for (let i = 0; i < d.length; i++) {
        if (Math.abs(d[i].dev - e.dev[i]) > 0.01) {
          return `dev[${i}] ${d[i].dev}`;
        }
        if (d[i].label !== e.label[i]) {
          return `label[${i}] ${d[i].label}`;
        }
        if (d[i].src !== i + 100 || d[i].k !== i) {
          return 'k/src';
        }
      }
      return null;
    }
    case 'edoTargets': {
      const t = H.edoTargets(c.m, P(c.rep).c);
      if (t.length !== e.count) {
        return `count ${t.length}`;
      }
      for (const k in e.at || {}) {
        if (Math.abs(t[Number(k)].c - e.at[k][0]) > 0.001 || t[Number(k)].label !== e.at[k][1]) {
          return `at ${k} ${JSON.stringify(t[Number(k)])}`;
        }
      }
      return null;
    }
    case 'scaleLabels': {
      const sc = c.mela ? H.melakarta(c.mela) : H.SCALE_LIBRARY.find((s) => s.name === c.scale);
      if (!sc) {
        return 'no scale';
      }
      const t = H.scaleTargetsLabeled(sc, c.kind, c.stretch ? P(c.rep).c : undefined);
      if (
        !eqList(
          t.map((x) => x.label),
          e.labels
        )
      ) {
        return `labels ${t.map((x) => x.label)}`;
      }
      const plain = H.scaleTargets(sc, c.kind, c.stretch ? P(c.rep).c : undefined);
      if (
        !eqList(
          t.map((x) => x.c),
          plain
        )
      ) {
        return 'cents differ from scaleTargets';
      }
      return null;
    }
    case 'semitones': {
      const t = H.semitoneTargets(P(c.rep).c);
      if (t.length !== e.count) {
        return `count ${t.length}`;
      }
      if (t.some((x, i) => x.c !== i * 100)) {
        return 'cents';
      }
      return eqList(
        t.slice(0, e.first.length).map((x) => x.label),
        e.first
      ) &&
        (!e.last || t[t.length - 1].label === e.last)
        ? null
        : `labels ${t.map((x) => x.label)}`;
    }
    case 'transpose': {
      const { field, rep } = fieldOf(c as any);
      const idx: number[] =
        c.select === 'all'
          ? field.map((_, i) => i)
          : c.selectRatios
            ? (c.selectRatios as string[]).map((r) => field.findIndex((n) => H.fmtRatio(n) === r))
            : c.select;
      if (idx.some((i) => i < 0)) {
        return 'a selectRatios entry is not in the field';
      }
      const r = H.transpositions(
        field,
        [...idx].sort((a, b) => a - b),
        c.mode || 0,
        rep,
        c.tol
      );
      if (r.length !== field.length) {
        return `length ${r.length}`;
      }
      const done = r.filter((x) => x.complete);
      if (e.complete != null && done.length !== e.complete) {
        return `complete ${done.length} (${done
          .map((x) => `${H.fmtRatio(field[x.root])}#${x.root}`)
          .join(' ')})`;
      }
      if (
        e.completeRoots &&
        !eqList(
          done.map((x) => H.fmtRatio(field[x.root])),
          e.completeRoots
        )
      ) {
        return `complete roots ${done.map((x) => H.fmtRatio(field[x.root]))}`;
      }
      if (
        e.completeIdx &&
        !eqList(
          done.map((x) => x.root),
          e.completeIdx
        )
      ) {
        return `complete idx ${done.map((x) => x.root)}`;
      }
      for (const k in e.missing || {}) {
        const x = r.find((y) => H.fmtRatio(field[y.root]) === k);
        if (!x || x.missing !== e.missing[k]) {
          return `missing of ${k} = ${x && x.missing}`;
        }
      }
      for (const k in e.notes || {}) {
        const x = r.find((y) => H.fmtRatio(field[y.root]) === k);
        const got = x && x.idx.map((i) => (i == null ? null : H.fmtRatio(field[i])));
        if (!x || !eqList(got, e.notes[k])) {
          return `notes of ${k} ${JSON.stringify(got)}`;
        }
      }
      for (const x of r) {
        if (
          x.idx.length !== idx.length ||
          x.idx[0] !== x.root ||
          x.missing !== x.idx.filter((i) => i == null).length ||
          x.complete !== (x.missing === 0)
        ) {
          return `inconsistent entry ${JSON.stringify(x)}`;
        }
      }
      return null;
    }
    case 'pivot': {
      const held = c.held.map(([key, deg, oct, t]: number[]) => ({ key, deg, oct, t }));
      const got = H.pickPivot(held, c.mode);
      const want = e === null ? null : e;
      return (got ? got.key : null) === want ? null : `pivot ${got ? got.key : null}`;
    }
    case 'degreeOf': {
      const card = cardOf(c.card);
      const got = H.degreeOf(card, c.cents, c.tol);
      return eqList(got, e) ? null : `got ${JSON.stringify(got)}`;
    }
    case 'nearestDegree': {
      const card = cardOf(c.card);
      const got = H.nearestDegree(card, c.hz, { metric: c.metric, refHz: c.refHz });
      return eqList(got, e) ? null : `got ${JSON.stringify(got)}`;
    }
    case 'reroot': {
      const cards = c.cards.map(cardOf);
      const got = H.rerootCards(cards, c.ref, c.deg).map((b) => (b ? H.fmtRatio(b as Note) : null));
      return eqList(got, e.bases) ? null : `got ${JSON.stringify(got)}`;
    }
    default:
      return `unknown op ${c.op}`;
  }
}

// Every preset must generate a non-empty field (same path the page will use).
function presetCase(p: Preset) {
  let gen: any;
  if (p.gen === 'harmonic' || p.gen === 'subharmonic') {
    gen = { type: p.gen, H: p.h };
  } else if (p.gen === 'edo') {
    gen = { type: 'edo', N: p.n };
  } else if (p.gen === 'additive') {
    const axes = p.axes as NonNullable<Preset['axes']>;
    gen =
      p.shape === 'diamond'
        ? { type: 'diamond', axes: axes.map((a) => a.g), D: p.dist, bidir: p.bidir !== false }
        : { type: 'additive', axes };
  } else if (p.gen === 'cps') {
    gen = { type: 'cps', factors: (p.factors as string).split(/\s+/), k: p.k };
  } else {
    gen = { type: 'custom', text: p.text };
  }
  return { gen, rep: p.rep, primes: p.primes };
}
const choose = (n: number, k: number) => {
  let r = 1;
  for (let i = 0; i < k; i++) {
    r = (r * (n - i)) / (i + 1);
  }
  return r;
};
function presetCheck(p: Preset): string | null {
  const { field } = fieldOf(presetCase(p));
  if (field.length < 2) {
    return `field has ${field.length} notes`;
  }
  if (p.gen === 'cps') {
    const n = choose((p.factors as string).split(/\s+/).length, p.k as number);
    if (field.length !== n) {
      return `CPS has ${field.length} notes, expected ${n} (products coincide)`;
    }
  }
  return null;
}

describe('harmonic-field vectors (vectors.json)', () => {
  it('has the 189 vectors (168 from the frozen prototype + 21 retuner) and 53 presets', () => {
    expect(cases).toHaveLength(189);
    expect(PRESETS).toHaveLength(53);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    let err: string | null;
    try {
      err = check(c);
    } catch (x) {
      err = `threw ${(x as Error).message}`;
    }
    expect(err).toBeNull();
  });
});

describe('harmonic-field presets', () => {
  it.each(PRESETS.map((p) => [p.name, p] as const))('preset: %s', (_name, p) => {
    let err: string | null;
    try {
      err = presetCheck(p);
    } catch (x) {
      err = `threw ${(x as Error).message}`;
    }
    expect(err).toBeNull();
  });
});

describe('harmonic-field parseInterval EDO-step text (regression, same results as the prototype)', () => {
  // String.fromCharCode keeps the backslash unambiguous in this source file.
  const BS = String.fromCharCode(92);

  it.each([
    [`7${BS}12`, 700],
    [`7 ${BS} 12`, 700],
    [`7${BS} 12`, 700],
    [`7 ${BS}12`, 700],
    [`-7${BS}12`, -700],
  ])('reads %s as %s c, irrational', (text, cents) => {
    const n = H.parseInterval(text);
    expect(n).not.toBeNull();
    expect(n?.c).toBeCloseTo(cents, 9);
    expect(n?.m).toBeNull();
  });

  it.each([['7s12'], ['7 s 12'], [`7${BS}0`], [`7${BS}${BS}12`]])('rejects %s', (text) => {
    expect(H.parseInterval(text)).toBeNull();
  });
});
