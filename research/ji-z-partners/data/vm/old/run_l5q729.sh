#!/bin/bash
# Complete 5-limit ladder by intervallic odd limit: every set with all intervals of odd limit <= Q, 6..16 notes
# (gamut odd <= Q). Pass "multi": one zprod run over all note counts with the shapes whose coefficient sum is
# >= 2 (3,1 4,1 4,2 3,0 4,0 5,0: ~76M factors at Q = 729; the 5-term signed shapes are too many and are left
# out). Pass "s1": the sum-1 shapes 2,1 3,2 one note count at a time (they make U sum to k). Resumable.
# Then: check against the exhaustive odd <= 123 catalog (every family there with q <= Q must be found; extras
# are expected) and score by intervallic odd limit.
# usage: Q=729 W=14 bash run_l5q729.sh >> ~/zruns/zprod/l5q729.out
Q=${Q:-729}; W=${W:-14}; ZP=${ZP:-zprod_iol.py}; EXTRA=${EXTRA:-}; TAG=${TAG:-}
D=~/zruns/zprod/l5q$Q$TAG; mkdir -p $D; cd ~/zruns/zprod
KS="6 7 8 9 10 11 12 13 14 15 16"
step() {  # name, then zprod arguments
  n=$1; shift
  if [ -f $D/$n/summary.csv ]; then echo "$n already done"; return; fi
  t=$(date +%s); echo "$(date +%H:%M) $n start"
  pypy3 ~/zgen/$ZP $EXTRA --zgen ~/zgen/zgen_v4.py --primes 3 5 --interval-odd $Q --workers $W --no-types \
    --out $D/$n "$@" > $D/$n.out 2>&1
  echo "$(date +%H:%M) $n exit $? in $(( $(date +%s) - t ))s: $(grep -h 'WARNING' $D/$n.out | cut -c1-60)"
  grep -h '^k=' $D/$n.out
}
step multi --k $KS --shapes 3,1 4,1 4,2 3,0 4,0 5,0
for k in $KS; do step s1_k$k --k $k --shapes 2,1 3,2; done
python3 ~/zgen/union_fams.py /dev/null $D/*/k*/families.jsonl > /dev/null
for k in $KS; do
  ls $D/*/k$k/families.jsonl > /dev/null 2>&1 && python3 ~/zgen/union_fams.py $D/union_k$k.jsonl $D/*/k$k/families.jsonl
done
python3 ~/zgen/iol_compare.py exh5_all.jsonl $Q $D/union_k*.jsonl | grep -v "^   missing" > $D/compare.txt
cat $D/compare.txt
pypy3 ~/zgen/interval_odd.py $D/union_k*.jsonl > $D/interval_odd.txt
cat $D/interval_odd.txt
echo "L5 DONE"
