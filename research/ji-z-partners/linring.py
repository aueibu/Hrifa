"""Linear-ring Z-pairs among re-rooted modes (canon: Canon 3 re-rooting, Canon 6 linear ring).

A voicing is a set of octave-reduced ratios that contains 1/1. Its ring size L is the LCD of its
ratios; ratio r sits at slot r*L - L (harmonics L to 2L of a virtual fundamental). Two voicings are a
linear-ring Z-pair when they have the same L and the same multiset of circular slot distances
(difference tones; the canon pair 1 10/9 9/8 89/72 3/2 7/4 ~ 1 9/8 89/72 5/4 3/2 29/18 on 72 matches
this way), and neither is a rotation or reflection of the other on the ring (that would be the same
rhythm).

A scale is a set of pitch classes up to re-rooting; its key is the odd-harmonic form (odd parts of the
harmonics L*r, divided by their gcd; canon Canon 3). A pair is
  * "within": both voicings are re-rootings of the same scale,
  * "cross":  the voicings belong to two different scales.
For every scale pair (or scale) found, `rootings` lists ALL rooting combinations that are linear-ring
Z-pairs, computed from every mode (not limited to the gamut).

usage (pypy3):
  linring.py search --primes 3 5 --odd 123 --k 5 6 7 8 9 10 --workers 2 --out DIR
  linring.py search --L 72 --k 6 --out DIR          # every voicing on one ring (all slots)
writes DIR/pairs_k<k>.jsonl (one line per scale pair / scale) and DIR/summary.csv
"""
import argparse, collections, csv, itertools, json, math, os, sys, time
from fractions import Fraction
from multiprocessing import Pool


def octave_reduce(x):
    while x >= 2:
        x /= 2
    while x < 1:
        x *= 2
    return x


def smooth(n, primes):
    for p in primes:
        while n % p == 0:
            n //= p
    return n == 1


def gamut(primes, odd):
    odds = [n for n in range(1, odd + 1, 2) if smooth(n, primes)]
    G = set()
    for a in odds:
        for b in odds:
            if math.gcd(a, b) == 1:
                G.add(octave_reduce(Fraction(a, b)))
    return sorted(G)


def lcm(a, b):
    return a // math.gcd(a, b) * b


def circ_key(slots, L):
    """sorted multiset of circular distances among all pairs"""
    d = []
    for i in range(len(slots)):
        si = slots[i]
        for j in range(i + 1, len(slots)):
            x = slots[j] - si
            if x < 0:
                x = -x
            d.append(x if x <= L - x else L - x)
    d.sort()
    return tuple(d)


def ring_canon(S, L):
    best = None
    for sg in (1, -1):
        s = [(sg * x) % L for x in S]
        for a in s:
            t = tuple(sorted((x - a) % L for x in s))
            if best is None or t < best:
                best = t
    return best


