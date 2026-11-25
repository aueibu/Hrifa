#!/bin/bash
# 19-limit start (human, 03:31 Eastern: "if at 9:30 you have not heard from me you can start a new q search task").
# Waits until 14:30 UTC (9:30 Eastern); does nothing if ~/zruns/zprod/CANCEL_19 exists then.
# Ladder q 135 -> widened steps -> clique count -> enumeration proof if < 150 B sets. Lines -> overnight.out (Q19).
cd ~/zruns/zprod; LOG=~/zruns/zprod/overnight.out; PR="3 5 7 11 13 17 19"
until [ "$(date +%H%M)" -ge 1430 ]; do sleep 30; done
[ -f CANCEL_19 ] && { echo "$(date +%H:%M) Q19 cancelled (CANCEL_19)" >> $LOG; exit 0; }
t=$(date +%s); echo "$(date +%H:%M) Q19 ladder l19q135_on start" >> $LOG
ZPROD=~/zgen/zprod_rs2.py ZPROD_RS=~/zgen/zprod-rs-bin11 W=16 PRIMES="$PR" Q=135 TAG=l19q135_on bash ~/zgen/run_ladder_hc.sh >> l19q135_on.out 2>&1
s=""; for k in 6 7 8 9 10 11 12 13 14 15 16; do [ -s l19q135_on/union_k$k.jsonl ] && s="$s k$k:$(wc -l < l19q135_on/union_k$k.jsonl)"; done
echo "$(date +%H:%M) Q19 ladder l19q135_on done in $(( $(date +%s) - t ))s:$s; total $(cat l19q135_on/union_k*.jsonl | wc -l)" >> $LOG
bash ~/zgen/widen.sh "$PR" 135 l19q135_on
out=$(timeout 900 ~/zgen/zprod-rs-bin12 --primes $PR --q 135 --k 16 --shapes 3,0 --out /tmp/c19.jsonl --cliques 16 --threads 16 2>&1)
tot=$(echo "$out" | awk '/ notes: /{if ($1>=6) s+=$3} END{print s+0}')
echo "$(date +%H:%M) Q19 count q 135: ${tot} sets (6-16 notes); $(echo "$out" | grep -c 'cliques: done') = finished" >> $LOG
if echo "$out" | grep -q 'cliques: done' && [ "$tot" -lt 150000000000 ]; then
  t=$(date +%s); echo "$(date +%H:%M) Q19 proof e19q135_on start" >> $LOG
  ZPROD_RS=~/zgen/zprod-rs-bin12 MEMGB=16 bash ~/zgen/enum_run.sh "$PR" 135 e19q135_on l19q135_on > e19q135_on.check 2>&1
  diffs=$(grep '^k[0-9]*: enumeration [0-9]*, factor search' e19q135_on.check | grep -vc 'only in enumeration 0, only in factor search 0')
  echo "$(date +%H:%M) Q19 proof e19q135_on done in $(( $(date +%s) - t ))s: $(grep -c '^k[0-9]*: enumeration [0-9]*, factor search' e19q135_on.check) sizes compared, $diffs differ; total $(cat e19q135_on/k*/families.jsonl | wc -l); killed: $(grep -c 'exited with -9' e19q135_on.out)" >> $LOG
fi
echo "$(date +%H:%M) Q19 DONE" >> $LOG
