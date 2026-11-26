"""JI Z-pair types carried into rings (N-EDOs) by group homomorphisms.

A type (from `zgen.py types`) is a pair P, Q of point sets in Z^r with the same difference
multiset. Any homomorphism Z^r -> Z_n (choose an image b_i in Z_n for each basis vector) keeps
difference multisets equal, so the images P', Q' are either
  * a collision: two notes land on the same step (P and Q collide together, same differences),
  * tempered out: P' and Q' are rotations/reflections of each other,
  * a ring Z-pair: same interval vector on the ring, not dihedrally equivalent.
Every JI family read in an EDO through any val is one of these images (val o placement is such a
homomorphism), so `types` gives every ring Z-pair that has a JI shape, for any gamut and any val.
It is a lower bound on "JI-shaped" only as far as the type files are complete (the doubled-note
and both-signed mechanisms are not in the type files yet; 9-note chord-on-roots pairs are not types).

Modes (run under pypy3; pure Python, no imports beyond the standard library):
  types   --types F [F ...] --rings 12 16 ... --out DIR
          ring Z-pairs reached by each type; DIR/types_n<n>_k<k>.jsonl, DIR/types_summary.csv
  totals  --k 4 5 6 ... --rings 12 16 ... --out DIR [--max-subsets 3e7]
          every ring Z-pair by brute force (sets containing 0); DIR/totals_n<n>_k<k>.jsonl, DIR/totals.csv
  compare --out DIR
          joins the two: share of each ring's Z-pairs that are JI-shaped; DIR/coverage.csv
  vals    --families F --rings 12 19 ... --out DIR
          each placed family read through the patent val of each EDO; DIR/vals_<tag>.csv
"""
import argparse, collections, csv, itertools, json, math, os, sys, time


