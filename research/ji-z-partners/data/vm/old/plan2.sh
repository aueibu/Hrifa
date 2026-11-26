#!/bin/bash
# 06:45 Eastern re-plan: 5-limit proven as high as it goes, then 7-limit q 729 ladder if time. Lines -> overnight.out (PLAN2).
cd ~/zruns/zprod; LOG=~/zruns/zprod/overnight.out
export ZPROD=~/zgen/zprod_rs2.py ZPROD_RS=~/zgen/zprod-rs-bin11 W=16
proof() {  # primes q tag ref
  local t=$(date +%s); echo "$(date +%H:%M) PLAN2 proof $3 start" >> $LOG
  touch $3.started
  ZPROD_RS=~/zgen/zprod-rs-bin12 MEMGB=16 bash ~/zgen/enum_run.sh "$1" $2 $3 $4 > $3.check 2>&1
  local diffs=$(grep '^k[0-9]*: enumeration [0-9]*, factor search' $3.check | grep -vc 'only in enumeration 0, only in factor search 0')
  local cmp=$(grep -c '^k[0-9]*: enumeration [0-9]*, factor search' $3.check)
  echo "$(date +%H:%M) PLAN2 proof $3 done in $(( $(date +%s) - t ))s: $cmp sizes compared with $4, $diffs differ; total $(cat $3/k*/families.jsonl | wc -l) families; $(grep -h 'enumeration exit' $3.check | sed 's/.*enumeration //')" >> $LOG
}
ladder() {  # primes q tag
  local t=$(date +%s); echo "$(date +%H:%M) PLAN2 ladder $3 start" >> $LOG
  PRIMES="$1" Q=$2 TAG=$3 bash ~/zgen/run_ladder_hc.sh >> $3.out 2>&1
  echo "$(date +%H:%M) PLAN2 ladder $3 done in $(( $(date +%s) - t ))s: $(cat $3/union_k*.jsonl | wc -l) families before NB" >> $LOG
}
proof "3 5" 2187 e5q2187_on l5q2187_on
ladder "3 5" 3645 l5q3645_on
until [ -f l5q3645_on/NB_DONE ]; do sleep 30; done
proof "3 5" 3645 e5q3645_on l5q3645_on
if [ "$(date +%H%M)" -lt 1300 ]; then ladder "3 5 7" 729 l7q729_on; else echo "$(date +%H:%M) PLAN2 7-limit q 729 skipped (past 08:00 Eastern)" >> $LOG; fi
echo "$(date +%H:%M) PLAN2 DONE" >> $LOG
