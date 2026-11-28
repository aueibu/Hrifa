#!/usr/bin/env python3
"""shapes_add_new5.py (2026-11-27): add the 5 new 9-note 2-D shapes (new5.json, from the stopped k 9 min-dim 2 run)
to tables/shapes9/shapes_catalog.json as "F35", "F54", "F56", "F57", "F80" (F = found by the flat search, number =
class index in typeflats_k9d2_partial.json), then rewrite the page's `const DATA = [...]` line from the catalog.
Re-runnable (replaces earlier F entries).

usage: python shapes_add_new5.py   (from research/ji-z-partners)
"""
import json

CAT = "tables/shapes9/shapes_catalog.json"
PAGE = "figs/z-pair-shapes.html"

FACTOR_TEXT = {
    35: "plain 9-term U x signed 5-term V on one axis (3 plus, 2 minus)",
    54: "plain 9-term U x signed 5-term V on one axis (3 plus, 2 minus)",
    80: "plain 9-term U x signed 7-term V on one axis (4 plus, 3 minus)",
    56: "signed 3-term U x signed 11-term V (10 plus, 1 minus): both factors signed",
    57: "signed 5-term U x signed 15-term V (12 plus, 3 minus): both factors signed",
}


def norm(S):
    m = [min(p[i] for p in S) for i in range(len(S[0]))]
    return [[x - m[i] for i, x in enumerate(p)] for p in S]


def main():
    cat = [s for s in json.load(open(CAT)) if not s["name"].startswith("F")]
    new = json.load(open("tables/shapes9/new5.json"))
    adds = []
    for r in new:
        f, i = r["first"], r["found"]
        assert r["factor"]["check"] == "ok"
        exact = f["proven"]
        note = (f"new 2-D 9-note shape, found by the partial 9-note flat search (stopped at 2%); no family in our lists "
                f"has it. P = U V, Q = U V*: {FACTOR_TEXT[i]}. "
                + ("First q proven (equals the 3^m lower bound)." if exact else
                   f"First q between {f['q_low']:,} and {f['q']:,} (lower bound 3^m; upper = smallest found by a search)."))
        adds.append({"k": 9, "name": f"F{i}", "dim": 2, "P": r["integral"]["P"], "Q": r["integral"]["Q"],
                     "first_q": f["q"], "first_q_low": None if exact else f["q_low"], "note": note, "families": None,
                     "prime": r["prime"],
                     "first": {"P": norm(f["P"]), "Q": norm(f["Q"]), "primes": f["primes"], "q": f["q"], "list": None}})
    adds.sort(key=lambda s: (s["first_q_low"] or s["first_q"], s["first_q"], s["name"]))
    cat += adds
    json.dump(cat, open(CAT, "w"))
    lines = open(PAGE, encoding="utf-8").read().split("\n")
    idx = [n for n, l in enumerate(lines) if l.startswith("const DATA = [")]
    assert len(idx) == 1
    lines[idx[0]] = "const DATA = " + json.dumps(cat) + ";"
    open(PAGE, "w", encoding="utf-8", newline="\n").write("\n".join(lines))
    print(len(cat), "shapes;", [(s["name"], s["first_q_low"], s["first_q"], s["first"]["primes"]) for s in adds])


if __name__ == "__main__":
    main()
