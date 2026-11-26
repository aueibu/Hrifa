#!/bin/bash
# VM: rerun the two 5-term ladder steps that still have factors stopped at the node budget, with no budget
# (11-limit q 405: 280 stopped; 17-limit q 243: 34,960 stopped; nb_chain.sh capped these at 1,800 s).
# Waits for xchk (the generator cross-check) so the two do not compete. Output is new folders under ~/zruns/zexp/xnb;
# the old rung folders are not touched. Compare products.jsonl counts and families with the rung's union afterwards.
export ZPROD_RS=~/zgen/zprod-rs-bin14
mkdir -p ~/zruns/zexp/xnb && cd ~/zruns/zexp/xnb || exit 1
until grep -q "XCHK DONE" ~/zruns/zexp/xchk/xchk.log 2>/dev/null; do sleep 60; done
KS="6 7 8 9 10 11 12 13 14 15 16"
run() {  # tag primes q
  echo "== $1 five no budget start $(date)" >> xnb.log
  timeout 10800 pypy3 ~/zgen/zprod_rs4.py --fast --zgen ~/zgen/zgen_v4.py --primes $2 --interval-odd $3 \
    --workers 16 --no-types --max-nodes 0 --out $1_five_nb --k $KS --shapes 5,1 5,2 > $1_five_nb.out 2>&1
  echo "== $1 exit $? $(date)" >> xnb.log
  grep -h "stopped at the node budget" $1_five_nb.out | tail -1 >> xnb.log
}
run l11q405 "3 5 7 11" 405
run l17q243 "3 5 7 11 13 17" 243
echo "XNB DONE $(date)" >> xnb.log
