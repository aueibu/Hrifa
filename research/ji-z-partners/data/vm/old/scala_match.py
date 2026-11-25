"""Match Z-family members against the Scala scale archive (scales.zip) and the Scala list of named modes
(modename.html), both from the Huygens-Fokker Foundation (Manuel Op de Coul).
usage: python3 -I scala_match.py SCALES_ZIP MODENAME_HTML [--tol CENTS] [--subset-q Q] families.jsonl ...

Checks, per member of every family (families from several runs are merged):
  exact    the member's ratios equal an octave-period archive scale with exact ratios, up to transposition
           (any mode of it); "inverted" = equal to the scale's inversion
  near     same note count and every note within --tol cents (default 3) of an archive scale, up to rotation
           (catches tempered versions and cents-defined scales)
  subset   (families with q <= --subset-q, default 135) the member lies inside a larger exact archive scale,
           up to transposition
  modes    rounded to N-EDO for every "N tone equal modes" section of the mode list: an exact named mode
           (the member's 1/1 as tonic) or a rotation of one
The archive files are read as data only (no file in them is executed)."""
import collections, html, json, math, re, sys, zipfile
from fractions import Fraction

args = sys.argv[1:]
TOL, SUBQ = 3.0, 135
if "--tol" in args:
    i = args.index("--tol"); TOL = float(args[i + 1]); del args[i:i + 2]
if "--subset-q" in args:
    i = args.index("--subset-q"); SUBQ = int(args[i + 1]); del args[i:i + 2]
ZIP, MODES, FAMFILES = args[0], args[1], args[2:]


def red(f):
    while f >= 2:
        f /= 2
    while f < 1:
        f *= 2
    return f


def cents(f):
    return 1200 * math.log2(f)


# ------------------------------------------------------------------ Scala archive
def parse_scl(text):
    lines = [l.strip() for l in text.splitlines() if not l.strip().startswith("!")]
    if len(lines) < 2:
        return None
    desc = lines[0]
    try:
        n = int(lines[1].split()[0])
    except (ValueError, IndexError):
        return None
    vals = []
    for l in lines[2:2 + n]:
        tok = l.split()[0] if l.split() else ""
        try:
            if "." in tok:
                vals.append(float(tok))
            elif "/" in tok:
                a, b = tok.split("/")
                vals.append(Fraction(int(a), int(b)))
            else:
                vals.append(Fraction(int(tok)))
        except (ValueError, ZeroDivisionError):
            return None
    if len(vals) != n or n < 2:
        return None
    period = vals[-1]
    pc = cents(period) if isinstance(period, Fraction) else period
    if abs(pc - 1200) > 1e-6:
        return None  # octave-period scales only
    notes = vals[:-1]
    exact = all(isinstance(v, Fraction) and v > 0 for v in notes)
    if exact:
        fr = sorted({red(v) for v in notes} | {Fraction(1)})
        if len(fr) != n:
            return None
        return desc, fr, [cents(f) for f in fr]
    cs = sorted({0.0} | {(cents(v) if isinstance(v, Fraction) else v) % 1200 for v in notes})
    return desc, None, cs


def tkey(fr):
    """transposition class of a set of octave-reduced fractions"""
    best = None
    for r in fr:
        k = tuple(sorted(red(f / r) for f in fr))
        if best is None or k < best:
            best = k
    return best


def steps(cs):
    cs = sorted(cs)
    return [b - a for a, b in zip(cs, cs[1:])] + [1200 - cs[-1] + cs[0]]


scales = []  # (name, desc, fractions or None, cents)
with zipfile.ZipFile(ZIP) as z:
    for name in z.namelist():
        if not name.lower().endswith(".scl"):
            continue
        try:
            text = z.read(name).decode("latin-1")
        except Exception:
            continue
        p = parse_scl(text)
        if p:
            scales.append((name.split("/")[-1][:-4], p[0], p[1], p[2]))
EXACT_T = collections.defaultdict(list)
for nm, desc, fr, cs in scales:
    if fr:
        EXACT_T[tkey(fr)].append(nm)
BY_SIZE = collections.defaultdict(list)
for nm, desc, fr, cs in scales:
    st = steps(cs)
    BY_SIZE[len(cs)].append((nm, st, sorted(st)))
DESC = {nm: desc for nm, desc, fr, cs in scales}
INTSETS = []  # for subset: exact scales with their interval sets
for nm, desc, fr, cs in scales:
    if fr and len(fr) <= 31:
        INTSETS.append((nm, set(fr), {red(a / b) for a in fr for b in fr}, len(fr)))
print(f"archive: {len(scales)} octave scales parsed ({sum(1 for s in scales if s[2])} with exact ratios)")

# ------------------------------------------------------------------ named modes
raw = open(MODES, encoding="utf-8", errors="replace").read()
MODE = collections.defaultdict(dict)   # N -> step tuple -> names
ROTM = collections.defaultdict(dict)   # N -> rotation class key -> names
cur = None
for m in re.finditer(r'<H4>([^<]*)</H4>|<TT><B>([\d\s\[\]]+)</TD>\s*<TD>(.*?)</TD>', raw, re.S):
    if m.group(1) is not None:
        # "12 tone modes:", "31 tone equal modes:", "Persian modes as 53 tone equal modes:" are equal steps
        # (the page: semitones for 12, quarter tones for 24); skip unequal parents (shruti, matra, 3/1 period)
        h = m.group(1)
        hm = re.search(r"(\d+) tone (equal )?modes?\b", h)
        cur = int(hm.group(1)) if hm and not re.search(r"shruti|matra|out of", h, re.I) else None
        continue
    if cur is None:
        continue
    pat = m.group(2)
    nm = html.unescape(re.sub(r"<[^>]+>", "", m.group(3))).strip()
    bracket = "[" in pat
    st = tuple(int(x) for x in re.sub(r"\[.*?\]", "", pat).split())
    if sum(st) != cur:
        continue
    label = nm + (" (other tonic)" if bracket else "")
    if not bracket:
        MODE[cur].setdefault(st, label)
    rk = min(tuple(st[i:] + st[:i]) for i in range(len(st)))
    ROTM[cur].setdefault(rk, nm)
