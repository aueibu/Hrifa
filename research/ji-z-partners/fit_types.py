#!/usr/bin/env python3
"""fit_types.py: is every proven Z-family a linear image of a zgen type? (2026-11-25)

A type (zgen.py types, uv_types.jsonl) is a pair P, Q of point sets in Z^r. Any linear map L: Z^r -> Z^n keeps
difference multisets equal, so L(P), L(Q) is a Z-pair wherever L is one-to-one on the points and the images
are not transpositions or mirrors of each other. This script asks the converse for each proven family: is
there an L (and a translation per member, a member swap, a mirror of the second member) taking the type
onto the family? L is solved from r+1 points of P mapped onto points of a member (every injective choice),
kept only if integral, then checked on all of P and Q.

Output: one JSON line per family: list, k, q, family key, fitted type (or null) and the images of the type's
basis vectors as ratios (the "placement"). Summary to stderr: fitted / not fitted per note count and type.

usage: pypy3 fit_types.py --types T1.jsonl [T2.jsonl ...] --lists DIR/k6/families.jsonl ... > fits.jsonl
"""
import argparse, itertools, json, sys
from fractions import Fraction


def canon(S):
    S = [tuple(p) for p in S]
    m = min(S)
    return tuple(sorted(tuple(a - b for a, b in zip(p, m)) for p in S))


def canon_any(S):
    """canonical form up to translation and mirror"""
    return min(canon(S), canon([tuple(-x for x in p) for p in S]))


def det_inv(D):
    """integer matrix D (r x r) -> (det, adjugate) so that D^-1 = adj / det"""
    r = len(D)
    if r == 1:
        return D[0][0], [[1]]
    if r == 2:
        (a, b), (c, d) = D
        return a * d - b * c, [[d, -b], [-c, a]]
    if r == 3:
        (a, b, c), (d, e, f), (g, h, i) = D
        A = e * i - f * h; B = -(d * i - f * g); C = d * h - e * g
        det = a * A + b * B + c * C
        adj = [[A, -(b * i - c * h), b * f - c * e],
               [B, a * i - c * g, -(a * f - c * d)],
               [C, -(a * h - b * g), a * e - b * d]]
        return det, adj
    raise ValueError("rank > 3 not supported")


class Type:
    def __init__(self, rec):
        self.id = rec["type"]; self.k = rec["k"]; self.r = rec["rank"]
        self.P = [tuple(p) for p in rec["P"]]; self.Q = [tuple(p) for p in rec["Q"]]
        # r+1 points of P whose differences are independent (any; L must then match all points)
        for idx in itertools.combinations(range(len(self.P)), self.r + 1):
            base = self.P[idx[0]]
            D = [[self.P[j][c] - base[c] for c in range(self.r)] for j in idx[1:]]   # rows = difference vectors
            det, adj = det_inv(D)
            if det:
                self.idx, self.det, self.adj = idx, det, adj
                break
        else:
            raise ValueError(f"type {self.id}: no independent points")

    def fit(self, A, B):
        """find L with L(P) ~ A (translation) and L(Q) ~ B (translation and mirror); return L columns or None"""
        n = len(A[0])
        cB = canon_any(B)
        cA = canon(A)
        r = self.r
        for tgt in itertools.permutations(range(len(A)), r + 1):
            base = A[tgt[0]]
            T = [[A[j][c] - base[c] for c in range(n)] for j in tgt[1:]]   # rows: image difference vectors (r x n)
            # rows of D (r x r) map to rows of T: D L^T = T  ->  L^T = D^-1 T = adj T / det
            LT = []
            ok = True
            for i in range(r):
                row = []
                for c in range(n):
                    s = sum(self.adj[i][j] * T[j][c] for j in range(r))
                    if s % self.det:
                        ok = False; break
                    row.append(s // self.det)
                if not ok:
                    break
                LT.append(row)
            if not ok:
                continue
            img = lambda p: tuple(sum(p[i] * LT[i][c] for i in range(r)) for c in range(n))
            IP = [img(p) for p in self.P]
            if len(set(IP)) != len(IP) or canon(IP) != cA:
                continue
            IQ = [img(p) for p in self.Q]
            if len(set(IQ)) == len(IQ) and canon_any(IQ) == cB:
                return LT
        return None


def ratio(v, primes):
    r = Fraction(1)
    for p, e in zip(primes, v):
        r *= Fraction(p) ** e
    while r >= 2:
        r /= 2
    while r < 1:
        r *= 2
    return str(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", nargs="+", required=True)
    ap.add_argument("--lists", nargs="+", required=True)
    a = ap.parse_args()
    types = {}
    for f in a.types:
        for line in open(f):
            t = Type(json.loads(line))
            types.setdefault(t.k, []).append(t)
    seen = set()
    stats = {}
    for path in a.lists:
        for line in open(path):
            r = json.loads(line)
            k = r["notes"]
            A = [tuple(p) for p in r["members"][0]["lattice"]]
            B = [tuple(p) for p in r["members"][1]["lattice"]]
            key = (len(r["primes"]),) + tuple(sorted([canon_any(A), canon_any(B)]))
            if key in seen:
                continue
            seen.add(key)
            hit = None
            for t in types.get(k, []):
                for X, Y in ((A, B), (B, A)):
                    LT = t.fit(X, Y)
                    if LT is not None:
                        hit = (t, LT); break
                if hit:
                    break
            s = stats.setdefault(k, {"families": 0, "fitted": 0, "by_type": {}})
            s["families"] += 1
            out = {"list": path, "k": k, "primes": r["primes"],
                   "members": [m["ratios"] for m in r["members"]], "type": None}
            if hit:
                t, LT = hit
                s["fitted"] += 1
                s["by_type"][t.id] = s["by_type"].get(t.id, 0) + 1
                out["type"] = t.id
                out["basis_ratios"] = [ratio(v, r["primes"]) for v in LT]
                out["basis_vectors"] = LT
            print(json.dumps(out))
    for k in sorted(stats):
        s = stats[k]
        print(f"k={k}: {s['families']} distinct families, {s['fitted']} fitted, {s['families'] - s['fitted']} not "
              f"fitted; by type {dict(sorted(s['by_type'].items()))}", file=sys.stderr)


if __name__ == "__main__":
    main()
