#!/bin/bash
# chordgen.py against every proven list: generated chord sums must equal the chord sums chordsum_fs.py marked.
# usage: bash gen_check.sh   (log: ~/zruns/zprod/chordsum/gen_check.out; needs cs_all.sh's tsvs)
O=~/zruns/zprod/chordsum; cd ~/zruns/zprod
for spec in "11q135:ev2_11q135:3 5 7 11" "13q135:en13q135:3 5 7 11 13" "17q135:en17q135:3 5 7 11 13 17" \
            "19q135:e19q135_on:3 5 7 11 13 17 19" "5q729:ev2_5q729:3 5" "7q243:ev2_7q243:3 5 7" \
            "7q315:e7q315_on:3 5 7" "5q2187:e5q2187_on:3 5" "5q3645:e5q3645_on:3 5"; do
  IFS=: read lab d pr <<< "$spec"
  q=${lab#*q}
  t=$(date +%s)
  python3 ~/zgen/chordgen.py --primes $pr --q $q --workers 16 --out $O/gen_$lab.jsonl --check $d --tsv $O/$lab.tsv \
    2> $O/gen_$lab.sum
  echo "$(TZ=America/New_York date +%H:%M) $lab: $(( $(date +%s) - t ))s; $(grep -h '^# chord sums\|^# check' $O/gen_$lab.sum | tr '\n' ' ')" >> $O/gen_check.out
done
echo "GEN CHECK DONE" >> $O/gen_check.out
