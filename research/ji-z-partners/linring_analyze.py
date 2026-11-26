"""Mechanisms behind linear-ring (ring Z_L) Z-pairs found by linring.py harmonic/hdisk.

Per rhythm pair (two dihedral classes in one family), take every alignment (rotation/reflection of
B) that shares the most onsets with A. With X the shared part, A = X + D_A and B' = X + D_B. Classify:
  shift   D_B = D_A + h for one ring element h (record the order of h: L / gcd(h, L))
  mirror  D_B = c - D_A for some c (a reflection of the moved part only)
  other
An alignment that is a shift is preferred over mirror over other. Also: overlap histogram, and for
one-note swaps whether the swap is a half-ring move.

usage: pypy3 linring_analyze.py DIR [DIR ...]      (reads DIR/fam_L*.jsonl and DIR/fam/fam_L*.jsonl)
writes DIR/mechanisms.csv (per k, L) and prints totals per k
"""
import collections, csv, json, math, os, sys


def fam_files(out):
    for root in (out, os.path.join(out, "fam")):
        if os.path.isdir(root):
            for name in sorted(os.listdir(root)):
                if name.startswith("fam_L") and name.endswith(".jsonl"):
                    yield os.path.join(root, name)


def dihedral(S, L):
    for sg in (1, -1):
        for t in range(L):
            yield frozenset((sg * x + t) % L for x in S)


def classify(A, B, L):
    A = frozenset(A)
    best, cands = -1, []
    for Bg in set(dihedral(B, L)):
        m = len(A & Bg)
        if m > best:
            best, cands = m, [Bg]
        elif m == best:
            cands.append(Bg)
    kind, order = "other", None
    for Bg in cands:
        DA, DB = sorted(A - Bg), sorted(Bg - A)
        shifts = {(DB[0] - a) % L for a in DA}
        for h in shifts:
            if frozenset((a + h) % L for a in DA) == frozenset(DB):
                o = L // math.gcd(h, L)
                if kind != "shift" or o < order:
                    kind, order = "shift", o
        if kind == "shift":
            continue
        for c in {(DB[0] + a) % L for a in DA}:
            if frozenset((c - a) % L for a in DA) == frozenset(DB):
                kind = "mirror"
    return best, kind, order


def main():
    for out in sys.argv[1:]:
        rows = collections.defaultdict(collections.Counter)
        for path in fam_files(out):
            for line in open(path):
                fam = json.loads(line)
                L, k, cl = fam["L"], fam["k"], fam["classes"]
                reps = [c[0] for c in cl]
                for i in range(len(reps)):
                    for j in range(i + 1, len(reps)):
                        m, kind, order = classify(reps[i], reps[j], L)
                        r = rows[(k, L)]
                        r["rhythm_pairs"] += 1
                        r[f"moved_{k - m}"] += 1
                        r[kind if kind != "shift" else f"shift_order_{order}"] += 1
            print(f"  {os.path.basename(path)}", flush=True)
        keys = sorted({x for r in rows.values() for x in r},
                      key=lambda x: (x != "rhythm_pairs", not x.startswith("moved"), x.split("_")[0],
                                     int(x.split("_")[-1]) if x.split("_")[-1].isdigit() else 0, x))
        with open(os.path.join(out, "mechanisms.csv"), "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["k", "L"] + keys, restval=0)
            w.writeheader()
            for (k, L), r in sorted(rows.items()):
                w.writerow({"k": k, "L": L, **r})
        tot = collections.defaultdict(collections.Counter)
        for (k, L), r in rows.items():
            tot[k].update(r)
        for k in sorted(tot):
            print(k, dict(sorted(tot[k].items(), key=lambda kv: keys.index(kv[0]))))


if __name__ == "__main__":
    main()