print("named modes: " + ", ".join(f"{n}-EDO {len(ROTM[n])}" for n in sorted(ROTM)))


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def iol(fs):
    m = 1
    for i, a in enumerate(fs):
        for b in fs[i + 1:]:
            x = b / a if b > a else a / b
            m = max(m, odd(x.numerator), odd(x.denominator))
    return m


# ------------------------------------------------------------------ families
fams = {}
for path in FAMFILES:
    for line in open(path):
        f = json.loads(line)
        ms = tuple(sorted(" ".join(m["ratios"]) for m in f["members"]))
        if ms in fams:
            continue
        top = max((f["primes"][i] for m in f["members"] for v in m["lattice"] for i, e in enumerate(v) if e), default=2)
        mem = [[Fraction(r) for r in m["ratios"]] for m in f["members"]]
        fams[ms] = (f["notes"], max(iol(x) for x in mem), top, mem)
print(f"families: {len(fams)}")


def near(fr):
    cs = [cents(f) for f in fr]
    st = steps(cs)
    ss = sorted(st)
    out = []
    for nm, st2, ss2 in BY_SIZE[len(cs)]:
        if max(abs(a - b) for a, b in zip(ss, ss2)) > 2 * TOL:
            continue
        n = len(st)
        for r in range(n):  # rotate member steps; compare cumulative positions within TOL
            acc = 0.0
            ok = True
            for i in range(n):
                acc += st[(r + i) % n] - st2[i]
                if abs(acc) > TOL:
                    ok = False
                    break
            if ok:
                out.append(nm)
                break
    return out


def subset(fr):
    ints = {red(a / b) for a in fr for b in fr}
    out = []
    for nm, fset, iset, n in INTSETS:
        if n <= len(fr) or not ints <= iset:
            continue
        r0 = fr[0]
        if any(all(red(f / r0 * s) in fset for f in fr) for s in fset):
            out.append((n, nm))
    return sorted(out)[:3]


def modes(fr):
    out = []
    for N in sorted(ROTM):
        pcs = [round(cents(f) * N / 1200) % N for f in fr]
        if len(set(pcs)) < len(pcs):
            continue
        p = sorted(pcs)
        st = tuple(b - a for a, b in zip(p, p[1:])) + (N - p[-1] + p[0],)
        if st in MODE[N]:
            out.append((N, "exact", MODE[N][st]))
            continue
        rk = min(tuple(st[i:] + st[:i]) for i in range(len(st)))
        if rk in ROTM[N]:
            out.append((N, "rotation", ROTM[N][rk]))
    return out


report = collections.defaultdict(list)
for ms, (k, q, top, mem) in sorted(fams.items(), key=lambda x: (x[1][0], x[1][1])):
    res = []
    for fr in mem:
        r = {"exact": EXACT_T.get(tkey(fr), []), "inverted": EXACT_T.get(tkey([red(1 / f) for f in fr]), []),
             "near": near(fr), "subset": subset(fr) if q <= SUBQ else [], "modes": modes(fr)}
        res.append(r)
    report[k].append((q, top, ms, res))

for k in sorted(report):
    rows = report[k]
    cnt = collections.Counter()
    for q, top, ms, res in rows:
        for r in res:
            for key in ("exact", "inverted", "near", "subset"):
                if r[key]:
                    cnt[key] += 1
            if any(N == 12 for N, _, _ in r["modes"]):
                cnt["12-EDO named mode"] += 1
            if any(N != 12 for N, _, _ in r["modes"]):
                cnt["other-EDO named mode"] += 1
    print(f"\n== {k} notes: {len(rows)} families; members with: " + ", ".join(f"{a} {b}" for a, b in sorted(cnt.items())))
    shown = 0
    for q, top, ms, res in rows:
        hits = []
        for mtxt, r in zip(ms, res):
            parts = []
            if r["exact"]:
                parts.append("EXACT " + ", ".join(f"{n} ({DESC[n][:60]})" for n in r["exact"][:3]))
            if r["inverted"]:
                parts.append("INVERTED " + ", ".join(f"{n} ({DESC[n][:60]})" for n in r["inverted"][:2]))
            if r["near"] and not r["exact"]:
                parts.append(f"NEAR(<={TOL:g}c) " + ", ".join(f"{n} ({DESC[n][:50]})" for n in r["near"][:3]))
            if r["subset"]:
                parts.append("IN " + ", ".join(f"{nm} [{n} notes] ({DESC[nm][:40]})" for n, nm in r["subset"]))
            named = [f"{N}-EDO {kind}: {nm[:60]}" for N, kind, nm in r["modes"] if N in (12, 24, 17, 19, 22, 31, 53)]
            if named:
                parts.append("MODE " + " | ".join(named[:3]))
            if parts:
                hits.append(f"{mtxt}\n         " + "\n         ".join(parts))
        if hits and shown < 8:
            print(f"   q={q} ({top}-limit):\n      " + "\n      ".join(hits))
            shown += 1
