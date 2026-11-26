#!/bin/bash
# VM: cross-check the four explorer ladder rungs against the constructive generators.
# For each rung: chordgen (chord sums) and holegen (one-hole families) at the rung's primes and q, --check against the rung's union;
# "generated pairs not in the list" = families the generator builds that the ladder lacks (strays go to <tag>.chord.strays / .hole.strays).
cd ~/zruns/zexp/xchk || exit 1
Z=~/zruns/zprod
run() {  # tag primes q dir
  tag=$1; pr=$2; q=$3; dir=$4
  echo "== $tag primes $pr q $q $(date)" >> xchk.log
  nice -n 15 python3 chordgen.py --primes $pr --q $q --workers 8 --check $Z/$dir --strays $tag.chord.strays >> $tag.chord.out 2>&1
  tail -3 $tag.chord.out >> xchk.log
  nice -n 15 python3 holegen.py --primes $pr --q $q --workers 8 --check $Z/$dir >> $tag.hole.out 2>&1
  tail -3 $tag.hole.out >> xchk.log
}
run l7q729   "3 5 7"           729 l7q729_on
run l13q243  "3 5 7 11 13"     243 l13q243_on
run l17q243  "3 5 7 11 13 17"  243 l17q243_on
run l11q405  "3 5 7 11"        405 l11q405_on
echo "XCHK DONE $(date)" >> xchk.log
