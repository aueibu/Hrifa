"""Structural analysis of a Z-family run. Writes families.csv, tables/*.csv, figs/*.png.

usage: python3 analyze.py RUN_DIR
"""
import sys, collections, itertools, json, os
from math import log2
import pandas as pd
import networkx as nx
from zcore import (load, exps, canon, diffs, ic_ratio, tenney, unit_links, HEX,
                   ring, ring_canon, ratio)

run = sys.argv[1]
os.makedirs("tables", exist_ok=True)
fams = list(load(f"{run}/families.jsonl"))
members_of = {f["family"]: [canon([exps(r) for r in m["ratios"]]) for m in f["members"]] for f in fams}
member_index = {}
for fid, ms in members_of.items():
    for i, c in enumerate(ms):
        member_index[c] = (fid, i)


def sub(a, b): return (a[0] - b[0], a[1] - b[1])
def add(a, b): return (a[0] + b[0], a[1] + b[1])


# ---------- 1. direct-sum (Minkowski) explanation:  P = A (+) B,  Q ~ A (+) (-B) ----------
def direct_sum(P, Q):
    k = len(P)
    Pn = sorted(sub(p, min(P)) for p in P)
    Ps = set(Pn)
    cq = canon(Q)
    for n in range(3, k // 3 + 1):
        if k % n:
            continue
        m = k // n
        for rest in itertools.combinations(Pn[1:], n - 1):
            A = [(0, 0)] + list(rest)
            B = [p for p in Pn if all(add(p, a) in Ps for a in A)]
            if len(B) != m:
                continue
            S = {add(a, b) for a in A for b in B}
            if len(S) != k or S != Ps:
                continue
            if canon([sub(a, b) for a in A for b in B]) == cq:
                return n, m, canon(A), canon(B)
    return None


# ---------- 2. contains a smaller Z-pair (delete j notes from each member) ----------
def contained_pair(P, Q, jmax=3):
    for j in range(1, jmax + 1):
        if len(P) - j < 6:
            break
        hp = collections.defaultdict(set)
        for drop in itertools.combinations(range(len(P)), j):
            c = canon([p for i, p in enumerate(P) if i not in drop])
            if c in member_index:
                hp[member_index[c][0]].add(member_index[c][1])
        if not hp:
            continue
        for drop in itertools.combinations(range(len(Q)), j):
            c = canon([q for i, q in enumerate(Q) if i not in drop])
            if c in member_index:
                fid, idx = member_index[c]
                if fid in hp and (1 - idx) in hp[fid]:
                    return j, fid
    return None


# ---------- 3. lattice symmetry relating the two members ----------
def hex_relation(P, Q):
    cq = canon(Q)
    out = [name for name, g in HEX if canon([g(v) for v in P]) == cq]
    return out


def family_hex_key(P, Q):
    return min(tuple(sorted([canon([g(v) for v in P]), canon([g(v) for v in Q])])) for _, g in HEX)


# ---------- 4. link pattern (unlabelled unit-link graph, up to isomorphism) ----------
link_reps = collections.defaultdict(list)   # wl hash -> [(id, graph)]
def link_key(S):
    G = nx.Graph(); G.add_nodes_from(range(len(S))); G.add_edges_from(unit_links(S))
    h = nx.weisfeiler_lehman_graph_hash(G, iterations=4)
    bucket = link_reps[h]
    for lid, H in bucket:
        if nx.is_isomorphic(G, H):
            return lid
    lid = f"{h[:8]}-{len(bucket)}"
    bucket.append((lid, G))
    return lid, G.number_of_edges(), nx.number_connected_components(G)


link_meta = {}
def link(S):
    r = link_key(S)
    if isinstance(r, tuple):
        link_meta[r[0]] = {"edges": r[1], "components": r[2], "nodes": len(S)}
        return r[0]
    return r


# ---------- 5. best overlap after transposition / inversion ----------
def max_shared(P, Q):
    Ps = set(P); best = 0
    for sgn in (1, -1):
        Qs = [(sgn * a, sgn * b) for a, b in Q]
        for p in P:
            for q in Qs:
                t = sub(p, q)
                best = max(best, sum(add(q2, t) in Ps for q2 in Qs))
    return best


# ---------- 6. ring (linear) reading: any rooting where they are a ring Z-pair? ----------
def ring_iv_counter(slots, L):
    c = collections.Counter()
    for a, b in itertools.combinations(slots, 2):
        d = abs(a - b); c[min(d, L - d)] += 1
    return c


def ring_check(P, Q):
    """Over all choices of root (which note is 1/1) for P and Q: same L, same ring IV, not dihedral."""
    rp = {}
    for r in P:
        L, s = ring([sub(p, r) for p in P]); rp.setdefault(L, []).append(s)
    sameL = False
    for r in Q:
        L, s = ring([sub(q, r) for q in Q])
        if L in rp:
            sameL = True
            ivq = ring_iv_counter(s, L)
            for sp in rp[L]:
                if ring_iv_counter(sp, L) == ivq and ring_canon(sp, L) != ring_canon(s, L):
                    return "ring Z-pair"
    return "same L, not homometric" if sameL else "never same L"


rows = []
for f in fams:
    P, Q = members_of[f["family"]]
    k = f["notes"]
    D = diffs(P)
    ds = direct_sum(P, Q)
    cp = None if ds else contained_pair(P, Q)
    hx = hex_relation(P, Q)
    lp, lq = link(P), link(Q)
    rows.append({
        "family": f["family"], "k": k,
        "distinct_ic": f["distinct_interval_classes"], "pairs": k * (k - 1) // 2,
        "explained": "direct sum A(+)B vs A(+)(-B)" if ds else ("contains smaller Z-pair" if cp else "other"),
        "ds_sizes": f"{ds[0]}x{ds[1]}" if ds else "",
        "ds_A": json.dumps(ds[2]) if ds else "", "ds_B": json.dumps(ds[3]) if ds else "",
        "contained_drop": cp[0] if cp else None, "contained_family": cp[1] if cp else None,
        "hex_related": ";".join(f"rot{r}{'m' if m else ''}" for r, m in hx),
        "hex_key": json.dumps(family_hex_key(P, Q)),
        "link_P": lp, "link_Q": lq, "same_link": lp == lq,
        "shared_max": max_shared(P, Q),
        "ic_tenney_mean": sum(tenney(v) for v in D) / len(D),
        "uses5_P": len({b for _, b in P}) > 1, "uses5_Q": len({b for _, b in Q}) > 1,
        "rows5_P": len({b for _, b in P}), "rows5_Q": len({b for _, b in Q}),
        "ring": ring_check(P, Q) if k <= 9 else "",
        "P": json.dumps(P), "Q": json.dumps(Q),
        "P_ratios": " ".join(str(ratio(v)) for v in sorted(P, key=lambda v: ratio(v))),
        "Q_ratios": " ".join(str(ratio(v)) for v in sorted(Q, key=lambda v: ratio(v))),
    })

df = pd.DataFrame(rows)
df.to_csv("tables/families.csv", index=False)
pd.DataFrame([{"link": k, **v} for k, v in link_meta.items()]).to_csv("tables/link_patterns.csv", index=False)
print("wrote tables/families.csv", len(df))
