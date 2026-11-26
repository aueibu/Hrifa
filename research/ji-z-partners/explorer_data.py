#!/usr/bin/env python3
"""explorer_data.py: one compact per-family table for the V1 data explorer (arcs/ratio-rhythm PROGRESS, "NEXT").

Reads every proven (shape-free enumerated) list in data/proven/*.tar.xz, merges them (a family found in several
lists is kept once), and writes a columnar JSON file:
  p      highest prime used by either member (the family's limit)
  k      notes
  q      intervallic odd limit (largest odd part of any interval's numerator or denominator)
  gmin   smallest neighboring step of either member, cents, octave wrap included (as data/vm/minstep.py)
  gmax   largest neighboring step of either member, cents, octave wrap included
  lb     0 = in a proven list, 2 = exact from the patterns (with --exact) and in no proven list,
         1 = found only by a ladder rung (a lower bound; only with --ladder)
  m      the two members of every family (proven, exact and ladder), each a space-separated list of ratios, in row
         order (only with --members)
plus "coverage": the proven rectangles (highest prime <= P, q <= Q, note counts) from data/manifest.json and
data/manifest_2026-11-24.json (the 6-9-note night) and data/manifest_2026-11-25.json (the 2026-11-25 night queue;
its paused runs have no summary.csv and are neither read nor counted),
"exactCoverage": the rectangles the pattern lists are exact for (with --exact), and
"ladderCoverage": the ladder rungs read (with --ladder).
Rows are ordered proven (lb 0), then exact (lb 2), then ladder (lb 1); "proven" and "exact" give the group sizes.

Family identity: each member's lattice points (odd primes 3..19) translated so the lexicographically lowest point
is 0, and the smaller of that and its own mirror (every point negated) is used; the pair is the sorted pair
of these. So a family found by two searches that root or orient it differently is kept once.

Self-checks: for every proven run in the manifest, the families inside its rectangle equal its count; every ladder
family inside a proven rectangle is already in the proven lists (otherwise the identity above is wrong, or a
proof is). With --exact: inside every proven rectangle that overlaps the exact coverage (clipped to it), the pattern
families equal the proven families exactly (counts printed per rectangle and note count); every pattern family lies
inside the exact coverage; every ladder family inside the exact coverage is a pattern family.

usage: python explorer_data.py PROVEN_DIR OUT.json [--members] [--ladder LADDER_DIR] [--extra FILE.jsonl ...]
                               [--exact FILE.jsonl ... --exact-coverage L:Q:K[-K2] ...]
  PROVEN_DIR   data/proven (archives) or a folder of extracted proven runs
  LADDER_DIR   folder of extracted ladder rungs (<name>/union_k*.jsonl), e.g. from the bucket's ladder/ archives
  --extra      families found after a rung was archived ({"k", "q", "members": [[ratios], [ratios]]}), counted
               as ladder families (tables/chordsum/gen_11q405.strays.jsonl)
  --exact      the exact family lists from placing the known patterns (one JSON line per family with "members";
               e.g. k6_l23_q531441.jsonl k7_l23_q531441.jsonl); takes every following argument up to the next --option
  --exact-coverage  what those lists are complete for, given explicitly (the lines carry each family's own q, not
               the search bound): highest prime <= L, q <= Q, notes K..K2, e.g. 23:531441:6-7 (repeatable;
               required with --exact). A limit-23 list covers every lower limit.
"""
import json, math, os, re, sys, tarfile
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
PRIMES = (3, 5, 7, 11, 13, 17, 19, 23)
# ladder rungs read with --ladder: name -> (limit, q, note counts); the k789L rungs are from the 2026-11-24 night
# (bucket archive_2026-11-24/k6789_ladders.tar.xz), only where they reach past the proofs
LADDER_RUNGS = {"l7q405_on": (7, 405, "6-16"), "l7q729_on": (7, 729, "6-16"), "l11q243_on": (11, 243, "6-16"),
                "l11q405_on": (11, 405, "6-16"), "l13q243_on": (13, 243, "6-16"), "l17q243_on": (17, 243, "6-16"),
                "k789L_l13q405": (13, 405, "7-9"), "k789L_l17q405": (17, 405, "7-9"), "k789L_l19q405": (19, 405, "7-9")}
