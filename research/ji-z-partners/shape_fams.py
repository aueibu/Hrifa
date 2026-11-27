#!/usr/bin/env python3
"""shape_fams.py (2026-11-26): pull out the families of chosen 9-note fine patterns (step-a idx) from family lists.

Keys each family's member pairs with typeflats.Search.canon (as shapes_k.py does) and writes every family whose
key equals one of the wanted patterns' keys (from K.classes.jsonl), with "shape_idx" added, deduplicated like
shapes_k.py (members up to translation + mirror).

usage: python shape_fams.py K CLASSES.jsonl IDX,IDX,... OUT.jsonl FAMILIES.jsonl... [--workers W]
"""
import json, multiprocessing as mp, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shapes_k import vec, canon_any  # noqa: E402
from typeflats import Search  # noqa: E402

S = None


def init(k):
    global S
    S = Search(k)


def work(item):
    lst, line, mem = item
    keys = set()
    for a in range(len(mem)):
        for b in range(a + 1, len(mem)):
            keys.add(S.canon(mem[a], mem[b]).hex())
    return lst, line, keys


def main():
    args = sys.argv[1:]
    workers = 8
    if "--workers" in args:
        i = args.index("--workers")
        workers = int(args[i + 1])
        del args[i:i + 2]
    k, classes, idxs, out, files = int(args[0]), args[1], [int(x) for x in args[2].split(",")], args[3], args[4:]
    want = {}
    for l in open(classes):
        c = json.loads(l)
        if c["idx"] in idxs:
            want[c["key"]] = c["idx"]
    assert len(want) == len(idxs), want
    seen, items = set(), []
    for fn in files:
        lst = fn.rstrip("/").split("/")[-3] if fn.count("/") >= 2 else fn
        for line in open(fn):
            f = json.loads(line)
            if f.get("notes", len(f["members"][0]["ratios"])) != k:
                continue
            mem = [[vec(r) for r in m["ratios"]] for m in f["members"]]
            ident = tuple(sorted(canon_any(m) for m in mem))
            if ident in seen:
                continue
            seen.add(ident)
            items.append((lst, line, mem))
    print(f"{len(items)} distinct {k}-note families", file=sys.stderr, flush=True)
    n = 0
    with mp.Pool(workers, initializer=init, initargs=(k,)) as pool, open(out, "w") as fo:
        for lst, line, keys in pool.imap_unordered(work, items, chunksize=64):
            hit = [want[x] for x in keys if x in want]
            if hit:
                f = json.loads(line)
                f["shape_idx"] = sorted(hit)
                f["source_list"] = lst
                fo.write(json.dumps(f) + "\n")
                n += 1
    print(f"{n} families of patterns {idxs}", file=sys.stderr)


if __name__ == "__main__":
    main()