def voicing_ring(ratios):
    L = 1
    for r in ratios:
        L = lcm(L, r.denominator)
    return L, [r.numerator * (L // r.denominator) - L for r in ratios]


def odd_form(ratios):
    L, _ = voicing_ring(ratios)
    odds = []
    for r in ratios:
        h = r.numerator * (L // r.denominator)
        while h % 2 == 0:
            h //= 2
        odds.append(h)
    g = 0
    for o in odds:
        g = math.gcd(g, o)
    return tuple(sorted(o // g for o in odds))


def modes(ratios):
    """every re-rooting: (root, ratios, L, slots, key, canon)"""
    out = []
    for root in ratios:
        m = sorted({octave_reduce(r / root) for r in ratios})
        L, s = voicing_ring(m)
        out.append((root, m, L, s, circ_key(s, L), ring_canon(s, L)))
    return out


def rooting_table(S, T):
    """all (root in S, root in T, L) whose modes are a linear-ring Z-pair; T None means within S"""
    ms = modes(S)
    mt = ms if T is None else modes(T)
    rows = []
    for i, a in enumerate(ms):
        for j, b in enumerate(mt):
            if T is None and j <= i:
                continue
            if a[2] == b[2] and a[4] == b[4] and a[5] != b[5]:
                rows.append([str(a[0]), str(b[0]), a[2]])
    return rows


def fstr(rs):
    return [str(r) for r in rs]


# ------------------------------------------------------------------ per-L search
_G = None


def _init(G):
    global _G
    _G = G


def _job(args):
    L, ks, all_slots = args
    if all_slots:
        rat = [Fraction(L + p, L) for p in range(L)]
    else:
        rat = [r for r in _G if L % r.denominator == 0]
    slots = [r.numerator * (L // r.denominator) - L for r in rat]   # slots[0] is 0 (ratio 1)
    assert slots[0] == 0
    res = {}
    for k in ks:
        if k > len(slots):
            continue
        # pass 1: hash of the distance multiset -> voicings (bitmask of indices), exact L only
        buckets = {}
        nv = 0
        for comb in itertools.combinations(range(1, len(slots)), k - 1):
            g = L
            for i in comb:
                g = math.gcd(g, slots[i])
                if g == 1:
                    break
            if g != 1:
                continue
            nv += 1
            s = [0] + [slots[i] for i in comb]
            h = hash(circ_key(s, L))
            m = 1
            for i in comb:
                m |= 1 << i
            e = buckets.get(h)
            if e is None:
                buckets[h] = m
            elif isinstance(e, list):
                e.append(m)
            else:
                buckets[h] = [e, m]
        # pass 2: exact regrouping of colliding hashes
        pairs = []
        rot_copies = 0
        for e in buckets.values():
            if not isinstance(e, list):
                continue
            exact = collections.defaultdict(list)
            for m in e:
                idx = [i for i in range(len(slots)) if m >> i & 1]
                s = [slots[i] for i in idx]
                exact[circ_key(s, L)].append((idx, ring_canon(s, L)))
            for grp in exact.values():
                for a in range(len(grp)):
                    for b in range(a + 1, len(grp)):
                        if grp[a][1] == grp[b][1]:
                            rot_copies += 1
                            continue
                        A = [rat[i] for i in grp[a][0]]
                        B = [rat[i] for i in grp[b][0]]
                        pairs.append((A, B))
        res[k] = (nv, rot_copies, pairs)
    return L, res


def search(a):
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    if a.L:
        Ls, G, all_slots = [a.L], None, True
        print(f"ring {a.L}: all {a.L} slots", flush=True)
    else:
        G = gamut(a.primes, a.odd)
        all_slots = False
        Ls = {1}
        for r in G:
            Ls |= {lcm(x, r.denominator) for x in Ls}
        Ls = sorted(x for x in Ls if x > 1)
        sizes = {L: sum(1 for r in G if L % r.denominator == 0) for L in Ls}
        Ls.sort(key=lambda L: -sizes[L])
        print(f"gamut {len(G)} ratios ({a.primes}, odd <= {a.odd}); {len(Ls)} ring sizes; "
              f"largest ring gamut {max(sizes.values())} ratios", flush=True)
    jobs = [(L, a.k, all_slots) for L in Ls]
    per_k = {k: {"voicings": 0, "rot_copies": 0, "pairs": []} for k in a.k}
    with Pool(a.workers, initializer=_init, initargs=(G,)) as pool:
        for n_done, (L, res) in enumerate(pool.imap_unordered(_job, jobs), 1):
            for k, (nv, rc, pairs) in res.items():
                per_k[k]["voicings"] += nv
                per_k[k]["rot_copies"] += rc
                per_k[k]["pairs"].extend(pairs)
            if n_done % 25 == 0 or n_done == len(jobs):
                print(f"  {n_done}/{len(jobs)} rings, {time.time() - t0:.0f}s", flush=True)
    rows = []
    for k in a.k:
        acc = per_k[k]
        groups = {}
        for A, B in acc["pairs"]:
            fa, fb = odd_form(A), odd_form(B)
            kind = "within" if fa == fb else "cross"
            key = (kind,) + tuple(sorted([fa, fb]))
            g = groups.setdefault(key, {"kind": kind, "found": []})
            L, sa = voicing_ring(A)
            _, sb = voicing_ring(B)
            g["found"].append({"L": L, "A": fstr(A), "B": fstr(B), "A_slots": sa, "B_slots": sb})
        with open(os.path.join(a.out, f"pairs_k{k}.jsonl"), "w") as f:
            for key in sorted(groups, key=lambda x: (x[0], x[1:])):
                g = groups[key]
                A = [Fraction(x) for x in g["found"][0]["A"]]
                B = [Fraction(x) for x in g["found"][0]["B"]]
                rt = rooting_table(A, None if g["kind"] == "within" else B)
                assert rt, key
                f.write(json.dumps({"k": k, "kind": g["kind"], "scale_A": list(key[1]), "scale_B": list(key[2]),
                                    "n_found_in_gamut": len(g["found"]), "found": g["found"][:20],
                                    "rootings": rt, "rooting_rings": sorted({r[2] for r in rt})}) + "\n")
        kinds = collections.Counter(g["kind"] for g in groups.values())
        vp = collections.Counter(g["kind"] for g in groups.values() for _ in g["found"])
        rows.append({"k": k, "voicings": acc["voicings"], "voicing_pairs_cross": vp["cross"],
                     "voicing_pairs_within": vp["within"], "scale_pairs_cross": kinds["cross"],
                     "scales_with_within_pairs": kinds["within"], "rotation_copies_skipped": acc["rot_copies"]})
        print("  ", rows[-1], flush=True)
    with open(os.path.join(a.out, "summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"done in {time.time() - t0:.0f}s", flush=True)


# ------------------------------------------------------------------ harmonic-series rings
# Gamut per ring L: every harmonic h in [L, 2L) whose largest prime factor is <= the limit
# (slot p = h - L). Each Z-family (same circular distances) is written to disk per ring; one rhythm
# pair gives many voicing pairs (every rotation that puts an onset on slot 0 is another voicing).

def max_prime(n):
    m, p = 1, 2
    while p * p <= n:
        while n % p == 0:
            m, n = p, n // p
        p += 1
    return max(m, n) if n > 1 else m


def odd_form_h(hs):
    odds = []
    for h in hs:
        while h % 2 == 0:
            h //= 2
        odds.append(h)
    g = 0
    for o in odds:
        g = math.gcd(g, o)
    return tuple(sorted(o // g for o in odds))


def _hjob(args):
    L, ks, plim, out = args
    slots = [p for p in range(L) if max_prime(L + p) <= plim]
    assert slots[0] == 0
    rows = []
    for k in ks:
        t0 = time.time()
        buckets = {}
        nv = 0
        for comb in itertools.combinations(range(1, len(slots)), k - 1):
            g = L
            for i in comb:
                g = math.gcd(g, slots[i])
                if g == 1:
                    break
            if g != 1:
                continue
            nv += 1
            s = [0] + [slots[i] for i in comb]
            h = hash(circ_key(s, L))
            m = 0
            for i in comb:
                m |= 1 << i
            e = buckets.get(h)
            if e is None:
                buckets[h] = m
            elif isinstance(e, list):
                e.append(m)
            else:
                buckets[h] = [e, m]
        n_fam = n_cls_pairs = n_vp = n_within = 0
        within_scales = set()
        with open(os.path.join(out, f"fam_L{L}_k{k}.jsonl"), "w") as f:
            for e in buckets.values():
                if not isinstance(e, list):
                    continue
                exact = collections.defaultdict(list)
                for m in e:
                    s = [0] + [slots[i] for i in range(1, len(slots)) if m >> i & 1]
                    exact[circ_key(s, L)].append(s)
                for grp in exact.values():
                    classes = collections.defaultdict(list)
                    for s in grp:
                        classes[ring_canon(s, L)].append(s)
                    if len(classes) < 2:
                        continue
                    cl = list(classes.values())
                    n_fam += 1
                    n_cls_pairs += len(cl) * (len(cl) - 1) // 2
                    forms = [[odd_form_h([L + p for p in s]) for s in c] for c in cl]
                    w = 0
                    for a in range(len(cl)):
                        for b in range(a + 1, len(cl)):
                            n_vp += len(cl[a]) * len(cl[b])
                            fb = collections.Counter(forms[b])
                            for fa in forms[a]:
                                if fb[fa]:
                                    w += fb[fa]
                                    within_scales.add(fa)
                    n_within += w
                    f.write(json.dumps({"L": L, "k": k, "classes": cl}) + "\n")
        rows.append({"L": L, "k": k, "slots_in_gamut": len(slots), "voicings": nv, "z_families": n_fam,
                     "rhythm_pairs": n_cls_pairs, "voicing_pairs": n_vp, "within_voicing_pairs": n_within,
                     "within_scales": len(within_scales), "seconds": round(time.time() - t0, 1)})
    return rows


def harmonic(a):
    os.makedirs(a.out, exist_ok=True)
    jobs = [(L, a.k, a.prime_limit, a.out) for L in sorted(a.rings, reverse=True)]
    rows = []
    with Pool(a.workers) as pool:
        for r in pool.imap_unordered(_hjob, jobs):
            for row in r:
                print("  ", row, flush=True)
            rows.extend(r)
    rows.sort(key=lambda r: (r["k"], r["L"]))
    with open(os.path.join(a.out, "summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)


# ------------------------------------------------------------------ disk-backed, resumable (large k)
# Phase 1, one job per (ring, first index): voicings go to hash buckets on disk as (hash, code) int64
# pairs; code packs the slot indices 7 bits each. Phase 2, one job per (ring, bucket): group a bucket
# exactly and write its Z-families. Every job writes a .done marker; rerunning skips finished jobs
# (survives a Spot preemption: rerun the same command).

def _encode(comb):
    c = 0
    for i in comb:
        c = (c << 7) | i
    return c


def _decode(c, n):
    out = []
    for _ in range(n):
        out.append(c & 127)
        c >>= 7
    return out[::-1]


def _gamut_slots(L, plim):
    return [p for p in range(L) if max_prime(L + p) <= plim]


def _n_buckets(L, k, plim):
    n = len(_gamut_slots(L, plim))
    return max(1, min(512, math.comb(n - 1, k - 1) // 3_000_000 + 1))


def _family_stats(L, cl):
    forms = [[odd_form_h([L + p for p in s]) for s in c] for c in cl]
    vp = within = 0
    ws = set()
    for a in range(len(cl)):
        for b in range(a + 1, len(cl)):
            vp += len(cl[a]) * len(cl[b])
            fb = collections.Counter(forms[b])
            for fa in forms[a]:
                if fb[fa]:
                    within += fb[fa]
                    ws.add(fa)
    return vp, within, ws


def _p1(args):
    from array import array
    L, k, i, plim, out = args
    d = os.path.join(out, "tmp", f"L{L}_k{k}")
    done = os.path.join(d, f"p1_i{i}.done")
    if os.path.exists(done):
        return L, k, i, None
    slots = _gamut_slots(L, plim)
    nb = _n_buckets(L, k, plim)
    bufs = [array("q") for _ in range(nb)]
    nv = 0
    part = os.path.join(d, f"p1_i{i}")
    if os.path.isdir(part):            # interrupted earlier: its buckets are incomplete, start over
        for name in os.listdir(part):
            os.remove(os.path.join(part, name))
    os.makedirs(part, exist_ok=True)
    def flush():
        for b in range(nb):
            if bufs[b]:
                with open(os.path.join(part, f"b{b}.bin"), "ab") as f:
                    bufs[b].tofile(f)
                bufs[b] = array("q")
    buffered = 0
    si = slots[i]
    for rest in itertools.combinations(range(i + 1, len(slots)), k - 2):
        g = math.gcd(L, si)
        if g != 1:
            for j in rest:
                g = math.gcd(g, slots[j])
                if g == 1:
                    break
            if g != 1:
                continue
        nv += 1
        s = [0, si] + [slots[j] for j in rest]
        h = hash(circ_key(s, L))
        bufs[h % nb].extend((h, _encode((i,) + rest)))
        buffered += 1
        if buffered >= 2_000_000:
            flush(); buffered = 0
    flush()
    with open(done, "w") as f:
        f.write(str(nv))
    return L, k, i, nv


def _p2(args):
    from array import array
    L, k, b, plim, out = args
    d = os.path.join(out, "tmp", f"L{L}_k{k}")
    done = os.path.join(d, f"p2_b{b}.done")
    fam_path = os.path.join(out, "fam", f"fam_L{L}_k{k}_b{b}.jsonl")
    if os.path.exists(done):
        with open(done) as f:
            return json.load(f)
    slots = _gamut_slots(L, plim)
    buckets = {}
    for name in os.listdir(d):
        path = os.path.join(d, name, f"b{b}.bin")
        if not (name.startswith("p1_i") and os.path.isfile(path)):
            continue
        a = array("q")
        with open(path, "rb") as f:
            a.frombytes(f.read())
        for t in range(0, len(a), 2):
            h, c = a[t], a[t + 1]
            e = buckets.get(h)
            if e is None:
                buckets[h] = c
            elif isinstance(e, list):
                e.append(c)
            else:
                buckets[h] = [e, c]
    st = {"L": L, "k": k, "b": b, "z_families": 0, "rhythm_pairs": 0, "voicing_pairs": 0,
          "within_voicing_pairs": 0, "within_scales": []}
    ws = set()
    os.makedirs(os.path.dirname(fam_path), exist_ok=True)
    with open(fam_path + ".part", "w") as f:
        for e in buckets.values():
            if not isinstance(e, list):
                continue
            exact = collections.defaultdict(list)
            for c in e:
                s = [0] + [slots[j] for j in _decode(c, k - 1)]
                exact[circ_key(s, L)].append(s)
            for grp in exact.values():
                classes = collections.defaultdict(list)
                for s in grp:
                    classes[ring_canon(s, L)].append(s)
                if len(classes) < 2:
                    continue
                cl = list(classes.values())
                vp, within, w = _family_stats(L, cl)
                st["z_families"] += 1
                st["rhythm_pairs"] += len(cl) * (len(cl) - 1) // 2
                st["voicing_pairs"] += vp
                st["within_voicing_pairs"] += within
                ws |= w
                f.write(json.dumps({"L": L, "k": k, "classes": cl}) + "\n")
    os.replace(fam_path + ".part", fam_path)
    st["within_scales"] = [list(x) for x in ws]
    with open(done, "w") as f:
        json.dump(st, f)
    return st


def hdisk(a):
    os.makedirs(a.out, exist_ok=True)
    t0 = time.time()
    p1 = []
    for L in sorted(a.rings, reverse=True):
        n = len(_gamut_slots(L, a.prime_limit))
        for k in a.k:
            p1 += [(L, k, i, a.prime_limit, a.out) for i in range(1, n - k + 2)]
    # biggest first (small first index = most combinations)
    p1.sort(key=lambda j: -math.comb(len(_gamut_slots(j[0], a.prime_limit)) - 1 - j[2], j[1] - 2))
    nv = collections.Counter()
    with Pool(a.workers) as pool:
        for c, (L, k, i, v) in enumerate(pool.imap_unordered(_p1, p1), 1):
            if v is None:
                with open(os.path.join(a.out, "tmp", f"L{L}_k{k}", f"p1_i{i}.done")) as f:
                    v = int(f.read())
            nv[(L, k)] += v
            if c % 50 == 0 or c == len(p1):
                print(f"  phase 1: {c}/{len(p1)} jobs, {sum(nv.values()):,} voicings, {time.time() - t0:.0f}s", flush=True)
        p2 = [(L, k, b, a.prime_limit, a.out) for L in sorted(a.rings, reverse=True) for k in a.k
              for b in range(_n_buckets(L, k, a.prime_limit))]
        agg = {}
        for c, st in enumerate(pool.imap_unordered(_p2, p2), 1):
            g = agg.setdefault((st["L"], st["k"]), {"z_families": 0, "rhythm_pairs": 0, "voicing_pairs": 0,
                                                    "within_voicing_pairs": 0, "within_scales": set()})
            for x in ("z_families", "rhythm_pairs", "voicing_pairs", "within_voicing_pairs"):
                g[x] += st[x]
            g["within_scales"] |= {tuple(w) for w in st["within_scales"]}
            if c % 50 == 0 or c == len(p2):
                print(f"  phase 2: {c}/{len(p2)} buckets, {time.time() - t0:.0f}s", flush=True)
    rows = []
    for (L, k), g in sorted(agg.items(), key=lambda kv: (kv[0][1], kv[0][0])):
        rows.append({"L": L, "k": k, "slots_in_gamut": len(_gamut_slots(L, a.prime_limit)), "voicings": nv[(L, k)],
                     "z_families": g["z_families"], "rhythm_pairs": g["rhythm_pairs"],
                     "voicing_pairs": g["voicing_pairs"], "within_voicing_pairs": g["within_voicing_pairs"],
                     "within_scales": len(g["within_scales"])})
        print("  ", rows[-1], flush=True)
    with open(os.path.join(a.out, "summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"done in {time.time() - t0:.0f}s; delete {os.path.join(a.out, 'tmp')} once checked", flush=True)


def fam_files(out):
    for root in (out, os.path.join(out, "fam")):
        if os.path.isdir(root):
            for name in sorted(os.listdir(root)):
                if name.startswith("fam_L") and name.endswith(".jsonl"):
                    yield os.path.join(root, name)


def rootcheck(a):
    """every voicing pair in every family: all rootings (re-rooted modes) that are linear-ring Z-pairs"""
    stats = collections.defaultdict(collections.Counter)
    multi = []
    t0 = time.time()
    for path in fam_files(a.out):
        for fam in load_jsonl(path):
            L, k, cl = fam["L"], fam["k"], fam["classes"]
            cache = {}
            def mds(s):
                t = tuple(s)
                if t not in cache:
                    ms = modes([Fraction(L + p, L) for p in s])
                    idx = collections.defaultdict(list)
                    for m in ms:
                        idx[(m[2], m[4])].append(m)
                    cache[t] = idx
                return cache[t]
            for i in range(len(cl)):
                for j in range(i + 1, len(cl)):
                    for sa in cl[i]:
                        ia = mds(sa)
                        for sb in cl[j]:
                            ib = mds(sb)
                            rt = []
                            for key, ma in ia.items():
                                for mb in ib.get(key, ()):
                                    for x in ma:
                                        if x[5] != mb[5]:
                                            rt.append([str(x[0]), str(mb[0]), key[0]])
                            assert rt, (L, sa, sb)
                            stats[k]["pairs"] += 1
                            stats[k][f"rootings_{len(rt)}"] += 1
                            if len(rt) > 1 and len(multi) < a.max_list:
                                multi.append({"k": k, "L": L, "A": fstr(Fraction(L + p, L) for p in sa),
                                              "B": fstr(Fraction(L + p, L) for p in sb), "rootings": rt})
        print(f"  {os.path.basename(path)} done, {time.time() - t0:.0f}s", flush=True)
    with open(os.path.join(a.out, "rootcheck_multi.jsonl"), "w") as f:
        for r in multi:
            f.write(json.dumps(r) + "\n")
    rows = [{"k": k, **dict(sorted(c.items()))} for k, c in sorted(stats.items())]
    keys = sorted({x for r in rows for x in r}, key=lambda x: (x != "k", x != "pairs", x))
    with open(os.path.join(a.out, "rootcheck.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys, restval=0)
        w.writeheader(); w.writerows(rows)
    for r in rows:
        print("  ", r, flush=True)


def odd_limit(ratios):
    m = 1
    for r in ratios:
        for x in (r.numerator, r.denominator):
            while x % 2 == 0:
                x //= 2
            m = max(m, x)
    return m


def report(a):
    """simplest cross pairs (by odd limit of the pair) and every within-scale pair, with rooting tables"""
    import heapq
    # keep only the simplest a.top pairs per (k, kind) in a bounded heap; count everything
    heaps = collections.defaultdict(list)
    counts = collections.Counter()
    for path in fam_files(a.out):
        for fam in load_jsonl(path):
            L, k, cl = fam["L"], fam["k"], fam["classes"]
            ols = [[(odd_limit([Fraction(L + p, L) for p in s]), odd_form_h([L + p for p in s])) for s in c] for c in cl]
            for i in range(len(cl)):
                for j in range(i + 1, len(cl)):
                    for sa, (oa, fa) in zip(cl[i], ols[i]):
                        for sb, (ob, fb) in zip(cl[j], ols[j]):
                            kind = "within" if fa == fb else "cross"
                            counts[(k, kind)] += 1
                            item = (-max(oa, ob), -L, [-x for x in sa], [-x for x in sb])
                            hp = heaps[(k, kind)]
                            cap = a.max_within if kind == "within" else a.top
                            if len(hp) < cap:
                                heapq.heappush(hp, item)
                            elif item > hp[0]:
                                heapq.heapreplace(hp, item)
    rows = []
    with open(os.path.join(a.out, "report.jsonl"), "w") as f:
        for k in sorted({k for k, _ in counts} | {k for k, _ in heaps}):
            for kind in ("within", "cross"):
                keep = sorted((-o, -L, [-x for x in sa], [-x for x in sb]) for o, L, sa, sb in heaps[(k, kind)])
                for ol, L, sa, sb in keep:
                    A = [Fraction(L + p, L) for p in sa]
                    B = [Fraction(L + p, L) for p in sb]
                    rt = rooting_table(A, None if kind == "within" else B)
                    f.write(json.dumps({"k": k, "kind": kind, "L": L, "odd_limit": ol, "A": fstr(A), "B": fstr(B),
                                        "A_slots": sa, "B_slots": sb, "rootings": rt}) + "\n")
                rows.append({"k": k, "kind": kind, "voicing_pairs": counts[(k, kind)], "listed": len(keep),
                             "simplest_odd_limit": keep[0][0] if keep else ""})
                print("  ", rows[-1], flush=True)
    with open(os.path.join(a.out, "report_summary.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)


def load_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="mode", required=True)
    p = sp.add_parser("search")
    p.add_argument("--primes", type=int, nargs="+", default=[3, 5])
    p.add_argument("--odd", type=int, default=123)
    p.add_argument("--L", type=int, help="search one ring, every slot (ignores --primes/--odd)")
    p.add_argument("--k", type=int, nargs="+", required=True)
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--out", required=True)
    p = sp.add_parser("harmonic", help="harmonic-series rings: every harmonic L..2L up to a prime limit")
    p.add_argument("--rings", type=int, nargs="+", required=True)
    p.add_argument("--prime-limit", type=int, default=89)
    p.add_argument("--k", type=int, nargs="+", required=True)
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--out", required=True)
    p = sp.add_parser("hdisk", help="as harmonic, disk-backed and resumable (rerun the same command)")
    p.add_argument("--rings", type=int, nargs="+", required=True)
    p.add_argument("--prime-limit", type=int, default=89)
    p.add_argument("--k", type=int, nargs="+", required=True)
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--out", required=True)
    p = sp.add_parser("rootcheck", help="all rootings of every voicing pair in DIR's families")
    p.add_argument("--out", required=True)
    p.add_argument("--max-list", type=int, default=100000)
    p = sp.add_parser("report", help="after harmonic: simplest pairs with rooting tables")
    p.add_argument("--out", required=True)
    p.add_argument("--top", type=int, default=200, help="cross pairs listed per k")
    p.add_argument("--max-within", type=int, default=5000, help="list every within pair if at most this many")
    p = sp.add_parser("pair", help="check two voicings: linear-ring Z-pair? and their rooting table")
    p.add_argument("--A", required=True, help='ratios, e.g. "1 10/9 9/8 89/72 3/2 7/4"')
    p.add_argument("--B", required=True)
    a = ap.parse_args()
    if a.mode == "pair":
        A = sorted(Fraction(x) for x in a.A.split())
        B = sorted(Fraction(x) for x in a.B.split())
        (La, sa), (Lb, sb) = voicing_ring(A), voicing_ring(B)
        print("A ring", La, "slots", sa, "odd form", odd_form(A))
        print("B ring", Lb, "slots", sb, "odd form", odd_form(B))
        print("same distances:", La == Lb and circ_key(sa, La) == circ_key(sb, Lb),
              " rotation/reflection copies:", La == Lb and ring_canon(sa, La) == ring_canon(sb, Lb))
        same = odd_form(A) == odd_form(B)
        print("kind:", "within" if same else "cross")
        print("modes A:", [(str(m[0]), m[2]) for m in modes(A)])
        print("modes B:", [(str(m[0]), m[2]) for m in modes(B)])
        print("rootings:", rooting_table(A, None if same else B))
        return
    {"search": search, "harmonic": harmonic, "hdisk": hdisk, "rootcheck": rootcheck, "report": report}[a.mode](a)


if __name__ == "__main__":
    main()
