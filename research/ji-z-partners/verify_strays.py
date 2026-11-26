"""Independent check of generator strays (families a constructive generator builds that a ladder rung lacks).
Per stray: both members have k distinct notes; the two members have the same multiset of intervals (up to sign);
every interval's odd limit <= the rung's q; the members are not equal up to translation / mirror;
then whether the family is already a row of the explorer data (same identity as explorer_data.family_key).
Writes the verified, new families (not in the explorer data, outside every proven / exact rectangle) to OUT as extras.
usage: python verify_strays.py explorer_all.json OUT.jsonl  STRAYS:LIMIT:Q [STRAYS:LIMIT:Q ...]   (run in the folder holding explorer_data.py)"""
import sys, json, itertools, collections
from fractions import Fraction
from explorer_data import monzo, family_key, canon, PRIMES

data_path, out_path, specs = sys.argv[1], sys.argv[2], sys.argv[3:]
data = json.load(open(data_path))
K, M, P_, LB = data["k"], data["m"], data["p"], data["lb"]
cover = data["coverage"] + data["exactCoverage"]


def covered(limit, q, k):
    for r in cover:
        a, b = [int(x) for x in r["notes"].split("-")] if "-" in r["notes"] else (int(r["notes"]),) * 2
        if r["limit"] >= limit and r["q"] >= q and a <= k <= b:
            return True
    return False


def odd_limit(v):
    num = den = 1
    for p, e in zip(PRIMES, v):
        if e > 0:
            num *= p ** e
        elif e < 0:
            den *= p ** -e
    return max(num, den)


def ivals(m):
    c = collections.Counter()
    for a, b in itertools.combinations(m, 2):
        d = tuple(x - y for x, y in zip(a, b))
        c[max(d, tuple(-x for x in d))] += 1
    return c


print("indexing explorer rows with 12+ notes ...", flush=True)
have = set()
for i in range(data["count"]):
    if K[i] >= 12:
        mem = M[i]
        have.add(family_key([s.split() for s in mem] if isinstance(mem[0], str) else mem))
print(len(have), "keys", flush=True)

new, seen = [], set()
tot = collections.Counter()
for spec in specs:
    path, limit, q = spec.split(":")
    limit, q = int(limit), int(q)
    c = collections.Counter()
    for line in open(path):
        f = json.loads(line)
        mem = f["members"]
        pts = [[monzo(Fraction(r)) for r in m] for m in mem]
        k = f["k"]
        ok = all(len(set(m)) == k for m in pts)
        c["distinct_ok"] += ok
        homo = ivals(pts[0]) == ivals(pts[1])
        c["homometric"] += homo
        qq = max(odd_limit(d) for d in ivals(pts[0]))
        c["within_q"] += qq <= q
        c["q_matches_file"] += qq == f["q"]
        nontriv = all(canon(pts[0]) != x for x in (canon(pts[1]), canon([tuple(-t for t in p) for p in pts[1]])))
        c["nontrivial"] += nontriv
        key = family_key(mem)
        if not (ok and homo and qq <= q and nontriv):
            c["BAD"] += 1
            continue
        if key in have:
            c["already_in_explorer"] += 1
        elif key in seen:
            c["duplicate_in_strays"] += 1
        elif covered(max(p for m in pts for pt in m for p, e in zip(PRIMES, pt) if e), qq, k):
            c["inside_proven_or_exact_range"] += 1
        else:
            c["NEW"] += 1
            seen.add(key)
            new.append({"k": k, "q": qq, "members": mem, "from": path.split("/")[-1], "T": f.get("T"), "S+": f.get("S+")})
    print(spec, dict(c), flush=True)
    tot.update(c)
print("total", dict(tot))
with open(out_path, "w") as fo:
    for r in new:
        fo.write(json.dumps(r) + "\n")
print("new families written:", len(new), dict(collections.Counter(r["k"] for r in new)))
