#!/bin/bash
# VM: explorer data with 6-8 notes exact (patterns, 23-limit, q <= 531,441) and the 2,309 verified hole families (2026-11-26) as ladder rows.
# Self-check inside explorer_data.py: in every proven rectangle overlapping the exact coverage, pattern families = proven families.
W=$HOME/zruns/zexp
B=$HOME/zruns/bsr
cd $W
mkdir -p out/final2
python3 explorer_data.py data/proven out/final2/explorer_all.json --members --ladder ladder \
  --extra tables/chordsum/gen_11q405.strays.jsonl --extra xchk/new_extras.jsonl \
  --exact $B/k6_l23_q531441.jsonl $B/k7_l23_q531441.jsonl $B/k8_l23_q531441.jsonl --exact-coverage 23:531441:6-8 \
  || { echo "DATA2 FAILED $(date)" >> run.log; exit 1; }
rm -rf out/final2/pack
python3 explorer_pack.py out/final2/explorer_all.json out/final2/pack || { echo "PACK2 FAILED $(date)" >> run.log; exit 1; }
python3 verify.py out/final2/pack
echo "ALL2 DONE $(date)" >> run.log
