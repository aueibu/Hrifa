#!/bin/bash
# Overnight 2026-11-24: factor-search ladder (lower bounds, not proofs) for 6 notes only (beside k789_ladder.sh), limits 5..23, q above
# the proof rungs. Steps per rung, each capped at STEPCAP s (a capped step keeps what it wrote; the rung is then a
# lower bound even for its shapes): main (3,1 4,1 4,2 3,0 4,0 5,0), five (5,1 5,2), neg (3,0 with U up to four -1),
# s1 (2,1 3,2; 2,1 is the shape every 7-note family found so far has). Round-robin; no new rung after STOP_UTC.
# Uses its own binary copy (bin13K6) so the proof chain's kill never hits it. Runs niced on W workers.
# usage: bash k6_ladder.sh >> ~/zruns/zprod/k6_ladder.out 2>&1
export ZPROD_RS=~/zgen/zprod-rs-bin13K6
ZPROD=~/zgen/zprod_rs3.py; W=${W:-2}; STEPCAP=${STEPCAP:-2700}; STOP=${STOP_UTC:-13:30}
KS="6"
cd ~/zruns/zprod
NAMES=(5 7 11 13 17 19 23)
declare -A PRS=([5]="3 5" [7]="3 5 7" [11]="3 5 7 11" [13]="3 5 7 11 13" [17]="3 5 7 11 13 17" [19]="3 5 7 11 13 17 19" [23]="3 5 7 11 13 17 19 23")
declare -A RUNGS=([5]="10935 19683 32805" [7]="729 1215 2187 3645" [11]="405 729 1215" [13]="405 729 1215" [17]="405 729" [19]="405 729" [23]="405 729")
step() {  # dir, name, zprod arguments
  local D=$1 n=$2; shift 2
  [ -f $D/$n/summary.csv ] && return
  local t=$(date +%s)
  timeout $STEPCAP nice -n 10 pypy3 $ZPROD --fast --zgen ~/zgen/zgen_v4.py --primes $PR --interval-odd $Q --workers $W \
    --no-types --out $D/$n "$@" > $D/$n.out 2>&1
  local e=$?
  [ $e = 124 ] && pkill -f "zprod-rs-bin13K6"
  echo "  $n exit $e $(( $(date +%s) - t ))s $(grep -h '^k=' $D/$n.out | grep -v ': 0 families' | tr '\n' ' ')"
}
echo "== K6 LADDER start $(date -u)"
for round in 0 1 2 3; do
  for L in "${NAMES[@]}"; do
    rs=(${RUNGS[$L]}); Q=${rs[$round]}; [ -z "$Q" ] && continue
    if [[ "$(date -u +%H:%M)" > "$STOP" ]]; then echo "$(date -u +%H:%M) stop time $STOP reached"; break 2; fi
    PR=${PRS[$L]}; D=~/zruns/zprod/k6L_l${L}q$Q; mkdir -p $D
    echo "$(date -u +%H:%M) k6L_l${L}q$Q start"
    step $D main --k $KS --shapes 3,1 4,1 4,2 3,0 4,0 5,0
    step $D five --k $KS --shapes 5,1 5,2
    step $D neg --k $KS --shapes 3,0 --ucoeffs -1 0 1 2 --max-neg 4
    for k in $KS; do step $D s1_k$k --k $k --shapes 2,1 3,2; done
    for k in $KS; do
      ls $D/*/k$k/families.jsonl > /dev/null 2>&1 && python3 ~/zgen/union_fams.py $D/union_k$k.jsonl $D/*/k$k/families.jsonl
    done
    echo "  union: $(for k in $KS; do [ -f $D/union_k$k.jsonl ] && echo -n "k$k $(grep -c . $D/union_k$k.jsonl)  "; done)"
  done
done
echo "K6 LADDER DONE $(date -u)"
