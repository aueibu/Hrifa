#!/bin/bash
# Wider constructions on the 5-limit proven lists, no node budget:
#   chordneg: plain 3-, 4-, 5-note chord times a factor with up to 3 minus signs (multi-hole / multi-merge)
#   s1:       small factor 2,1 / 3,2 (weight 1: the prime-size families) times a plain set
# then union_cov.py with every run. log ~/zruns/zprod/chordsum/wide_all.out
O=~/zruns/zprod/chordsum; cd ~/zruns/zprod
run() {  # label dir name args...
  lab=$1; d=$2; n=$3; shift 3; q=${lab#*q}; R=$O/${n}_$lab; rm -rf $R; t=$(date +%s)
  ZPROD_RS=~/zgen/zprod-rs-bin12 timeout 3600 pypy3 ~/zgen/zprod_rs2.py --fast --zgen ~/zgen/zgen_v4.py --primes 3 5 \
    --interval-odd $q --workers 16 --no-types --k 6 7 8 9 10 11 12 13 14 15 16 --max-nodes 0 --out $R "$@" > $R.out 2>&1
  echo "$(TZ=America/New_York date +%H:%M) $n $lab: exit $? $(( $(date +%s) - t ))s $(grep -h 'WARNING\|ERROR' $R.out | cut -c1-80 | tr '\n' ' ')" >> $O/wide_all.out
}
for spec in 5q729:ev2_5q729 5q2187:e5q2187_on 5q3645:e5q3645_on; do
  IFS=: read lab d <<< "$spec"
  run $lab $d chordneg --shapes 3,0 4,0 5,0 --ucoeffs -1 0 1 --max-neg 3
  run $lab $d s1 --shapes 2,1 3,2 --ucoeffs 0 1 --max-neg 0
  (cd ~/zgen && python3 union_cov.py ~/zruns/zprod/$d 3,5 $O/$lab.tsv $O/hole_$lab.jsonl \
     $O/merge_$lab,$O/chordneg_$lab,$O/s1_$lab $O/ov_$lab.tsv --left $O/left2_$lab.tsv) >> $O/wide_all.out
done
echo "WIDE ALL DONE" >> $O/wide_all.out
