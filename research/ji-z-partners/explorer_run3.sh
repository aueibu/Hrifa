#!/bin/bash
# VM: explorer data as run2 plus the one new family from the no-budget rerun of the 11-limit q 405 5-term step (xnb/new_nb.jsonl).
W=$HOME/zruns/zexp
B=$HOME/zruns/bsr
cd $W
mkdir -p out/final3
python3 explorer_data.py data/proven out/final3/explorer_all.json --members --ladder ladder \
  --extra tables/chordsum/gen_11q405.strays.jsonl --extra xchk/new_extras.jsonl --extra xnb/new_nb.jsonl \
  --exact $B/k6_l23_q531441.jsonl $B/k7_l23_q531441.jsonl $B/k8_l23_q531441.jsonl --exact-coverage 23:531441:6-8 \
  || { echo "DATA3 FAILED $(date)" >> run.log; exit 1; }
rm -rf out/final3/pack
python3 explorer_pack.py out/final3/explorer_all.json out/final3/pack || { echo "PACK3 FAILED $(date)" >> run.log; exit 1; }
python3 verify.py out/final3/pack
echo "ALL3 DONE $(date)" >> run.log
