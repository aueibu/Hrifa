"""f68_summary.py: factor structure of the 2-D 9-note shapes #37, #68, #69, #70, one block per shape.
Joins f68/fams.jsonl (shape_fams.py) with f68/factor.tsv (factor_struct.py) line by line (checked by family and q)."""
import collections, json, os

d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "f68")
fams = [json.loads(l) for l in open(os.path.join(d, "fams.jsonl"))]
rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(d, "factor.tsv")) if not l.startswith(("family", "#"))]
assert len(rows) == len(fams), (len(rows), len(fams))
by = collections.defaultdict(list)
for f, r in zip(fams, rows):
    assert int(r[0]) == f["family"], (r[0], f["family"])
    by[tuple(f["shape_idx"])].append((int(r[2]), r, f))
for idx in sorted(by):
    L = sorted(by[idx], key=lambda x: x[0])
    print(f"=== #{','.join(map(str, idx))}: {len(L)} families, q {L[0][0]}..{L[-1][0]}")
    c = collections.Counter((r[4], r[9], r[10], r[11], r[14]) for q, r, f in L)
    print("   factors(terms) | V shape (+,-) | V coeffs | U terms | U neg mass : count")
    for k, n in c.most_common():
        print("  ", " | ".join(k), ":", n)
    for q, r, f in L[:6]:
        print(f"   q {q:6} fam {r[0]:>6} {f['source_list']:22} mech {f.get('mechanism')!s:12} V = {r[16]}")
