#!/bin/bash
# Rust ladders one after another (16 cores each): two checks against finished Python ladders, then new rungs.
# usage: bash rs_chain.sh >> ~/zruns/zprod/rs_chain.out 2>&1   (a finished ladder is skipped)
export ZPROD_RS=${ZPROD_RS:-~/zgen/zprod-rs-bin5} ZPROD=~/zgen/zprod_rs.py W=16
run() {  # primes, q, tag
  if grep -q 'LADDER DONE' ~/zruns/zprod/$3.out 2>/dev/null; then echo "$3 already done"; return; fi
  t=$(date +%s); echo "$(date +%H:%M) $3 start"
  PRIMES="$1" Q=$2 TAG=$3 bash ~/zgen/run_ladder_hc.sh >> ~/zruns/zprod/$3.out 2>&1
  echo "$(date +%H:%M) $3 done in $(( $(date +%s) - t ))s"
}
run "3 5 7" 243 l7q243_rs
run "3 5" 729 l5q729_rs
run "3 5 7 11 13" 99 l13q99_rs
run "3 5 7 11 13 17" 85 l17q85_rs
run "3 5 7 11" 135 l11q135_rs
echo CHAIN DONE
