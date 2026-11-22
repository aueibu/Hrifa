#!/bin/bash
# count factors V per shape for 11-limit --fast at several q (count only, no search)
D=~/zruns/zprod/count11; mkdir -p $D; cd ~/zruns/zprod
for q in 33 45 63 99 135; do
  for sh in "3,0 4,0 5,0 2,1 3,1 3,2" "4,1" "4,2" "5,1" "5,2"; do
    n=q${q}_$(echo $sh | tr ' ,' '_-')
    ( t=$(date +%s); timeout 3000 pypy3 ~/zgen/zprod_fast.py --fast --count-only --zgen ~/zgen/zgen_v4.py --primes 3 5 7 11 \
        --interval-odd $q --k 9 --shapes $sh --workers 1 --out $D/$n > $D/$n.out 2>&1; \
      echo "$n exit $? $(( $(date +%s) - t ))s" >> $D/times.txt ) &
  done
done
wait; echo COUNT11 DONE >> $D/times.txt
