#!/bin/bash
# Count the sets an unconditional (shape-free) enumeration would visit: k-note sets containing their lowest
# note 0 whose every pairwise difference is an allowed interval (= plain factors of shape k,0, minus the few
# sets equal to their own inversion). One size at a time; a limit stops at its first timeout.
# usage: bash clique_count.sh "PRIMES:Q" ... >> ~/zruns/zprod/clique_count.out 2>&1
BIN=${BIN:-~/zgen/zprod-rs-bin6}; TMAX=${TMAX:-300}
for spec in "$@"; do
  pr=${spec%%:*}; q=${spec##*:}
  echo "== primes $pr, q $q"
  for k in 6 7 8 9 10 11 12 13 14 15 16; do
    t=$(date +%s)
    out=$(timeout $TMAX $BIN --primes $pr --q $q --k $k --shapes $k,0 --count-only --threads 16 --out /tmp/cc.jsonl 2>&1 | grep 'shape')
    e=$?
    if [ -z "$out" ]; then echo "  k=$k: timed out after ${TMAX}s"; break; fi
    echo "  k=$k: $(echo $out | sed 's/ factors V//') wall $(( $(date +%s) - t ))s"
  done
done
echo COUNT DONE
