#!/bin/bash
# Complete ladder by intervallic odd limit with zprod --fast: every Z-family of 6..16 notes whose intervals all
# have odd limit <= Q, in the given primes. Steps (resumable: a finished step is skipped), the recipe that
# reproduced the exhaustive 5-limit catalog exactly at q <= 729:
#   main   shapes 3,1 4,1 4,2 3,0 4,0 5,0, all note counts in one run
#   five   shapes 5,1 5,2
#   neg30  shape 3,0 with U coefficients -1..2 (at most two -1)
#   s1_kK  sum-1 shapes 2,1 3,2, one note count at a time
# then union per note count, verify, score by intervallic odd limit, cents shift.
# usage: PRIMES="3 5 7" Q=243 W=16 TAG=l7q243 bash run_ladder_fast.sh >> ~/zruns/zprod/$TAG.out
PRIMES=${PRIMES:-"3 5 7"}; Q=${Q:-243}; W=${W:-16}; TAG=${TAG:-l7q$Q}
D=~/zruns/zprod/$TAG; mkdir -p $D; cd ~/zruns/zprod
KS="6 7 8 9 10 11 12 13 14 15 16"
step() {  # name, then zprod arguments
  n=$1; shift
  if [ -f $D/$n/summary.csv ]; then echo "$n already done"; return; fi
  t=$(date +%s); echo "$(date +%H:%M) $n start"
  pypy3 ~/zgen/zprod_fast.py --fast --zgen ~/zgen/zgen_v4.py --primes $PRIMES --interval-odd $Q --workers $W \
    --no-types --out $D/$n "$@" > $D/$n.out 2>&1
  echo "$(date +%H:%M) $n exit $? in $(( $(date +%s) - t ))s: $(grep -h 'WARNING' $D/$n.out | cut -c1-60)"
  grep -h '^k=' $D/$n.out | grep -v ': 0 families' | tr '\n' ' '; echo
}
step main --k $KS --shapes 3,1 4,1 4,2 3,0 4,0 5,0
step five --k $KS --shapes 5,1 5,2
step neg30 --k $KS --shapes 3,0 --ucoeffs -1 0 1 2 --max-neg 2
for k in $KS; do step s1_k$k --k $k --shapes 2,1 3,2; done
for k in $KS; do
  ls $D/*/k$k/families.jsonl > /dev/null 2>&1 && python3 ~/zgen/union_fams.py $D/union_k$k.jsonl $D/*/k$k/families.jsonl
done
for f in $D/union_k*.jsonl; do pypy3 ~/zgen/verify_families.py ~/zgen/zgen_v4.py $f | tail -1; done
pypy3 ~/zgen/interval_odd.py $D/union_k*.jsonl > $D/interval_odd.txt; cat $D/interval_odd.txt
python3 ~/zgen/shade.py $D/union_k*.jsonl > $D/shade.txt; cat $D/shade.txt
echo "LADDER DONE"
