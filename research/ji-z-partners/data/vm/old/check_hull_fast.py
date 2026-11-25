"""Check zprod.hull_lattice_fast against cached hulls and the brute-force hull_lattice.
usage: pypy3 check_hull_fast.py ZPROD ZGEN HULLCACHE_DIR [time-only q ...]"""
import importlib.util, json, os, sys, time


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


zp = load(sys.argv[1], "zp")
Z = load(sys.argv[2], "zg")
cache_dir = sys.argv[3]
extra = [int(x) for x in sys.argv[4:]]
bad = 0

# 1. against the cached 11-limit hulls (computed by the brute force)
for q in (45, 63, 99):
    f = os.path.join(cache_dir, f"hd_p3-5-7-11_q{q}.json")
    if not os.path.exists(f):
        print(f"11-limit q {q}: no cache file, skipped")
        continue
    c = json.load(open(f))
    D = Z.gamut([3, 5, 7, 11], q)
    t = time.time()
    H = zp.hull_lattice_fast(D)
    ok = H == {tuple(x) for x in c["HD"]} and sorted(map(tuple, D)) == sorted(map(tuple, c["D"]))
    bad += not ok
    print(f"11-limit q {q}: {len(D)} points, {len(H)} hull points, {time.time() - t:.2f}s, "
          f"{'SAME as cache' if ok else 'DIFFERENT'}")

# 2. against the brute force directly (small sets)
for primes, q in (([3, 5], 81), ([3, 5], 243), ([3, 5], 729), ([3, 5, 7], 45), ([3, 5, 7], 123),
                  ([3, 5, 11], 99), ([3, 7, 11], 77)):
    D = Z.gamut(primes, q)
    t = time.time(); H1 = zp.hull_lattice(D); t1 = time.time() - t
    t = time.time(); H2 = zp.hull_lattice_fast(D); t2 = time.time() - t
    bad += H1 != H2
    print(f"{primes} q {q}: {len(D)} points, brute {t1:.2f}s, fast {t2:.2f}s, "
          f"{'SAME' if H1 == H2 else 'DIFFERENT'}")

# 3. timing only
for q in extra:
    D = Z.gamut([3, 5, 7, 11], q)
    t = time.time()
    H = zp.hull_lattice_fast(D)
    print(f"11-limit q {q}: {len(D)} points, {len(H)} hull points, fast {time.time() - t:.2f}s")
print("ALL SAME" if bad == 0 else f"{bad} DIFFERENT")
