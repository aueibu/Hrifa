#!/bin/bash
# Overnight 2026-11-23: push every limit <= 17 to the highest q with the Rust factor-search ladder (S'-type shapes,
# validated recipe), round-robin by limit; a rung is capped at RUNG_MAX s and a limit stops at its first capped rung;
# no rung starts after CUTOFF (VM clock, UTC). Cheap shape-free enumerations prove the low rungs.
# Summary lines -> ~/zruns/zprod/overnight.out; ladder detail -> ~/zruns/zprod/<tag>.out
# usage: bash overnight.sh >> ~/zruns/zprod/overnight.out 2>&1
export ZPROD=~/zgen/zprod_rs2.py ZPROD_RS=~/zgen/zprod-rs-bin11 W=16
RUNG_MAX=${RUNG_MAX:-2700}; CUTOFF=${CUTOFF:-1330}
cd ~/zruns/zprod
declare -A PR=( [5]="3 5" [7]="3 5 7" [11]="3 5 7 11" [13]="3 5 7 11 13" [17]="3 5 7 11 13 17" )
declare -A QS=( [5]="1215 2187 3645 6561" [7]="315 405 729 1215" [11]="243 405 729" [13]="243 405 729" [17]="243 405 729" )
declare -A STOP
summary() {  # tag: families per note count from the union files, budget-stopped steps
  local D=$1 s=""
  for k in 6 7 8 9 10 11 12 13 14 15 16; do [ -s $D/union_k$k.jsonl ] && s="$s k$k:$(wc -l < $D/union_k$k.jsonl)"; done
  echo "families$s; total $(cat $D/union_k*.jsonl 2>/dev/null | wc -l); bad: $(grep -h 'bad' $D.out | grep -vc ', 0 bad'); budget stops in: $(grep -l 'hit --max' $D/*.out 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ' ')"
}
rung() {  # limit q
  local L=$1 q=$2 tag=l$1q$2_on
  if [ "$(date +%H%M)" -ge "$CUTOFF" ]; then echo "$(date +%H:%M) $tag skipped: past cutoff"; STOP[$L]=1; return; fi
  if grep -q 'LADDER DONE' $tag.out 2>/dev/null; then echo "$(date +%H:%M) $tag already done: $(summary ~/zruns/zprod/$tag)"; return; fi
  local t=$(date +%s); echo "$(date +%H:%M) $tag ladder start"
  PRIMES="${PR[$L]}" Q=$q TAG=$tag timeout $RUNG_MAX bash ~/zgen/run_ladder_hc.sh >> $tag.out 2>&1
  local e=$?
  if [ $e -eq 124 ]; then
    pkill -f "zprod/$tag/" ; sleep 2; pkill -9 -f "zprod/$tag/"
    echo "$(date +%H:%M) $tag ladder CAPPED after ${RUNG_MAX}s (limit $L stops here; partial steps kept)"; STOP[$L]=1; return
  fi
  echo "$(date +%H:%M) $tag ladder exit $e in $(( $(date +%s) - t ))s: $(summary ~/zruns/zprod/$tag)"
}
enum_proof() {  # limit q (needs the ladder rung for the comparison)
  local L=$1 q=$2 tag=e$1q$2_on ref=l$1q$2_on
  grep -q 'LADDER DONE' $ref.out 2>/dev/null || { echo "$(date +%H:%M) $tag skipped: no ladder $ref"; return; }
  local t=$(date +%s); echo "$(date +%H:%M) $tag enum start"
  ZPROD_RS=~/zgen/zprod-rs-bin12 MEMGB=16 bash ~/zgen/enum_run.sh "${PR[$L]}" $q $tag $ref > $tag.check 2>&1
  local diffs=$(grep '^k[0-9]*: enumeration' $tag.check | grep -vc 'only in enumeration 0, only in factor search 0')
  echo "$(date +%H:%M) $tag enum done in $(( $(date +%s) - t ))s: $(grep -c '^k[0-9]*: enumeration' $tag.check) sizes compared, $diffs differ; $(grep 'enumeration exit' $tag.check)"
}
for round in 0 1 2 3; do
  for L in 5 7 11 13 17; do
    [ -n "${STOP[$L]}" ] && continue
    q=$(echo ${QS[$L]} | cut -d' ' -f$((round + 1)))
    [ -z "$q" ] && continue
    rung $L $q
  done
  if [ $round -eq 0 ]; then enum_proof 7 315; fi
  if [ $round -eq 1 ]; then enum_proof 5 2187; fi
done
echo "$(date +%H:%M) OVERNIGHT DONE"
