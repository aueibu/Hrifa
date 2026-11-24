#!/usr/bin/env python3
"""explorer_data.py: one compact per-family table for the V1 data explorer (arcs/ratio-rhythm PROGRESS, "NEXT").

Reads every proven (shape-free enumerated) list in data/proven/*.tar.xz, merges them (a family found in several
lists is kept once), and writes a columnar JSON file:
  p      highest prime used by either member (the family's limit)
  k      notes
  q      intervallic odd limit (largest odd part of any interval's numerator or denominator)
  gmin   smallest neighboring step of either member, cents, octave wrap included (as data/vm/minstep.py)
  gmax   largest neighboring step of either member, cents, octave wrap included
  lb     0 = in a proven list, 1 = found only by a ladder rung (a lower bound; only with --ladder)
  m      the two members of each proven family, each a space-separated list of ratios (only with --members)
plus "coverage": the proven rectangles (highest prime <= P, q <= Q, note counts) from data/manifest.json, and
"ladderCoverage": the ladder rungs read (with --ladder).

Family identity: each member's lattice points (odd primes 3..19) translated so the lexicographically lowest point
is 0; the pair is the sorted pair of members, taken with the mirror of the whole pair (every point negated),
whichever is smaller. So a family found by two searches that root or orient it differently is kept once.

Self-checks: for every proven run in the manifest, the families inside its rectangle equal its count; every ladder
family inside a proven rectangle is already in the proven lists (otherwise the identity above is wrong, or a
proof is).

usage: python explorer_data.py PROVEN_DIR OUT.json [--members] [--ladder LADDER_DIR] [--extra FILE.jsonl ...]
  PROVEN_DIR   data/proven (archives) or a folder of extracted proven runs
  LADDER_DIR   folder of extracted ladder rungs (<name>/union_k*.jsonl), e.g. from the bucket's ladder/ archives
  --extra      families found after a rung was archived ({"k", "q", "members": [[ratios], [ratios]]}), counted
               as ladder families (tables/chordsum/gen_11q405.strays.jsonl)
"""
import json, math, os, re, sys, tarfile
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
PRIMES = (3, 5, 7, 11, 13, 17, 19)
LADDER_RUNGS = {"l7q405_on": (7, 405), "l7q729_on": (7, 729), "l11q243_on": (11, 243), "l11q405_on": (11, 405),
                "l13q243_on": (13, 243), "l17q243_on": (17, 243)}


def odd(n):
    n = abs(n)
    while n and n % 2 == 0:
        n //= 2
    return n


def monzo(fr):
    v = []
    n, d = fr.numerator, fr.denominator
    for p in PRIMES:
        e = 0
        while n % p == 0:
            n //= p; e += 1
        while d % p == 0:
            d //= p; e -= 1
        v.append(e)
    rest = odd(n) * odd(d)
    if rest != 1:
        raise ValueError(f"{fr} uses a prime above 19")
    return tuple(v)


def canon(points):
    lo = min(points)
    return tuple(sorted(tuple(a - b for a, b in zip(pt, lo)) for pt in points))


def family_key(members):
    pts = [[monzo(Fraction(r)) for r in m] for m in members]
    a = tuple(sorted(canon(m) for m in pts))
    b = tuple(sorted(canon([tuple(-x for x in pt) for pt in m]) for m in pts))
    return min(a, b)


def describe(members):
    """(p, k, q, gmin, gmax) from the two members' ratio lists."""
    fr = [[Fraction(r) for r in m] for m in members]
    used = {p for m in fr for x in m for p, e in zip(PRIMES, monzo(x)) if e}
    q = 1
    for m in fr:
        for i, a in enumerate(m):
            for b in m[i + 1:]:
                x = b / a
                q = max(q, odd(x.numerator), odd(x.denominator))
    st = []
    for m in fr:
        c = sorted(1200 * math.log2(x) for x in m)
        st.append([b - a for a, b in zip(c, c[1:])] + [1200 - c[-1] + c[0]])
    return (max(used) if used else 2, len(fr[0]), q, round(min(min(s) for s in st), 1),
            round(max(max(s) for s in st), 1))


def proven_lines(src):
    """Yield families.jsonl lines from .tar.xz archives or already extracted folders."""
    for name in sorted(os.listdir(src)):
        path = os.path.join(src, name)
        if name.endswith(".tar.xz"):
            with tarfile.open(path, "r:xz") as t:
                for m in t:
                    if m.isfile() and re.search(r"/k\d+/families\.jsonl$", m.name):
                        yield from t.extractfile(m)
        elif os.path.isdir(path):
            for kd in sorted(os.listdir(path)):
                fp = os.path.join(path, kd, "families.jsonl")
                if re.fullmatch(r"k\d+", kd) and os.path.isfile(fp):
                    with open(fp, "rb") as fh:
                        yield from fh