def ring_iv(A, n):
    c = [0] * (n // 2 + 1)
    for i in range(len(A)):
        ai = A[i]
        for j in range(i + 1, len(A)):
            d = (A[j] - ai) % n
            c[d if d <= n - d else n - d] += 1
    return tuple(c[1:])


def ring_canon(S, n):
    """dihedral canonical form: lexicographically least sorted tuple over rotations and reflections"""
    best = None
    for sg in (1, -1):
        s = [(sg * x) % n for x in S]
        for a in s:
            t = tuple(sorted((x - a) % n for x in s))
            if best is None or t < best:
                best = t
    return best


def pair_key(a, b):
    return (a, b) if a < b else (b, a)


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


# ---------------------------------------------------------------- types
def map_points(coords, b, n):
    return [sum(c * x for c, x in zip(cs, b)) % n for cs in coords]


def types_mode(a):
    types = []
    for path in a.types:
        for t in load_jsonl(path):
            t["_src"] = os.path.basename(os.path.dirname(os.path.abspath(path))) or path
            types.append(t)
    ks = sorted({t["k"] for t in types})
    ranks = collections.Counter((t["k"], t["rank"]) for t in types)
    print(f"{len(types)} types; (k, rank) counts: {dict(sorted(ranks.items()))}", flush=True)
    os.makedirs(a.out, exist_ok=True)
    rows = []
    for n in a.rings:
        maps_total = sum(n ** t["rank"] for t in types)
        if maps_total > a.max_maps:
            print(f"n={n}: {maps_total:.2e} maps > --max-maps {a.max_maps:.0e}, skipped", flush=True)
            continue
        t0 = time.time()
        per_k = {k: {"pairs": {}, "collision": 0, "tempered": 0, "zmaps": 0, "types_hit": set(), "maps": 0} for k in ks}
        for t in types:
            k, r, P, Q = t["k"], t["rank"], t["P"], t["Q"]
            acc = per_k[k]
            tid = f'{t["_src"]}:{t["type"]}'
            for b in itertools.product(range(n), repeat=r):
                # b and -b give mirror images (same dihedral pair): keep the one that is not larger
                nb = tuple((-x) % n for x in b)
                if nb < b:
                    continue
                acc["maps"] += 1
                p = map_points(P, b, n)
                if len(set(p)) < k:
                    acc["collision"] += 1
                    continue
                q = map_points(Q, b, n)
                assert len(set(q)) == k, (tid, b)   # same difference multiset, so no collision in Q either
                cp, cq = ring_canon(p, n), ring_canon(q, n)
                if cp == cq:
                    acc["tempered"] += 1
                    continue
                assert ring_iv(cp, n) == ring_iv(cq, n), (tid, b)
                acc["zmaps"] += 1
                acc["types_hit"].add(tid)
                key = pair_key(cp, cq)
                e = acc["pairs"].get(key)
                if e is None:
                    acc["pairs"][key] = {"types": {tid}, "example": {"type": tid, "basis": list(b)}}
                else:
                    e["types"].add(tid)
        for k in ks:
            acc = per_k[k]
            with open(os.path.join(a.out, f"types_n{n}_k{k}.jsonl"), "w") as f:
                for (cp, cq), e in sorted(acc["pairs"].items()):
                    f.write(json.dumps({"n": n, "k": k, "A": cp, "B": cq, "iv": ring_iv(cp, n),
                                        "n_types": len(e["types"]), "types": sorted(e["types"]),
                                        "example": e["example"]}) + "\n")
            row = {"n": n, "k": k, "types": sum(1 for t in types if t["k"] == k), "types_hit": len(acc["types_hit"]),
                   "maps": acc["maps"], "collision": acc["collision"], "tempered_out": acc["tempered"],
                   "zpair_maps": acc["zmaps"], "distinct_ring_pairs": len(acc["pairs"])}
            rows.append(row)
            print("  ", row, flush=True)
        print(f"n={n} done in {time.time() - t0:.1f}s", flush=True)
    with open(os.path.join(a.out, "types_summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["n"])
        w.writeheader(); w.writerows(rows)


# ---------------------------------------------------------------- totals
def totals_mode(a):
    os.makedirs(a.out, exist_ok=True)
    rows = []
    for n in a.rings:
        for k in a.k:
            if not (1 <= k <= n):
                continue
            cnt = math.comb(n - 1, k - 1)
            if cnt > a.max_subsets:
                print(f"n={n} k={k}: {cnt:.2e} subsets > --max-subsets, skipped", flush=True)
                continue
            t0 = time.time()
            groups = collections.defaultdict(list)
            for rest in itertools.combinations(range(1, n), k - 1):
                s = (0,) + rest
                if ring_canon(s, n) != s:
                    continue          # count each dihedral class once, at its canonical form
                groups[ring_iv(s, n)].append(s)
            classes = sum(len(v) for v in groups.values())
            fams = {iv: v for iv, v in groups.items() if len(v) > 1}
            pairs = sum(len(v) * (len(v) - 1) // 2 for v in fams.values())
            with open(os.path.join(a.out, f"totals_n{n}_k{k}.jsonl"), "w") as f:
                for iv, v in sorted(fams.items(), key=lambda kv: kv[1]):
                    f.write(json.dumps({"n": n, "k": k, "iv": iv, "members": v}) + "\n")
            row = {"n": n, "k": k, "set_classes": classes, "z_families": len(fams), "z_pairs": pairs,
                   "largest_family": max((len(v) for v in fams.values()), default=0),
                   "seconds": round(time.time() - t0, 1)}
            rows.append(row)
            print("  ", row, flush=True)
    with open(os.path.join(a.out, "totals.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["n"])
        w.writeheader(); w.writerows(rows)


# ---------------------------------------------------------------- compare
def compare_mode(a):
    rows = []
    for name in sorted(os.listdir(a.out)):
        if not (name.startswith("totals_n") and name.endswith(".jsonl")):
            continue
        n, k = (int(x) for x in name[len("totals_n"):-len(".jsonl")].split("_k"))
        tpath = os.path.join(a.out, f"types_n{n}_k{k}.jsonl")
        if not os.path.exists(tpath):
            continue
        all_pairs = set()
        fam_of = {}
        for fam in load_jsonl(os.path.join(a.out, name)):
            m = [tuple(x) for x in fam["members"]]
            for x in m:
                fam_of[x] = tuple(fam["iv"])
            for i in range(len(m)):
                for j in range(i + 1, len(m)):
                    all_pairs.add(pair_key(m[i], m[j]))
        ji = {pair_key(tuple(r["A"]), tuple(r["B"])) for r in load_jsonl(tpath)}
        stray = ji - all_pairs
        assert not stray, f"n={n} k={k}: {len(stray)} type images missing from brute force, e.g. {next(iter(stray))}"
        fams_all = {fam_of[p[0]] for p in all_pairs}
        fams_ji = {fam_of[p[0]] for p in ji}
        rows.append({"n": n, "k": k, "ring_z_pairs": len(all_pairs), "ji_shaped_pairs": len(ji),
                     "pair_share": f"{len(ji) / len(all_pairs):.3f}" if all_pairs else "",
                     "ring_z_families": len(fams_all), "families_with_a_ji_pair": len(fams_ji)})
        print("  ", rows[-1], flush=True)
    rows.sort(key=lambda r: (r["k"], r["n"]))
    with open(os.path.join(a.out, "coverage.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["n"])
        w.writeheader(); w.writerows(rows)


# ---------------------------------------------------------------- vals
def patent_val(n, primes):
    return [round(n * math.log2(p)) for p in primes]


def vals_mode(a):
    fams = load_jsonl(a.families)
    os.makedirs(a.out, exist_ok=True)
    tag = a.tag or os.path.basename(os.path.dirname(os.path.abspath(a.families)))
    primes = fams[0]["primes"]            # lattice coordinates are exponents of these primes, in order
    assert all(f["primes"] == primes for f in fams)
    out_rows, summary = [], []
    for n in a.rings:
        v = patent_val(n, primes)
        c = collections.Counter()
        for fam in fams:
            mem = [m["lattice"] for m in fam["members"]]
            imgs = [[sum(e * s for e, s in zip(pt, v)) % n for pt in m] for m in mem]
            k = fam["notes"]
            if any(len(set(x)) < k for x in imgs):
                verdict = "collision"
            else:
                canons = {ring_canon(x, n) for x in imgs}
                verdict = "tempered_out" if len(canons) == 1 else ("z_pair" if len(canons) == len(imgs) else "partly_tempered")
                if verdict != "tempered_out":
                    assert len({ring_iv(x, n) for x in imgs}) == 1
            c[verdict] += 1
            out_rows.append({"family": fam["family"], "k": k, "type": fam.get("type"), "n": n,
                             "val": " ".join(map(str, v)), "verdict": verdict,
                             "ring_sets": " / ".join(" ".join(map(str, ring_canon(x, n))) for x in imgs)
                             if verdict != "collision" else ""})
        summary.append({"n": n, "val": " ".join(map(str, v)), **{x: c[x] for x in
                        ("z_pair", "tempered_out", "partly_tempered", "collision")}})
        print("  ", summary[-1], flush=True)
    with open(os.path.join(a.out, f"vals_{tag}.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0].keys())); w.writeheader(); w.writerows(out_rows)
    with open(os.path.join(a.out, f"vals_{tag}_summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(summary[0].keys())); w.writeheader(); w.writerows(summary)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="mode", required=True)
    p = sp.add_parser("types"); p.add_argument("--types", nargs="+", required=True)
    p.add_argument("--max-maps", type=float, default=5e8)
    p = sp.add_parser("totals"); p.add_argument("--k", type=int, nargs="+", required=True)
    p.add_argument("--max-subsets", type=float, default=3e7)
    p = sp.add_parser("compare")
    p = sp.add_parser("vals"); p.add_argument("--families", required=True)
    p.add_argument("--tag")
    for name, q in sp.choices.items():
        q.add_argument("--out", required=True)
        if name != "compare":
            q.add_argument("--rings", type=int, nargs="+", required=True)
    a = ap.parse_args()
    {"types": types_mode, "totals": totals_mode, "compare": compare_mode, "vals": vals_mode}[a.mode](a)


if __name__ == "__main__":
    main()
