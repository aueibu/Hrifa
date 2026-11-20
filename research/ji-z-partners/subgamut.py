"""Count the families of this run that also live inside a smaller odd-limit gamut.

A family lies in a sub-gamut when both members fit it up to transposition (the
odd-limit gamuts are inversion-symmetric). Because the run is exhaustive, this
must reproduce an exhaustive search of the sub-gamut itself.

usage: python3 subgamut.py ODD_LIMIT [ODD_LIMIT ...]   (reads tables/families.csv)
"""
import sys, json, collections
from math import gcd
from fractions import Fraction as F
import pandas as pd
from zcore import exps


def smooth(n):
    for p in (3, 5):
        while n % p == 0:
            n //= p
    return n == 1


df = pd.read_csv("tables/families.csv")
for N in map(int, sys.argv[1:]):
    odd = [n for n in range(1, N + 1, 2) if smooth(n)]
    G = {exps(str(F(a, b))) for a in odd for b in odd if gcd(a, b) == 1}
    shifts = [(a, b) for a in range(-10, 11) for b in range(-6, 7)]
    fits = lambda S: any({(x + a, y + b) for x, y in S} <= G for a, b in shifts)
    c = collections.Counter(r.k for r in df.itertuples() if fits(json.loads(r.P)) and fits(json.loads(r.Q)))
    print(f"odd limit {N} ({len(G)} notes):", {k: c.get(k, 0) for k in range(6, 17)})
