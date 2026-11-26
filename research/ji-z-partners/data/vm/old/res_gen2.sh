#!/bin/bash
# Residue generator, final shape set (THEORY_SMALL_FACTOR.md 6.8), no node budget, 5-limit, given q.
# Validated at q 3645: rebuilds exactly the 9 proven residue families.
# usage: W=8 bash res_gen2.sh 6561   log ~/zruns/zprod/chordsum/res_gen2.out
W=${W:-8}; q=${1:-6561}
O=~/zruns/zprod/chordsum/resgen2; mkdir -p $O; cd ~/zruns/zprod
run() {
  n=$1; shift; R=$O/${n}_q$q; rm -rf $R; t=$(date +%s)
  ZPROD_RS=~/zgen/zprod-rs-bin13 timeout 5400 pypy3 ~/zgen/zprod_rs3.py --fast --zgen ~/zgen/zgen_v4.py --primes 3 5 \
    --interval-odd $q --workers $W --no-types --k 12 13 14 15 16 --max-nodes 0 --out $R "$@" > $R.out 2>&1
  echo "$(TZ=America/New_York date +%H:%M) resgen2 q$q $n: exit $? $(( $(date +%s) - t ))s $(grep -h 'WARNING\|ERROR' $R.out | cut -c1-90 | tr '\n' ' ')" >> $O/../res_gen2.out
}
run w21c2 --shapes 2,1 --ucoeffs 0 1 2 --max-neg 0
run c30n4 --shapes 3,0 --ucoeffs -1 0 1 2 --max-neg 4
run s31n2 --shapes 3,1 --ucoeffs -1 0 1 --max-neg 2
run v31m2 --shapes 3,1 --ucoeffs 0 1 2 --max-neg 0 --vminus2
run s51n1 --shapes 5,1 --ucoeffs -1 0 1 --max-neg 1
run s52n2 --shapes 5,2 --ucoeffs -1 0 1 --max-neg 2
(cd ~/zgen && PYTHONPATH=~/pylib python3 resclass.py $O/residue_q$q.jsonl $O/*_q$q) 2>> $O/../res_gen2.out
echo "RES GEN2 DONE q$q" >> $O/../res_gen2.out
