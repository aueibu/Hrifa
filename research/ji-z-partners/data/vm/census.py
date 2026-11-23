"""Shape census: the smallest flipped factor V of every family in a complete (enumerated) list.
usage: python3 census.py SMALLFACTOR_PY LABEL:ENUM_DIR [LABEL:ENUM_DIR ...] > census.txt
For each ENUM_DIR/k*/families.jsonl: smallfactor.py --terms 3 (3-term V; also says whether U needs -1
coefficients), then --terms 4 and --terms 5 on the families still without a factor. Then tables per list and
note count: smallest factor found, and the smallest V size by band of intervallic odd limit q (does it grow
with q?). The enumeration logs (ENUM_DIR.out) give the number of qualifying sets, for the fraction with a partner.
Runs smallfactor.py under pypy3 when available."""
import collections, glob, os, re, shutil, subprocess, sys

SF = sys.argv[1]
PY = shutil.which("pypy3") or sys.executable
BANDS = [45, 75, 99, 135, 243, 405, 729, 1215, 10 ** 9]


def band(q):
    for b in BANDS:
        if q <= b:
            return b
    return BANDS[-1]


def run(args):
    r = subprocess.run([PY, SF] + args, capture_output=True, text=True)
    return r.stdout.splitlines()


rows = []  # (label, k, q, smallest, detail)
setcounts = {}
for spec in sys.argv[2:]:
    label, d = spec.split(":", 1)
    log = d.rstrip("/") + ".out"
    if os.path.exists(log):
        for line in open(log):
            m = re.search(r"k=(\d+): (\d+) sets", line)
            if m:
                setcounts[(label, int(m.group(1)))] = int(m.group(2))
    for f in sorted(glob.glob(os.path.join(d, "k*", "families.jsonl")), key=lambda p: int(re.search(r"k(\d+)", p).group(1))):
        if os.path.getsize(f) == 0:
            continue
        found = {}
        for line in run([f]):
            parts = line.split("\t")
            if len(parts) < 5:
                continue
            fam, k, q, kinds = parts[0], int(parts[1][2:]), int(parts[2][2:]), parts[4]
            if kinds == "NONE":
                found[fam] = (k, q, None, None)
            else:
                # prefer a plus-only chord (3,0), then 2,1; record U's smallest negative mass for it
                best = None
                for kind, negs in re.findall(r"(\S+)\(U neg (\d+)", kinds):
                    key = {"chord+": "3,0", "2,1": "2,1"}.get(kind, "3-term other")
                    cand = (key, int(negs))
                    if best is None or (cand[0] != "3,0", cand[1]) < (best[0] != "3,0", best[1]):
                        best = cand
                found[fam] = (k, q, best[0], f"U neg {best[1]}")
        for m in (4, 5):
            left = [fam for fam, v in found.items() if v[2] is None]
            if not left:
                break
            idf = f + f".left{m}"
            with open(idf, "w") as fh:
                fh.write("\n".join(left) + "\n")
            for line in run([f, "--terms", str(m), "--ids", idf]):
                parts = line.split("\t")
                if len(parts) < 6 or parts[5] == "NONE":
                    continue
                mm = re.match(r"V (\d+),(\d+) .*neg mass (\d+)", parts[5])
                if mm:
                    k, q = found[parts[0]][0], found[parts[0]][1]
                    found[parts[0]] = (k, q, f"{mm.group(1)},{mm.group(2)}", f"U neg {mm.group(3)}")
            os.remove(idf)
        for fam, (k, q, shape, detail) in found.items():
            rows.append((label, k, q, shape or "none up to 5 terms", detail or ""))

labels = list(dict.fromkeys(r[0] for r in rows))
print("Smallest flipped factor per family (3-term search first, then 4 and 5 terms on the rest)")
for label in labels:
    print(f"\n== {label}")
    by_k = collections.defaultdict(collections.Counter)
    neg = collections.defaultdict(collections.Counter)
    for lab, k, q, shape, detail in rows:
        if lab == label:
            by_k[k][shape] += 1
            if shape == "3,0":
                neg[k][detail] += 1
    for k in sorted(by_k):
        tot = sum(by_k[k].values())
        sc = setcounts.get((label, k))
        # each 2-member family is 4 of the counted sets (both members, each with its inversion)
        frac = f" among {sc:,} sets ({4 * tot / sc:.2e} of sets are in a Z-pair)" if sc else ""
        print(f"  k={k}: {tot} families{frac}: " + ", ".join(f"{s} {c}" for s, c in by_k[k].most_common())
              + (f"  [3,0: {', '.join(f'{d} x{c}' for d, c in sorted(neg[k].items()))}]" if neg[k] else ""))
    print("  smallest V size (terms) by q band (families):")
    tb = collections.defaultdict(collections.Counter)
    for lab, k, q, shape, detail in rows:
        if lab == label:
            terms = sum(int(x) for x in shape.split(",")) if "," in shape else (99 if shape.startswith("none") else 3)
            tb[band(q)][terms] += 1
    for b in sorted(tb):
        print(f"    q <= {b if b < 10 ** 9 else 'any'}: " + ", ".join(f"{t if t < 99 else '>5'} terms {c}" for t, c in sorted(tb[b].items())))
