"""Check the claim behind zprod --fast: the lattice points of the hull of the allowed intervals D
(odd limit <= q) are exactly D, for any primes and q (D = lattice points of a convex set).
usage: pypy3 check_hull_eq.py ZPROD ZGEN HULLCACHE_DIR"""
import importlib.util, json, os, sys, time


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


zp = load(sys.argv[1], "zp")
Z = load(sys.argv[2], "zg")
cache_dir = sys.argv[3]
bad = 0


def report(name, D, H, t):
    global bad
    Ds = {tuple(p) for p in D}
    ok = H == Ds
    bad += not ok
    print(f"{name}: {len(Ds)} allowed, hull {len(H)}, {time.time() - t:.2f}s, {'EQUAL' if ok else 'DIFFERENT'}")


for q in (45, 63, 99, 135):  # exact 11-limit hulls cached by earlier runs
    f = os.path.join(cache_dir, f"hd_p3-5-7-11_q{q}.json")
    if os.path.exists(f):
        t = time.time()
        report(f"11-limit q {q} (cache)", Z.gamut([3, 5, 7, 11], q), {tuple(x) for x in json.load(open(f))["HD"]}, t)

for primes, q in (([3, 5], 15), ([3, 5], 81), ([3, 5], 243), ([3, 5], 729), ([3, 5], 2025), ([3, 7], 343),
                  ([3, 5, 7], 45), ([3, 5, 7], 123), ([3, 5, 7], 243), ([3, 5, 11], 99), ([3, 7, 11], 77),
                  ([5, 7, 11], 385), ([3, 5, 7, 11], 33), ([3, 5, 7, 11], 55)):
    D = Z.gamut(primes, q)
    t = time.time()
    report(f"{primes} q {q} (brute force)", D, zp.hull_lattice(D), t)

for primes, q in (([3, 5, 7, 11, 13], 39),):
    D = Z.gamut(primes, q)
    t = time.time()
    report(f"{primes} q {q} (vertex method, 5-D)", D, zp.hull_lattice_fast(D), t)
print("ALL EQUAL" if bad == 0 else f"{bad} DIFFERENT")
