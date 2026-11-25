#!/bin/bash
# 7-note Z-pair hunt: only k = 7, weight-1 flipped factors (shapes 2,1 3,2), Rust search, one run after another.
# usage: bash k7_hunt.sh "PRIMES:Q" ... >> ~/zruns/zprod/k7_hunt.out 2>&1
export ZPROD_RS=${ZPROD_RS:-~/zgen/zprod-rs-bin5}
SHAPES=${SHAPES:-"2,1 3,2"}
for spec in "$@"; do
  pr=${spec%%:*}; q=${spec##*:}; tag=k7_p$(echo $pr | tr ' ' '-')_q$q${TAGSUF}
  D=~/zruns/zprod/k7hunt/$tag
  if [ -f $D/summary.csv ]; then echo "$tag already done"; continue; fi
  t=$(date +%s); echo "$(date +%H:%M) $tag start (shapes $SHAPES)"
  timeout ${TMAX:-600} pypy3 ~/zgen/zprod_rs.py --fast --zgen ~/zgen/zgen_v4.py --primes $pr --interval-odd $q \
    --workers 16 --no-types --max-nodes ${MAXN:-2000000} --out $D --k 7 --shapes $SHAPES > $D.out 2>&1
  echo "$(date +%H:%M) $tag exit $? in $(( $(date +%s) - t ))s: $(grep -h '^k=7' $D.out) $(grep -h 'searched' $D.out | cut -c1-100) $(grep -h 'hit --max' $D.out | cut -c1-40)"
  [ -s $D/k7/families.jsonl ] && python3 ~/zgen/usesp.py $D/k7/families.jsonl | head -5
done
echo HUNT DONE
