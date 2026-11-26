#!/bin/bash
# VM: verify the generator strays independently and list the new, verified families.
cd ~/zruns/zexp || exit 1
X=~/zruns/zexp/xchk
nice -n 10 python3 verify_strays.py out/final/explorer_all.json xchk/new_extras.jsonl \
  $X/l7q729.hole.strays:7:729 $X/l11q405.hole.strays:11:405 $X/l17q243.hole.strays:17:243 $X/l11q405.chord.strays:11:405 > xchk/verify.out 2>&1
echo "VERIFY DONE $(date)" >> xchk/xchk.log
