"""Equivalence check for zgen.py's integer row reduction (run on the VM with pypy3).

Usage: pypy3 check_rref.py /path/to/zgen.py [trials]
1. Random integer systems (sizes and entry ranges like the types search, plus rank-deficient ones):
   the integer _rref_key must equal the original Fraction _rref_key_frac exactly.
2. _nullspace: every basis vector solves every row, the basis has n - rank vectors, and they are
   independent (rank of the basis = n - rank).
Prints PASS or the first counterexample.
"""
import random, sys, os, importlib.util

path = sys.argv[1]
trials = int(sys.argv[2]) if len(sys.argv) > 2 else 20000
spec = importlib.util.spec_from_file_location("zgen", path)
z = importlib.util.module_from_spec(spec)
sys.argv = ["zgen.py"]
spec.loader.exec_module(z)

rng = random.Random(20261121)
for t in range(trials):
    n = rng.randint(1, 16)
    m = rng.randint(1, n + 2)
    lo = rng.choice([1, 2, 3, 9])
    rows = [[rng.randint(-lo, lo) for _ in range(n)] for _ in range(m)]
    if m > 1 and rng.random() < 0.3:          # rank-deficient: a combination of two rows
        a, b = rng.sample(range(m), 2) if m > 1 else (0, 0)
        c1, c2 = rng.randint(-3, 3), rng.randint(-3, 3)
        rows.append([c1 * x + c2 * y for x, y in zip(rows[a], rows[b])])
    new, old = z._rref_key(rows, n), z._rref_key_frac(rows, n)
    if new != old:
        print("FAIL rref", rows, n, new, old)
        sys.exit(1)
    rank = len(new)
    if not any(any(r) for r in rows):
        continue
    B = z._nullspace(rows, n)
    for v in B:
        for r in rows:
            if sum(a * b for a, b in zip(r, v)) != 0:
                print("FAIL nullspace vector", rows, n, v)
                sys.exit(1)
    if len(B) != n - rank or (B and len(z._rref_key(B, n)) != len(B)):
        print("FAIL nullspace size/independence", rows, n, B, rank)
        sys.exit(1)
print(f"PASS: {trials} random systems, integer reduction equals the Fraction version; nullspace checked")
