#!/usr/bin/env python3
"""explorer_pack.py: pack explorer_data.py's JSON into the data file the Z-family explorer page fetches.

Output JSON keys: n, proven, coverage, ladderCoverage, limit3 ({span: {notes: families}} from
tables/limit3/enum3_span20.txt), cols (base64 of gzip of little-endian uint16 columns p, k, lb, q, gmin*10,
gmax*10, each n long, in that order), members (base64 of gzip of UTF-8 text, one line per proven family in row
order: member A, "|", member B).

usage: python explorer_pack.py explorer_all.json OUT.json
"""
import base64, gzip, json, os, re, struct, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def limit3():
    out = {}
    for line in open(os.path.join(HERE, "tables", "limit3", "enum3_span20.txt"), encoding="utf-8"):
        m = re.match(r"span (\d+) \(q = .*?\): new families by notes \{(.*)\}", line)
        if m:
            out[int(m.group(1))] = {int(a): int(b) for a, b in re.findall(r"(\d+): (\d+)", m.group(2))}
    return out


def main():
    src, out = sys.argv[1:]
    d = json.load(open(src, encoding="utf-8"))
    n = d["count"]
    cols = [d["p"], d["k"], d["lb"], d["q"], [round(g * 10) for g in d["gmin"]], [round(g * 10) for g in d["gmax"]]]
    raw = b"".join(struct.pack(f"<{n}H", *c) for c in cols)
    members = "\n".join(f"{a}|{b}" for a, b in d["m"]).encode("utf-8")
    l3 = limit3()
    assert sum(sum(v.values()) for v in l3.values()) == 1106, "3-limit total must be 1,106"
    data = {"n": n, "proven": d["proven"], "coverage": d["coverage"], "ladderCoverage": d["ladderCoverage"],
            "limit3": l3,
            "cols": base64.b64encode(gzip.compress(raw, 9)).decode("ascii"),
            "members": base64.b64encode(gzip.compress(members, 9)).decode("ascii")}
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"wrote {out}: {n} rows ({d['proven']} proven), {os.path.getsize(out):,} bytes")


if __name__ == "__main__":
    main()
