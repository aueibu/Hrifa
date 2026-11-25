#!/bin/bash
# Merge construction check: zprod-rs factor search with small signed factors (3,1 4,1 4,2), plain second
# factor, no node budget, on every proven list; merge_cmp.py compares with overlap.py's descriptions.
# usage: bash merge_all.sh [LABEL:DIR:PRIMES ...]   log ~/zruns/zprod/chordsum/merge_all.out
O=~/zruns/zprod/chordsum; cd ~/zruns/zprod
specs=("$@")
[ ${#specs[@]} -eq 0 ] && specs=("19q135:e19q135_on:3 5 7 11 13 17 19" "11q135:ev2_11q135:3 5 7 11" \
  "13q135:en13q135:3 5 7 11 13" "17q135:en17q135:3 5 7 11 13 17" "5q729:ev2_5q729:3 5" "7q243:ev2_7q243:3 5 7" \
  "7q315:e7q315_on:3 5 7" "5q2187:e5q2187_on:3 5" "5q3645:e5q3645_on:3 5")
for spec in "${specs[@]}"; do
  IFS=: read lab d pr <<< "$spec"
  q=${lab#*q}
  R=$O/merge_$lab; rm -rf $R
  t=$(date +%s)
  ZPROD_RS=~/zgen/zprod-rs-bin12 timeout 3600 pypy3 ~/zgen/zprod_rs2.py --fast --zgen ~/zgen/zgen_v4.py --primes $pr \
    --interval-odd $q --workers 16 --no-types --k 6 7 8 9 10 11 12 13 14 15 16 --shapes 3,1 4,1 4,2 \
    --ucoeffs 0 1 --max-neg 0 --max-nodes 0 --out $R > $R.out 2>&1
  e=$?
  echo "$(TZ=America/New_York date +%H:%M) $lab: exit $e $(( $(date +%s) - t ))s; $(grep -h 'WARNING\|ERROR' $R.out | cut -c1-80 | tr '\n' ' ') $(cd ~/zgen && python3 merge_cmp.py $R ~/zruns/zprod/$d $O/ov_$lab.tsv | tr '\n' ' ')" >> $O/merge_all.out
done
echo "MERGE ALL DONE" >> $O/merge_all.out
