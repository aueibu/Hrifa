#!/bin/bash
# Test Conjecture S (THEORY_SMALL_FACTOR.md) against a finished --fast ladder: run only the conjectured shapes
# and compare family by family with the full ladder's union. Waits for the ladder's LADDER DONE first.
# Steps (resumable: a finished step is skipped):
#   chord_neg   3,0 with U up to two -1 coefficients            (Conjecture S)
#   four        3,1 4,0 4,1 with U coefficients 0/1             (Conjecture S)
#   chord4_neg  4,0 with U up to two -1 coefficients            (widened form, WIDE=1 only)
# usage: PRIMES="3 5 7" Q=243 W=16 TAG=l7q243 [WIDE=1] bash conj_s.sh >> ~/zruns/zprod/${TAG}_conjS.out
PRIMES=${PRIMES:-"3 5 7"}; Q=${Q:-243}; W=${W:-16}; TAG=${TAG:-l7q$Q}; WIDE=${WIDE:-0}
D=~/zruns/zprod/$TAG; C=$D/conjS; mkdir -p $C; cd ~/zruns/zprod
until grep -q "LADDER DONE" ~/zruns/zprod/$TAG.out; do sleep 60; done
KS="6 7 8 9 10 11 12 13 14 15 16"
run() {
  n=$1; shift
  if [ -f $C/$n/summary.csv ]; then echo "$n already done"; return; fi
  t=$(date +%s); echo "$(date +%H:%M) $n start"
  pypy3 ~/zgen/zprod_fast.py --fast --zgen ~/zgen/zgen_v4.py --primes $PRIMES --interval-odd $Q --workers $W \
    --no-types --k $KS --out $C/$n "$@" > $C/$n.out 2>&1
  echo "$(date +%H:%M) $n exit $? in $(( $(date +%s) - t ))s: $(grep -h 'WARNING' $C/$n.out | cut -c1-60)"
}
run chord_neg --shapes 3,0 --ucoeffs -1 0 1 2 --max-neg 2
run four --shapes 3,1 4,0 4,1 --ucoeffs 0 1
[ "$WIDE" = 1 ] && run chord4_neg --shapes 4,0 --ucoeffs -1 0 1 2 --max-neg 2
for k in $KS; do
  [ -s $D/union_k$k.jsonl ] || continue
  echo "k$k: $(python3 ~/zgen/union_fams.py $C/union_k$k.jsonl $C/*/k$k/families.jsonl --ref $D/union_k$k.jsonl | tail -1)"
done
echo "CONJ DONE"
