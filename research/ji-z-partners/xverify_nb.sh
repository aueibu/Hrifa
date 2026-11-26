#!/bin/bash
# VM: are the families of the no-budget 5-term reruns already in the explorer data?
cd ~/zruns/zexp || exit 1
python3 conv_nb.py xnb/l11q405_five_nb xnb/l11q405_five_nb.ext.jsonl
python3 conv_nb.py xnb/l17q243_five_nb xnb/l17q243_five_nb.ext.jsonl
nice -n 10 python3 verify_strays.py out/final2/explorer_all.json xnb/new_nb.jsonl \
  xnb/l11q405_five_nb.ext.jsonl:11:405 xnb/l17q243_five_nb.ext.jsonl:17:243 > xnb/verify_nb.out 2>&1
echo "VERIFYNB DONE $(date)" >> xchk/xchk.log