def main():
    args = sys.argv[1:]
    want_members = "--members" in args
    args = [a for a in args if a != "--members"]
    ladder_dir, extras = None, []
    if "--ladder" in args:
        i = args.index("--ladder"); ladder_dir = args[i + 1]; del args[i:i + 2]
    while "--extra" in args:
        i = args.index("--extra"); extras.append(args[i + 1]); del args[i:i + 2]
    src, out = args
    manifest = json.load(open(os.path.join(HERE, "data", "manifest.json")))
    proven = [r for r in manifest["runs"] if r["status"] == "proven"]

    def ks(r):
        a, _, b = r["note_counts"].partition("-")
        return set(range(int(a), int(b or a) + 1))

    def in_proven(p, k, q):
        return any(p <= r["limit"] and q <= r["q"] and k in ks(r) for r in proven)

    fams = {}  # key -> (p, k, q, gmin, gmax, lb, members)
    for line in proven_lines(src):
        if not line.strip():
            continue
        f = json.loads(line)
        members = [m["ratios"] for m in f["members"]]
        key = family_key(members)
        if key not in fams:
            fams[key] = describe(members) + (0, members)

    bad = []
    for r in proven:
        n = sum(1 for v in fams.values() if v[0] <= r["limit"] and v[2] <= r["q"] and v[1] in ks(r))
        if n != r["families"]:
            bad.append(f"{r['name']}: {n} != {r['families']}")
    if bad:
        sys.exit("count check FAILED: " + "; ".join(bad))
    n_proven = len(fams)

    ladder_cover = []
    if ladder_dir:
        def ladder_families():
            for name in sorted(os.listdir(ladder_dir)):
                if name not in LADDER_RUNGS:
                    continue
                ladder_cover.append({"limit": LADDER_RUNGS[name][0], "q": LADDER_RUNGS[name][1], "notes": "6-16",
                                     "run": name})
                d = os.path.join(ladder_dir, name)
                for fn in sorted(os.listdir(d)):
                    if re.fullmatch(r"union_k\d+\.jsonl", fn):
                        with open(os.path.join(d, fn), "rb") as fh:
                            for line in fh:
                                if line.strip():
                                    yield name, [m["ratios"] for m in json.loads(line)["members"]]
            for path in extras:
                with open(path, "rb") as fh:
                    for line in fh:
                        if line.strip():
                            yield os.path.basename(path), json.loads(line)["members"]

        added, misses = 0, []
        for name, members in ladder_families():
            key = family_key(members)
            if key in fams:
                continue
            d = describe(members)
            if in_proven(d[0], d[1], d[2]):
                misses.append((name, d[:3]))
                continue
            fams[key] = d + (1, None)
            added += 1
        if misses:
            sys.exit(f"identity check FAILED: {len(misses)} ladder families inside a proven range are not in the "
                     f"proven lists, e.g. {misses[:5]}")
        print(f"ladder: {added} families beyond the proven lists")

    rects = [(r["limit"], r["q"], r["note_counts"]) for r in proven]
    cover = sorted({(L, Q, nc) for L, Q, nc in rects
                    if not any((L2 >= L and Q2 >= Q and nc2 == nc and (L2, Q2) != (L, Q)) for L2, Q2, nc2 in rects)})

    rows = sorted(fams.values(), key=lambda v: (v[5], v[0], v[1], v[2], v[3]))
    data = {
        "source": "research/ji-z-partners/data/proven/*.tar.xz (shape-free enumeration, proven complete)"
                  + ("; ladder rungs from the bucket's archive_2026-11-23/ladder/ (lower bounds)" if ladder_dir else "")
                  + "; explorer_data.py",
        "coverage": [{"limit": L, "q": Q, "notes": nc} for L, Q, nc in cover],
        "ladderCoverage": sorted(ladder_cover, key=lambda c: (c["limit"], c["q"])),
        "count": len(rows), "proven": n_proven,
        "p": [v[0] for v in rows], "k": [v[1] for v in rows], "q": [v[2] for v in rows],
        "gmin": [v[3] for v in rows], "gmax": [v[4] for v in rows], "lb": [v[5] for v in rows],
    }
    if want_members:
        data["m"] = [[" ".join(m) for m in v[6]] for v in rows if v[5] == 0]
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"wrote {out}: {len(rows)} families ({n_proven} proven), {os.path.getsize(out):,} bytes; "
          f"checks passed for {len(proven)} proven runs")
    print("coverage:", data["coverage"])


if __name__ == "__main__":
    main()
