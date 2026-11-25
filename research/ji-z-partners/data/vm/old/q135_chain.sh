#!/bin/bash
# Common ceiling q <= 135 for 13- and 17-limit: factor-search ladder, then shape-free enumeration compared with it.
# usage: bash q135_chain.sh >> ~/zruns/zprod/q135_chain.out 2>&1
export ZPROD_RS=~/zgen/zprod-rs-bin9 ZPROD=~/zgen/zprod_rs2.py W=16 MEMGB=16
for spec in "3 5 7 11 13:l13q135_rs:en13q135" "3 5 7 11 13 17:l17q135_rs:en17q135"; do
  IFS=: read pr ltag etag <<< "$spec"
  if ! grep -q 'LADDER DONE' ~/zruns/zprod/$ltag.out 2>/dev/null; then
    t=$(date +%s); echo "$(date +%H:%M) $ltag ladder start"
    PRIMES="$pr" Q=135 TAG=$ltag bash ~/zgen/run_ladder_hc.sh >> ~/zruns/zprod/$ltag.out 2>&1
    echo "$(date +%H:%M) $ltag ladder done in $(( $(date +%s) - t ))s; budget stops in: $(grep -l 'hit --max' ~/zruns/zprod/$ltag/*.out 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ' ')"
  fi
  bash ~/zgen/enum_run.sh "$pr" 135 $etag $ltag
done
echo Q135 CHAIN DONE
