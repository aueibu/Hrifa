#!/bin/bash
# 7-note shape-free enumeration (k = 7 only), hybrid enumerator bin11.
# usage: bash k7_enum_chain.sh >> ~/zruns/zprod/k7_enum_chain.out 2>&1
export ZPROD_RS=~/zgen/zprod-rs-bin11 MEMGB=16
cd ~/zruns/zprod
for spec in "3 5 7:2187:en7_7q2187" "3 5 7 11:1215:en7_11q1215" "3 5 7 11 13:729:en7_13q729"; do
  IFS=: read pr q tag <<< "$spec"
  bash ~/zgen/enum_run.sh "$pr" $q $tag none 7
  [ -s $tag/k7/families.jsonl ] && python3 ~/zgen/usesp.py $tag/k7/families.jsonl
done
echo K7 CHAIN DONE
