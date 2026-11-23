#!/bin/bash
# Widened ladder steps (found 2026-11-23: at 5-limit q 2,025-2,187 the recipe misses 3,0 with three -1 in U and
# 3,1 with signed U). Adds steps to an existing rung dir, then redoes the union and verify; one line -> overnight.out.
# usage: bash widen.sh "PRIMES" Q TAG [NEG30=4]
PRIMES=$1; Q=$2; TAG=$3; N30=${4:-4}
export ZPROD_RS=${ZPROD_RS:-~/zgen/zprod-rs-bin11}
D=~/zruns/zprod/$TAG; cd ~/zruns/zprod; LOG=~/zruns/zprod/overnight.out
KS="6 7 8 9 10 11 12 13 14 15 16"
before=$(cat $D/union_k*.jsonl | wc -l); t0=$(date +%s); info=""
step() {  # name, args
  local n=$1; shift
  [ -f $D/$n/summary.csv ] && return
  local t=$(date +%s)
  pypy3 ~/zgen/zprod_rs2.py --fast --zgen ~/zgen/zgen_v4.py --primes $PRIMES --interval-odd $Q --workers 16 --no-types \
    --out $D/$n "$@" > $D/$n.out 2>&1
  info="$info $n($(( $(date +%s) - t ))s, stops $(grep -h '^zprod-rs:.*stopped' $D/$n.out | tail -1 | sed -E 's/.* ([0-9]+) stopped.*/\1/'))"
}
step w30n$N30 --k $KS --shapes 3,0 --ucoeffs -1 0 1 2 --max-neg $N30
step w31n2 --k $KS --shapes 3,1 --ucoeffs -1 0 1 2 --max-neg 2
for k in $KS; do
  ls $D/*/k$k/families.jsonl > /dev/null 2>&1 && python3 ~/zgen/union_fams.py $D/union_k$k.jsonl $D/*/k$k/families.jsonl
done
bad=0; for f in $D/union_k*.jsonl; do pypy3 ~/zgen/verify_families.py ~/zgen/zgen_v4.py $f | tail -1 | grep -q ', 0 bad' || bad=$((bad + 1)); done
s=""; for k in $KS; do [ -s $D/union_k$k.jsonl ] && s="$s k$k:$(wc -l < $D/union_k$k.jsonl)"; done
echo "$(date +%H:%M) WIDEN $TAG done in $(( $(date +%s) - t0 ))s:$info; families $before -> $(cat $D/union_k*.jsonl | wc -l) ($s); files with bad: $bad" >> $LOG
