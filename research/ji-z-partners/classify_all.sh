#!/bin/bash
# VM: exclusive classification (chord sum, hole, merge, wide, left) of every family in the nine proven lists.
# Needs the outputs of cs_all.sh, hole_all.sh, merge_all.sh, overlap (ov_*), wide_all.sh and chordneg4 (5-limit q 3,645).
O=~/zruns/zprod/chordsum; cd ~/zgen; : > $O/classify_all.out
for spec in "19q135:e19q135_on:3,5,7,11,13,17,19" "11q135:ev2_11q135:3,5,7,11" "13q135:en13q135:3,5,7,11,13" \
            "17q135:en17q135:3,5,7,11,13,17" "5q729:ev2_5q729:3,5" "7q243:ev2_7q243:3,5,7" "7q315:e7q315_on:3,5,7" \
            "5q2187:e5q2187_on:3,5" "5q3645:e5q3645_on:3,5"; do
  IFS=: read lab d pr <<< "$spec"
  wide=""
  for w in chordneg_$lab s1_$lab chordneg4_$lab; do [ -d $O/$w ] && wide="$wide,$O/$w"; done
  wide=${wide#,}
  python3 union_cov.py ~/zruns/zprod/$d $pr $O/$lab.tsv $O/hole_$lab.jsonl $O/merge_$lab $O/ov_$lab.tsv \
    --wide "$wide" --classify $O/class_$lab.tsv 2>&1 | grep -A6 CLASSIFY >> $O/classify_all.out
done
echo "CLASSIFY ALL DONE" >> $O/classify_all.out
