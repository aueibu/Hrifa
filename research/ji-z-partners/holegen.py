#!/usr/bin/env python3
"""holegen.py: generator for the "hole" leftover families (THEORY_SMALL_FACTOR.md 6.4).

Hole construction: a chord T (plain, 3 or 4 notes by default), a plain set S+ and one note s- not in S+
(placed at the origin, so the hole is T itself). The stack T·S+ has no doubled note and contains every
note of T; P = T·S+ minus T, Q = T⁻¹·S+ minus T⁻¹ (T⁻¹ = mirror, 1/(a:b:c) for T = a:b:c).
P and Q share their interval content (P = T·S, Q = T*·S with S = S+ − 1 as polynomials).

Why the search below is complete (for one hole, the chosen chord sizes and k <= --max-notes):
* T ⊂ T·S+ means every a in T is a'·c with c in S+, so c = a/a' is an interval of T: C = S+ ∩ D(T)
  is a set of intervals of T whose stack covers T. All such C are tried.
* No doubled note: D(S+) ∩ D(T) = {1}. A note a·r with r outside D(T) never lands in T, so copies
  T·r (r in R = S+ minus C) survive whole; copies T·c (c in C) lose the notes that fill the hole.
* Every note of P has an allowed interval to a fixed surviving note y of a C copy (C copies never lose
  all their notes: T·c = T is impossible), so every r satisfies T[0]·r = y·e for some allowed e.
  R is then a clique among these candidates (pairwise: no doubled notes, all intervals allowed).
Q needs no separate test: T⁻¹ ⊂ T⁻¹·S+ by the same c, D(T⁻¹) = D(T), and Q has P's intervals.

--check LIST_DIR --ov OVERLAP_TSV: every generated family must be in the list (else something is
wrong); every list family that overlap.py describes as a hole with |T| in --chord-sizes and one minus
note must be generated.

usage: python3 holegen.py --primes 3 5 7 --q 315 [--chord-sizes 3 4] [--max-notes 16] [--workers 16]
          [--out F] [--check DIR --ov TSV]
"""
import argparse, collections, itertools, json, sys, time
from multiprocessing import Pool

from chordgen import (add, allowed_set, canon_TI, cliques, diffs, iol_of, neg, ratio, sub)

G = {}


def init(E, maxk):
    G["E"] = E
    G["maxk"] = maxk


