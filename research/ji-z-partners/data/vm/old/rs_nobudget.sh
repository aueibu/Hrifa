#!/bin/bash
# Rerun the sum-1 steps that hit --max-nodes with no node budget (Rust), then redo the union and checks.
# usage: bash rs_nobudget.sh "PRIMES" Q TAG "K list" >> ~/zruns/zprod/rs_nobudget.out 2>&1
PRIMES=$1; Q=$2; TAG=$3; KS=$4
D=~/zruns/zprod/$TAG; cd ~/zruns/zprod
for k in $KS; do
  n=s1nb_k$k
  [ -f $D/$n/summary.csv ] && { echo "$TAG $n already done"; continue; }
  t=$(date +%s); echo "$(date +%H:%M) $TAG $n start"
  timeout 1200 env ZPROD_RS=~/zgen/zprod-rs-bin5 pypy3 ~/zgen/zprod_rs.py --fast --zgen ~/zgen/zgen_v4.py --primes $PRIMES \
    --interval-odd $Q --workers 16 --no-types --max-nodes 0 --out $D/$n --k $k --shapes 2,1 3,2 > $D/$n.out 2>&1
  echo "$(date +%H:%M) $TAG $n exit $? in $(( $(date +%s) - t ))s: $(grep -h '^k=' $D/$n.out)"
done
for k in 6 7 8 9 10 11 12 13 14 15 16; do
  ls $D/*/k$k/families.jsonl > /dev/null 2>&1 && python3 ~/zgen/union_fams.py $D/union_k$k.jsonl $D/*/k$k/families.jsonl
done
for f in $D/union_k*.jsonl; do pypy3 ~/zgen/verify_families.py ~/zgen/zgen_v4.py $f | tail -1; done
pypy3 ~/zgen/interval_odd.py $D/union_k*.jsonl > $D/interval_odd.txt
python3 ~/zgen/shade.py $D/union_k*.jsonl > $D/shade.txt
echo "$TAG NOBUDGET DONE"
