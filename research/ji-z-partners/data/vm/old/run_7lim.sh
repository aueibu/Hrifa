#!/usr/bin/env bash
# 7-limit odd 123 Z-families with zprod (hull-pruned factors). Steps are skipped when already finished
# (rerun this script to resume after a preemption).
# Shapes whose coefficients sum to 1 (2,1 and 3,2) make U sum to the whole note count k, so their U search
# is deep: they run one k at a time with a larger node budget. Other shapes run all k together.
set -u
W=${W:-12}
cd ~/zruns/zprod || exit 1
Z="nice -n 10 pypy3 $HOME/zgen/zprod.py --zgen $HOME/zgen/zgen_v4.py --primes 3 5 7 --odd 123 --workers $W --no-types"
K="6 7 8 10 11 13 14"
step() { # name, args...
  local name=$1; shift
  if grep -q "^done in" "s7_$name/run.log" 2>/dev/null; then echo "$(date -u +%H:%M) $name already done"; return; fi
  rm -rf "s7_$name"
  local t0=$SECONDS
  echo "$(date -u +%H:%M) $name start"
  $Z --out "s7_$name" "$@" > "s7_$name.out" 2>&1
  echo "$(date -u +%H:%M) $name finished (exit $?) in $((SECONDS - t0))s: $(grep -h -E '^k=|WARNING' s7_$name/run.log | cut -c1-60 | tr '\n' ' ')"
}
for k in 6 7 8; do
  step s1_k$k --k $k --shapes 2,1 3,2 --max-nodes 20000000
  step s1signed_k$k --k $k --shapes 2,1 3,2 --ucoeffs -1 0 1 2 --max-neg 1 --max-nodes 20000000
done
step b_big     --k $K --shapes 3,1 4,1 4,2
step c_signed  --k $K --shapes 3,1 4,1 4,2 --ucoeffs -1 0 1 2 --max-neg 1
step e_neg2    --k $K --shapes 3,1 --ucoeffs -1 0 1 2 --max-neg 2
for k in 10 11 13 14; do
  step s1_k$k --k $k --shapes 2,1 3,2 --max-nodes 20000000
  step s1signed_k$k --k $k --shapes 2,1 3,2 --ucoeffs -1 0 1 2 --max-neg 1 --max-nodes 20000000
done
grep -h WARNING s7_*/run.log
mkdir -p s7_union
for k in $K; do
  echo "k=$k: $(python3 ~/zgen/union_fams.py s7_union/k$k.jsonl $(ls s7_*/k$k/families.jsonl 2>/dev/null) | tail -1)"
done
for k in 10 14; do
  ref=$HOME/zruns/d1_k10-14_v2/place_7lim_odd123_k10/families.jsonl
  [ $k = 14 ] && ref=$HOME/zruns/scrape_merge/place_7lim_odd123_k14/families.jsonl
  echo "k=$k vs earlier placement: $(python3 ~/zgen/union_fams.py /tmp/x$k.jsonl s7_union/k$k.jsonl --ref $ref | tail -1)"
done
echo RUN7 DONE
