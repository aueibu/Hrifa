#!/usr/bin/env python3
"""explorer_pack.py: pack explorer_data.py's JSON (built with --members) into the files the Z-pair explorer fetches.

OUTDIR/zdata.json: n, proven, coverage, ladderCoverage, limit3 ({span: {notes: families}} from
  tables/limit3/enum3_span20.txt), cols (base64 of gzip of little-endian columns, each n long: q as uint32, then
  p, k, lb, gmin*10, gmax*10 as uint16), members (base64 of gzip of UTF-8 text, one line per proven family in row order:
  set A, "|", set B), ladderChunks ([{p, start, count, file}]: where each ladder chunk's rows sit).
OUTDIR/zmem-l<p>[-<part>].json: one per highest prime (split further when large), {p, start, count, members} with
  members as above for the ladder-only rows start .. start+count-1. The page loads a chunk only when a ladder family
  is opened.
Rows are sorted by (lb, p, k, q, gmin) in explorer_data.py, so each (lb = 1, p) group is contiguous.

usage: python explorer_pack.py explorer_all.json OUTDIR
"""
import base64, gzip, json, os, re, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHUNK_ROWS = 120_000  # keeps every chunk file well under the 16 MB per-file limit


def limit3():
    out = {}
    for line in open(os.path.join(HERE, "tables", "limit3", "enum3_span20.txt"), encoding="utf-8"):
        m = re.match(r"span (\d+) \(q = .*?\): new families by notes \{(.*)\}", line)
        if m:
            out[int(m.group(1))] = {int(a): int(b) for a, b in re.findall(r"(\d+): (\d+)", m.group(2))}
    return out


def pack_text(lines):
    return base64.b64encode(gzip.compress("\n".join(lines).encode("utf-8"), 9)).decode("ascii")


def main():
    src, outdir = sys.argv[1:]
    os.makedirs(outdir, exist_ok=True)
    d = json.load(open(src, encoding="utf-8"))
    n, proven = d["count"], d["proven"]
    assert len(d["m"]) == n, "explorer_data.py must be run with --members (all rows)"
    assert all(v == 0 for v in d["lb"][:proven]) and all(v == 1 for v in d["lb"][proven:]), "rows not sorted by lb"
    # q first as uint32 (5-limit 6-note proofs reach q 177,147, past uint16), then the uint16 columns
    cols = [d["p"], d["k"], d["lb"], [round(g * 10) for g in d["gmin"]], [round(g * 10) for g in d["gmax"]]]
    raw = struct.pack(f"<{n}I", *d["q"]) + b"".join(struct.pack(f"<{n}H", *c) for c in cols)
    lines = [f"{a}|{b}" for a, b in d["m"]]
    l3 = limit3()
    assert sum(sum(v.values()) for v in l3.values()) == 1106, "3-limit total must be 1,106"

    chunks = []
    i = proven
    while i < n:
        p = d["p"][i]
        j = i
        while j < n and d["p"][j] == p:
            j += 1
        parts = list(range(i, j, CHUNK_ROWS))
        for pi, a in enumerate(parts):
            b = min(a + CHUNK_ROWS, j)
            name = f"zmem-l{p}" + (f"-{pi + 1}" if len(parts) > 1 else "") + ".json"
            with open(os.path.join(outdir, name), "w", encoding="utf-8", newline="\n") as fh:
                json.dump({"p": p, "start": a, "count": b - a, "members": pack_text(lines[a:b])}, fh, separators=(",", ":"))
            chunks.append({"p": p, "start": a, "count": b - a, "file": name})
            print(f"  {name}: rows {a}..{b - 1}, {os.path.getsize(os.path.join(outdir, name)):,} bytes")
        i = j

    data = {"n": n, "proven": proven, "coverage": d["coverage"], "ladderCoverage": d["ladderCoverage"], "limit3": l3,
            "cols": base64.b64encode(gzip.compress(raw, 9)).decode("ascii"),
            "members": pack_text(lines[:proven]), "ladderChunks": chunks}
    out = os.path.join(outdir, "zdata.json")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"wrote {out}: {n} rows ({proven} proven), {os.path.getsize(out):,} bytes; {len(chunks)} ladder chunks")


if __name__ == "__main__":
    main()
