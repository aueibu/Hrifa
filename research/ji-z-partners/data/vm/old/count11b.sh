#!/bin/bash
# factor counts for 11-limit --fast at q 135 with the fast, cached hull (count only)
D=~/zruns/zprod/count11b; mkdir -p $D; cd ~/zruns/zprod
pypy3 ~/zgen/zprod_hc2.py --fast --count-only --hull-cache ~/zruns/zprod/hullcache --zgen ~/zgen/zgen_v4.py \
  --primes 3 5 7 11 --interval-odd 135 --k 9 --shapes 3,0 --out $D/warm > /dev/null 2>&1   # write the cache once
for q in 135; do
  for sh in "3,0 4,0 5,0 2,1 3,1 3,2" "4,1" "4,2" "5,1" "5,2"; do
    n=q${q}_$(echo $sh | tr ' ,' '_-')
    ( t=$(date +%s); pypy3 ~/zgen/zprod_hc2.py --fast --count-only --hull-cache ~/zruns/zprod/hullcache \
        --zgen ~/zgen/zgen_v4.py --primes 3 5 7 11 --interval-odd $q --k 9 --shapes $sh --workers 1 \
        --out $D/$n > $D/$n.out 2>&1; echo "$n exit $? $(( $(date +%s) - t ))s" >> $D/times.txt ) &
  done
done
wait; echo COUNT DONE >> $D/times.txt
