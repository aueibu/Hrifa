#!/bin/bash
# Cost probe for a 7/8/9-note project: count the k-note sets (lowest note 0, every pairwise difference an allowed
# interval) an enumeration proof would visit, for k = 7, 8, 9 only, limits 7..23 (23 = the factor search's 8-prime
# cap), q up the ladder. A limit stops at its first timeout. Shuts the VM down at the end when SHUTDOWN=1.
# usage: SHUTDOWN=1 bash k789_probe.sh >> ~/zruns/zprod/k789_probe.out 2>&1
BIN=${BIN:-~/zgen/zprod-rs-bin12}; TMAX=${TMAX:-180}
echo "== k789 probe start $(date -u)"
for lim in "3 5 7" "3 5 7 11" "3 5 7 11 13" "3 5 7 11 13 17" "3 5 7 11 13 17 19" "3 5 7 11 13 17 19 23"; do
  for q in 135 243 405 729 1215 2187; do
    for k in 7 8 9; do
      t=$(date +%s)
      out=$(timeout $TMAX $BIN --primes $lim --q $q --k $k --shapes $k,0 --count-only --threads 16 --out /tmp/cc.jsonl 2>&1 | grep -E 'shape|vertices|allowed' | tr '\n' ' ')
      if [ -z "$out" ]; then echo "primes [$lim] q $q k $k: timed out after ${TMAX}s"; continue 3; fi
      echo "primes [$lim] q $q k $k: $out wall $(( $(date +%s) - t ))s"
    done
  done
done
echo "K789 PROBE DONE $(date -u)"
if [ "${SHUTDOWN:-0}" = 1 ]; then sudo shutdown -h now; fi
