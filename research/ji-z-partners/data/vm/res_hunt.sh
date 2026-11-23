#!/bin/bash
# Hunt for residue families (THEORY_SMALL_FACTOR.md 6.7) at 5-limit: factor searches with the shapes of
# the 9 known residue families, at q 3645 (must find all 9) and then higher q. Default node budget
# (2,000,000 per factor), 45-min cap per run: the counts are lower bounds.
# usage: bash res_hunt.sh "3645 6561"   log ~/zruns/zprod/chordsum/res_hunt.out
O=~/zruns/zprod/chordsum/hunt; mkdir -p $O; cd ~/zruns/zprod
for q in ${1:-3645 6561}; do
  run() {  # name args...
    n=$1; shift; R=$O/${n}_q$q; rm -rf $R; t=$(date +%s)
    ZPROD_RS=~/zgen/zprod-rs-bin12 timeout 2700 pypy3 ~/zgen/zprod_rs2.py --fast --zgen ~/zgen/zgen_v4.py --primes 3 5 \
      --interval-odd $q --workers 16 --no-types --k 12 13 14 15 16 --out $R "$@" > $R.out 2>&1
    echo "$(TZ=America/New_York date +%H:%M) q $q $n: exit $? $(( $(date +%s) - t ))s $(grep -h 'WARNING\|ERROR' $R.out | cut -c1-90 | tr '\n' ' ')" >> $O/../res_hunt.out
  }
  run w21c2 --shapes 2,1 --ucoeffs 0 1 2 --max-neg 0        # weight-1 factor x set with doubled notes (13/2)
  run c30n3 --shapes 3,0 --ucoeffs -1 0 1 2 --max-neg 3     # chord x signed factor with a 2 (15/19520, 15/26954)
  run s31n2 --shapes 3,1 --ucoeffs -1 0 1 --max-neg 2       # 4-term signed x signed (14/480)
  run s51n1 --shapes 5,1 --ucoeffs -1 0 1 --max-neg 1       # 6-term x 6-term (16/4363, 16/4374)
  run s52n2 --shapes 5,2 --ucoeffs -1 0 1 --max-neg 2       # 7-term x 7-term (15/18591, 15/18592)
  (cd ~/zgen && PYTHONPATH=~/pylib python3 resclass.py $O/residue_q$q.jsonl $O/*_q$q) 2>> $O/../res_hunt.out
done
echo "RES HUNT DONE" >> $O/../res_hunt.out