MANIFESTS = ("manifest.json", "manifest_2026-11-24.json", "manifest_2026-11-25.json")


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
        raise ValueError(f"{fr} uses a prime above 23")
    return tuple(v)


def canon(points):
    lo = min(points)
    return tuple(sorted(tuple(a - b for a, b in zip(pt, lo)) for pt in points))


def family_key(members):
    """Each member is taken up to translation and its own mirror (P ~ -P), then the pair is sorted;
    this is the identity build_shapes.py / build-shapes-rs use (canon_any per member)."""
    pts = [[monzo(Fraction(r)) for r in m] for m in members]
    return tuple(sorted(
        min(canon(m), canon([tuple(-x for x in pt) for pt in m])) for m in pts))


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
    """Yield families.jsonl lines from .tar.xz archives or already extracted folders.
    An archive holding several runs (k6789_proofs.tar.xz) also holds runs that were capped or failed: only run folders
    with summary.csv (written when an enumeration finishes) are read from such an archive. Single-run archives have no
    summary.csv and are read whole."""
    for name in sorted(os.listdir(src)):
        path = os.path.join(src, name)
        if name.endswith(".tar.xz"):
            with tarfile.open(path, "r:xz") as t:
                done = {m.name.split("/")[0] for m in t.getmembers() if m.name.endswith("/summary.csv")}
            with tarfile.open(path, "r:xz") as t:
                for m in t:
                    if m.isfile() and re.search(r"/k\d+/families\.jsonl$", m.name) and (not done or m.name.split("/")[0] in done):
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
    exact_files, exact_specs = [], []
    while "--exact-coverage" in args:
        i = args.index("--exact-coverage"); exact_specs.append(args[i + 1]); del args[i:i + 2]
    while "--exact" in args:
        i = args.index("--exact"); j = i + 1
        while j < len(args) and not args[j].startswith("--"):
            j += 1
        exact_files += args[i + 1:j]; del args[i:j]
    if exact_files and not exact_specs:
        sys.exit("--exact needs --exact-coverage L:Q:K[-K2] (what the pattern lists are complete for)")
    src, out = args
    proven = [r for mf in MANIFESTS for r in json.load(open(os.path.join(HERE, "data", mf)))["runs"]
              if r["status"] == "proven"]

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

    # exact families from placing the known patterns (--exact)
    exact_cover = []
    for s in exact_specs:
        L, Q, nc = s.split(":")
        exact_cover.append({"limit": int(L), "q": int(Q), "notes": nc})

    def in_exact(p, k, q):
        return any(p <= c["limit"] and q <= c["q"] and k in ks({"note_counts": c["notes"]}) for c in exact_cover)

    exact, n_exact = {}, 0
    if exact_files:
        outside, lines_read = [], 0
        for path in exact_files:
            with open(path, "rb") as fh:
                for line in fh:
                    if not line.strip():
                        continue
                    lines_read += 1
                    members = json.loads(line)["members"]
                    key = family_key(members)
                    if key in exact:
                        continue
                    d = describe(members)
                    if not in_exact(d[0], d[1], d[2]):
                        outside.append((os.path.basename(path), d[:3]))
                    exact[key] = d + (2, members)
        print(f"exact: {lines_read} lines, {len(exact)} distinct pattern families from {len(exact_files)} files")
        if outside:
            sys.exit(f"exact coverage check FAILED: {len(outside)} pattern families outside --exact-coverage, "
                     f"e.g. {outside[:5]}")
        # self-check: inside every proven rectangle (clipped to the exact coverage) both lists agree exactly
        by_k = {}
        for key, v in fams.items():
            by_k.setdefault(v[1], []).append((key, v[0], v[2]))
        ex_k = {}
        for key, v in exact.items():
            ex_k.setdefault(v[1], []).append((key, v[0], v[2]))
        mism, checked = [], 0
        for r in proven:
            for c in exact_cover:
                for k in sorted(ks(r) & ks({"note_counts": c["notes"]})):
                    L, Q = min(r["limit"], c["limit"]), min(r["q"], c["q"])
                    P = {key for key, p, q in by_k.get(k, ()) if p <= L and q <= Q}
                    E = {key for key, p, q in ex_k.get(k, ()) if p <= L and q <= Q}
                    checked += 1
                    ok = P == E
                    print(f"  self-check {r['name']} k{k} (p <= {L}, q <= {Q}): proven {len(P)}, patterns {len(E)}"
                          + ("" if ok else f"  MISMATCH: {len(P - E)} proven only, {len(E - P)} patterns only"))
                    if not ok:
                        mism.append((r["name"], k, [fams[x][6] for x in list(P - E)[:3]],
                                     [exact[x][6] for x in list(E - P)[:3]]))
        if mism:
            sys.exit(f"exact self-check FAILED in {len(mism)} rectangles, e.g. {mism[:3]}")
        print(f"exact self-check passed for {checked} (proven rectangle, note count) pairs")
        for key, v in exact.items():
            if key not in fams:
                fams[key] = v
                n_exact += 1
        print(f"exact: {n_exact} families beyond the proven lists")

    ladder_cover = []
    if ladder_dir:
        def ladder_families():
            for name in sorted(os.listdir(ladder_dir)):
                if name not in LADDER_RUNGS:
                    continue
                ladder_cover.append({"limit": LADDER_RUNGS[name][0], "q": LADDER_RUNGS[name][1], "notes": LADDER_RUNGS[name][2],
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

        added, misses, exact_misses, now_exact = 0, [], [], set()
        for name, members in ladder_families():
            key = family_key(members)
            if key in fams:
                if fams[key][5] == 2:
                    now_exact.add(key)  # a ladder family the patterns cover: kept as exact (lb 2)
                continue
            d = describe(members)
            if in_proven(d[0], d[1], d[2]):
                misses.append((name, d[:3]))
                continue
            if exact_cover and in_exact(d[0], d[1], d[2]):
                exact_misses.append((name, d[:3], members))
                continue
            fams[key] = d + (1, members)
            added += 1
        if misses:
            sys.exit(f"identity check FAILED: {len(misses)} ladder families inside a proven range are not in the "
                     f"proven lists, e.g. {misses[:5]}")
        if exact_misses:
            sys.exit(f"exact check FAILED: {len(exact_misses)} ladder families inside the exact coverage are not "
                     f"pattern families, e.g. {exact_misses[:3]}")
        print(f"ladder: {added} families beyond the proven and exact lists; {len(now_exact)} ladder families "
              f"are pattern families (now exact, lb 2)")

    rects = [(r["limit"], r["q"], r["note_counts"]) for r in proven]
    cover = sorted({(L, Q, nc) for L, Q, nc in rects
                    if not any((L2 >= L and Q2 >= Q and nc2 == nc and (L2, Q2) != (L, Q)) for L2, Q2, nc2 in rects)})

    # rows grouped proven (lb 0), exact (lb 2), ladder (lb 1): explorer_pack.py keeps the first two groups' ratios inline
    lb_order = {0: 0, 2: 1, 1: 2}
    rows = sorted(fams.values(), key=lambda v: (lb_order[v[5]], v[0], v[1], v[2], v[3]))
    data = {
        "source": "research/ji-z-partners/data/proven/*.tar.xz (shape-free enumeration, proven complete)"
                  + (f"; exact from the patterns: {', '.join(os.path.basename(f) for f in exact_files)}"
                     if exact_files else "")
                  + ("; ladder rungs from the bucket's archive_2026-11-23/ladder/ (lower bounds)" if ladder_dir else "")
                  + "; explorer_data.py",
        "coverage": [{"limit": L, "q": Q, "notes": nc} for L, Q, nc in cover],
        "exactCoverage": exact_cover,
        "ladderCoverage": sorted(ladder_cover, key=lambda c: (c["limit"], c["q"])),
        "count": len(rows), "proven": n_proven, "exact": n_exact,
        "p": [v[0] for v in rows], "k": [v[1] for v in rows], "q": [v[2] for v in rows],
        "gmin": [v[3] for v in rows], "gmax": [v[4] for v in rows], "lb": [v[5] for v in rows],
    }
    if want_members:
        data["m"] = [[" ".join(m) for m in v[6]] for v in rows]
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"wrote {out}: {len(rows)} families ({n_proven} proven, {n_exact} exact, "
          f"{len(rows) - n_proven - n_exact} ladder), {os.path.getsize(out):,} bytes; "
          f"checks passed for {len(proven)} proven runs")
    print("coverage:", data["coverage"])


if __name__ == "__main__":
    main()
