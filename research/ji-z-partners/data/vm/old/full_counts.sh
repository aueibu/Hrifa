#!/bin/bash
# Cost probes for full-list (6-16 note) enumeration at higher q: clique counts per limit, increasing q,
# each capped at TMAX s; a limit stops at its first timeout. Output: one line per (limit, q).
# usage: bash full_counts.sh >> ~/zruns/zprod/full_counts.out 2>&1
B=~/zgen/zprod-rs-bin12; TMAX=${TMAX:-240}
for spec in "3 5:1215 2187 3645" "3 5 7:315 405 567 729" "3 5 7 11:165 189 225 243" "3 5 7 11 13:165 189 225 243" "3 5 7 11 13 17:153 165 189 225"; do
  pr=${spec%%:*}; qs=${spec##*:}
  for q in $qs; do
    t=$(date +%s)
    out=$(timeout $TMAX $B --primes $pr --q $q --k 16 --shapes 3,0 --out /tmp/fc.jsonl --cliques 16 --threads 16 2>&1)
    if ! echo "$out" | grep -q 'cliques: done'; then echo "$(date +%H:%M) primes $pr q $q: TIMEOUT after ${TMAX}s"; break; fi
    tot=$(echo "$out" | awk '/ notes: /{n=$1; if (n>=6) s+=$3} END{print s}')
    echo "$(date +%H:%M) primes $pr q $q: 6-16 notes $tot sets; $(echo "$out" | awk '/ notes: /{if ($1>=6) printf "%s:%s ", $1, $3}') count $(( $(date +%s) - t ))s"
  done
done
echo COUNTS DONE
