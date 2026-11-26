"""Merge scraped types into a partial uv_types.jsonl per size.
usage: python3 merge_scrape.py SCRAPE_DIR OUT_BASE PARENT_PID:K [PARENT_PID:K ...]
   e.g. merge_scrape.py ~/zruns/scrape_live ~/zruns/d1_k10-14_v2 5607:11 5608:13 5610:14
Each worker's scrape file is assigned to its parent by the parent's child list saved in children_<pid>.txt.
Writes OUT_BASE/uv<K>/uv_types.jsonl (types sorted as zgen does, flagged partial) and scrape_summary.json."""
import json, os, sys

d, base = sys.argv[1], sys.argv[2]
for spec in sys.argv[3:]:
    ppid, k = spec.split(":")
    pids = [ppid] + open(os.path.join(d, f"children_{ppid}.txt")).read().split()
    pats, summary = {}, []
    for pid in pids:
        f = os.path.join(d, f"scrape_{pid}.json")
        if not os.path.exists(f):
            summary.append({"pid": pid, "missing": True}); continue
        s = json.load(open(f))
        for kind in ("workers", "parent_done"):
            for w in s[kind]:
                new = 0
                for P, Q, rk, kp, fl in w["pats"]:
                    key = (json.dumps(P), json.dumps(Q))
                    if key not in pats:
                        pats[key] = {"k": kp, "rank": rk, "U_notes": None, "V_plus": None, "V_minus": None,
                                     "flip": fl, "P": P, "Q": Q, "partial": True}
                        new += 1
                summary.append({"pid": pid, "kind": kind, "job": w.get("job"), "count": w["count"],
                                "types": len(w["pats"]), "new": new})
    out = os.path.join(base, f"uv{k}")
    os.makedirs(out, exist_ok=True)
    rows = sorted(pats.values(), key=lambda t: (t["k"], t["rank"], t["P"]))
    with open(os.path.join(out, "uv_types.jsonl"), "w") as fh:
        for i, t in enumerate(rows, 1):
            t["type"] = i
            fh.write(json.dumps(t) + "\n")
    with open(os.path.join(out, "scrape_summary.json"), "w") as fh:
        json.dump(summary, fh, indent=1)
    ranks = {}
    for t in rows:
        ranks[t["rank"]] = ranks.get(t["rank"], 0) + 1
    print(f"k={k}: {len(rows)} partial types (by rank {dict(sorted(ranks.items()))}) -> {out}/uv_types.jsonl")
    for s in summary:
        print("   ", s)
