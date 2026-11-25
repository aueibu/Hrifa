#!/bin/bash
# union_cov.py on every proven list (needs cs_all.sh, ov_all.sh, hole_all.sh, merge_all.sh outputs)
O=~/zruns/zprod/chordsum; cd ~/zgen; : > $O/union_all.out
for spec in "19q135:e19q135_on:3,5,7,11,13,17,19" "11q135:ev2_11q135:3,5,7,11" "13q135:en13q135:3,5,7,11,13" \
            "17q135:en17q135:3,5,7,11,13,17" "5q729:ev2_5q729:3,5" "7q243:ev2_7q243:3,5,7" "7q315:e7q315_on:3,5,7" \
            "5q2187:e5q2187_on:3,5" "5q3645:e5q3645_on:3,5"; do
  IFS=: read lab d pr <<< "$spec"
  python3 union_cov.py ~/zruns/zprod/$d $pr $O/$lab.tsv $O/hole_$lab.jsonl $O/merge_$lab $O/ov_$lab.tsv \
    --left $O/left_$lab.tsv >> $O/union_all.out
done
echo "UNION ALL DONE" >> $O/union_all.out
