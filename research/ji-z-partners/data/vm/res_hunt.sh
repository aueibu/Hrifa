#!/bin/bash
# Hunt for residue families (THEORY_SMALL_FACTOR.md 6.7): factor searches with the shapes of the 9 known
# 5-limit residue families, then resclass.py keeps the families with no plain x (+1/-1) split. Default
# node budget (2,000,000 per factor), 45-min cap per run: the counts are lower bounds.
# usage: PRIMES="3 5" TAG=5 bash res_hunt.sh "3645 6561"   (default PRIMES "3 5", TAG = highest prime)
#        log ~/zruns/zprod/chordsum/res_hunt.out; runs in ~/zruns/zprod/chordsum/hunt/<name>_l<TAG>q<q>
PRIMES=${PRIMES:-3 5}; TAG=${TAG:-${PRIMES##* }}
O=~/zruns/zprod/chordsum/hunt; mkdir -p $O; cd ~/zruns/zprod
for q in ${1:-3645 6561}; do
  sfx=q$q; [ "$TAG" != 5 ] && sfx=l${TAG}q$q
  run() {  # name args...
    n=$1; shift; R=$O/${n}_$sfx; rm -rf $R; t=$(date +%s)
    ZPROD_RS=~/zgen/zprod-rs-bin12 timeout 2700 pypy3 ~/zgen/zprod_rs2.py --fast --zgen ~/zgen/zgen_v4.py --primes $PRIMES \
      --interval-odd $q --workers 16 --no-types --k 12 13 14 15 16 --out $R "$@" > $R.out 2>&1
    echo "$(TZ=America/New_York date +%H:%M) $sfx $n: exit $? $(( $(date +%s) - t ))s $(grep -h 'WARNING\|ERROR' $R.out | cut -c1-90 | tr '\n' ' ')" >> $O/../res_hunt.out
  }
  run w21c2 --shapes 2,1 --ucoeffs 0 1 2 --max-neg 0        # weight-1 factor x set with doubled notes (13/2)
  run c30n3 --shapes 3,0 --ucoeffs -1 0 1 2 --max-neg 3     # chord x signed factor with a 2 (15/19520, 15/26954)
  run s31n2 --shapes 3,1 --ucoeffs -1 0 1 --max-neg 2       # 4-term signed x signed (14/480)
  run s51n1 --shapes 5,1 --ucoeffs -1 0 1 --max-neg 1       # 6-term x 6-term (16/4363, 16/4374)
  run s52n2 --shapes 5,2 --ucoeffs -1 0 1 --max-neg 2       # 7-term x 7-term (15/18591, 15/18592)
  (cd ~/zgen && PYTHONPATH=~/pylib python3 resclass.py $O/residue_$sfx.jsonl $O/*_$sfx) 2>> $O/../res_hunt.out
done
echo "RES HUNT DONE $PRIMES" >> $O/../res_hunt.out
