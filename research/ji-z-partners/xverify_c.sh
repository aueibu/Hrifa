#!/bin/bash
# VM: verify the step-c generator output independently (verify_strays.py): hole families in full, chord sums on a 1-in-60 sample.
cd ~/zruns/zexp || exit 1
X=xchk/xc
for t in l7q1215 l11q729 l13q405 l17q405 l19q243; do
  awk 'NR%60==0' $X/$t.chord.jsonl > $X/$t.chord.samp
done
nice -n 10 python3 verify_strays.py out/final2/explorer_all.json xchk/xc/new_c.jsonl \
  $X/l7q1215.hole.jsonl:7:1215 $X/l11q729.hole.jsonl:11:729 $X/l13q405.hole.jsonl:13:405 $X/l17q405.hole.jsonl:17:405 $X/l19q243.hole.jsonl:19:243 \
  $X/l7q1215.chord.samp:7:1215 $X/l11q729.chord.samp:11:729 $X/l13q405.chord.samp:13:405 $X/l17q405.chord.samp:17:405 $X/l19q243.chord.samp:19:243 > xchk/verify_c.out 2>&1
echo "VERIFYC DONE $(date)" >> xchk/xchk.log