def work(T):
    E, maxk = G["E"], G["maxk"]
    t = len(T)
    Tset = set(T)
    DT = diffs(T)
    DTl = sorted(DT)
    z = tuple(0 for _ in T[0])
    E0 = E | {z}
    # full copies pairwise: every interval between T·r and T·r' allowed
    ET = set(E)
    for d in DT:
        ET &= {sub(e, d) for e in E}
    ET -= DT
    smax = maxk // t + 1          # k = t (|S+| - 1) <= maxk
    out = []
    for nc in range(1, min(len(DTl), smax) + 1):
        for C in itertools.combinations(DTl, nc):
            if any(sub(c2, c1) in DT for c1, c2 in itertools.permutations(C, 2)):
                continue          # two C copies would double a note
            stackC = {add(a, c) for a in T for c in C}
            if not Tset <= stackC:
                continue          # the hole is not filled
            surv = stackC - Tset
            if any(sub(x, y) not in E for x in surv for y in surv if x != y):
                continue
            y = min(surv)
            cands = []
            for e in E:
                r = sub(add(y, e), T[0])
                if r == z or r in DT or r in C:
                    continue
                if any(sub(r, c) in DT for c in C):
                    continue      # doubled note with a C copy
                notes = [add(a, r) for a in T]
                if all(sub(x, s) in E for x in notes for s in surv):
                    cands.append(r)
            cands.sort()
            for ns in range(max(nc, 2), smax + 1):
                nr = ns - nc
                if t * (ns - 1) < 6:
                    continue
                if nr == 0:
                    Rs = [()]
                else:
                    Rs = []
                    def rec(cur, rest):
                        if len(cur) == nr:
                            Rs.append(tuple(cur))
                            return
                        for i, v in enumerate(rest):
                            rec(cur + [v], [w for w in rest[i + 1:] if sub(w, v) in ET])
                    rec([], cands)
                for R in Rs:
                    Sp = list(C) + list(R)
                    P = sorted(surv | {add(a, r) for a in T for r in R})
                    if len(P) != t * (ns - 1):
                        continue
                    Ti = [neg(a) for a in T]
                    Q = sorted({add(a, s) for a in Ti for s in Sp} - set(Ti))
                    cP, cQ = canon_TI(P), canon_TI(Q)
                    if cP == cQ:
                        continue
                    out.append((tuple(sorted((cP, cQ))), canon_TI(T), tuple(sorted(Sp))))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--primes", type=int, nargs="+", required=True)
    ap.add_argument("--q", type=int, required=True)
    ap.add_argument("--chord-sizes", type=int, nargs="+", default=[3, 4])
    ap.add_argument("--max-notes", type=int, default=16)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--out")
    ap.add_argument("--check")
    ap.add_argument("--ov")
    a = ap.parse_args()
    t0 = time.time()
    primes = a.primes
    E = allowed_set(primes, a.q)
    zero = tuple(0 for _ in primes)
    Vs = sorted(v for v in E if v > zero)
    chords = set()
    for x in a.chord_sizes:
        for T in cliques(Vs, lambda p, r: sub(r, p) in E, x, start=zero):
            chords.add(canon_TI(T))
    chords = sorted(chords, key=lambda c: (len(c), c))
    print(f"# holes, primes {primes} q {a.q}: {len(E)} allowed intervals, {len(chords)} chords, "
          f"{time.time() - t0:.0f} s", file=sys.stderr, flush=True)
    fams = {}
    with Pool(a.workers, initializer=init, initargs=(E, a.max_notes)) as pool:
        for res in pool.imap_unordered(work, chords, chunksize=4):
            for key, T, Sp in res:
                if key not in fams:
                    fams[key] = (T, Sp)
    print(f"# {len(fams)} hole families, {time.time() - t0:.0f} s", file=sys.stderr, flush=True)
    print("# by notes: " + ", ".join(f"{k}: {c}" for k, c in sorted(collections.Counter(len(k[0]) for k in fams).items())),
          file=sys.stderr)
    if a.out:
        with open(a.out, "w") as fo:
            for (P, Q), (T, Sp) in fams.items():
                fo.write(json.dumps({"k": len(P), "q": iol_of(P, primes), "T": [str(ratio(v, primes)) for v in T],
                                     "S+": [str(ratio(v, primes)) for v in Sp], "hole_at": "1",
                                     "members": [[str(ratio(v, primes)) for v in S] for S in (P, Q)]}) + "\n")
    if a.check:
        import glob, os
        member_fam = {}
        for fn in glob.glob(os.path.join(a.check, "k*", "families.jsonl")):
            for line in open(fn):
                f = json.loads(line)
                fid = (f["notes"], f["family"])
                for m in f["members"]:
                    member_fam[canon_TI([tuple(p) for p in m["lattice"]])] = fid
        got = set()
        stray = collections.Counter()
        for (P, Q) in fams:
            fp, fq = member_fam.get(P), member_fam.get(Q)
            if fp is not None and fp == fq:
                got.add(fp)
            else:
                stray[len(P)] += 1
        print(f"# check {a.check}: generated families found in the list {len(got)}, not in the list "
              f"{dict(sorted(stray.items()))}", file=sys.stderr)
        if a.ov:
            want = set()
            for line in open(a.ov):
                c = line.rstrip("\n").split("\t")
                if c[0] == "list" or not c[5] or not c[8]:
                    continue
                st = eval(c[8])
                if int(c[7]) == 1 and int(c[5]) in a.chord_sizes and st[0] == 1:
                    want.add((int(c[2]), int(c[1])))
            miss = want - got
            print(f"# holes in the list (one minus note, chord of {a.chord_sizes} notes): {len(want)}; generated "
                  f"{len(want & got)}; missed {len(miss)} by notes "
                  f"{dict(sorted(collections.Counter(k for k, _ in miss).items()))}; generated leftovers of "
                  f"other descriptions {len(got - want)}", file=sys.stderr)
            if miss:
                print("# missed (k, id): " + " ".join(map(str, sorted(miss)[:20])), file=sys.stderr)


if __name__ == "__main__":
    main()
