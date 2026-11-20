"""Temper each lattice Z-pair into an EDO and see what survives.

A homomorphism Z^2 -> Z_n (3 -> s3 steps, 5 -> s5 steps) carries difference multisets
to difference multisets, so a lattice Z-pair stays homometric whenever no two notes
collide. Each pair then lands in one of: collision, dihedral copies (TnI-equivalent:
the Z-relation is 'tempered out'), or a genuine Z-pair in n-EDO.

usage: python3 edo.py   (reads tables/families.csv, writes tables/edo.csv)
"""
import json, collections
import pandas as pd
from zcore import ring_canon, ring_iv

EDOS = {12: (7, 4), 19: (11, 6), 22: (13, 7), 31: (18, 10), 53: (31, 17)}
df = pd.read_csv("tables/families.csv")
out = []
for _, r in df.iterrows():
    P, Q = json.loads(r.P), json.loads(r.Q)
    row = {"family": r.family, "k": r.k}
    for n, (s3, s5) in EDOS.items():
        p = sorted({(a * s3 + b * s5) % n for a, b in P}); q = sorted({(a * s3 + b * s5) % n for a, b in Q})
        if len(p) < r.k or len(q) < r.k:
            v = "collision"
        elif ring_canon(p, n) == ring_canon(q, n):
            v = "TnI-equivalent"
        else:
            assert ring_iv(p, n) == ring_iv(q, n)
            v = "Z-pair"
        row[f"edo{n}"] = v
        if n == 12 and v == "Z-pair":
            row["pcs12"] = f"{p} / {q}"
    out.append(row)
e = pd.DataFrame(out); e.to_csv("tables/edo.csv", index=False)
for n in EDOS:
    print(f"{n}-EDO"); print(pd.crosstab(e.k, e[f"edo{n}"]).T.to_string()); print()
# Forte names for 12-EDO hexachord Z-pairs
z12 = e[(e.edo12 == "Z-pair") & (e.k == 6)]
print("k=6 families tempering to 12-EDO Z-hexachords:", list(z12.family), list(z12.pcs12))
z12 = e[(e.edo12 == "Z-pair") & (e.k <= 9)]
print(z12[["family", "k", "pcs12"]].head(20).to_string())
