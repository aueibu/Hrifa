#!/usr/bin/env bash
# Live procedure, new order: scrape the RUNNING parent (after its first search finished), then pause it,
# then scrape the still-busy worker at a safe point, resume, let the run finish, compare. 2 rounds.
set -u
cd ~/zruns/scrapetest || exit 1
for round in 1 2; do
  rm -rf toy4 ~/zruns/scrape; mkdir -p ~/zruns/scrape
  nice -n 10 pypy3 ~/zgen/zgen.py types --shape 5,4,2 --workers 2 --out toy4 > toy4.log 2>&1 &
  sleep 3
  PARENT=$(pgrep -f "zgen.py types --shape 5,4,2 --workers 2 --out toy4" | sort -n | head -1)
  WS=$(pgrep -P "$PARENT" | sort -n | tr '\n' ' ')
  until grep -q "finished U" toy4.log || ! kill -0 "$PARENT" 2>/dev/null; do sleep 5; done
  sleep $((5 * round))
  bash ~/zgen/scrape_pid.sh "$PARENT"
  kill -STOP "$PARENT"
  for w in $WS; do
    st=$(ps -o stat= -p "$w" | cut -c1)
    if [ "$st" = R ]; then bash ~/zgen/scrape_pid.sh "$w" safe; else bash ~/zgen/scrape_pid.sh "$w"; fi
  done
  kill -CONT "$PARENT"
  wait
  echo "round $round exit: $(tail -1 toy4.log)"
  python3 - $WS $PARENT <<'EOF'
import json, sys, os
final = set()
if os.path.exists("toy4/uv_types.jsonl"):
    for l in open("toy4/uv_types.jsonl"):
        t = json.loads(l); final.add((json.dumps(t["P"]), json.dumps(t["Q"])))
print("   final types:", len(final))
union = set()
for pid in sys.argv[1:]:
    f = os.path.expanduser(f"~/zruns/scrape/scrape_{pid}.json")
    if not os.path.exists(f):
        print("  ", pid, "no scrape"); continue
    d = json.load(open(f))
    for kind in ("workers", "parent_done"):
        for w in d[kind]:
            got = {(json.dumps(x[0]), json.dumps(x[1])) for x in w["pats"]}
            union |= got
            print("  ", pid, kind, len(got), "types, all in final:", got <= final)
print("   scraped union:", len(union), "of", len(final), "final types")
EOF
done
