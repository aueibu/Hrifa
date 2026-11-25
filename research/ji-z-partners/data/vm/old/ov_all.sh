#!/bin/bash
# overlap.py on the proven lists (leftover families only); one tsv + summary per list.
# usage: bash ov_all.sh [spec ...]   spec = LABEL:DIR (default: all nine); log ~/zruns/zprod/chordsum/ov_all.out
O=~/zruns/zprod/chordsum; mkdir -p $O; cd ~/zruns/zprod
specs="$@"
[ -z "$specs" ] && specs="19q135:e19q135_on 7q315:e7q315_on 5q729:ev2_5q729 7q243:ev2_7q243 11q135:ev2_11q135 13q135:en13q135 17q135:en17q135 5q2187:e5q2187_on 5q3645:e5q3645_on"
for spec in $specs; do
  lab=${spec%%:*}; d=${spec##*:}
  cat $d/k*/families.jsonl > $O/in_$lab.jsonl
  t=$(date +%s)
  (cd ~/zgen && PYTHONPATH=~/pylib python3 ~/zgen/overlap.py $lab $O/in_$lab.jsonl --workers 16 > $O/ov_$lab.tsv 2> $O/ov_$lab.sum)
  echo "$(TZ=America/New_York date +%H:%M) $lab: $(( $(date +%s) - t ))s; $(head -2 $O/ov_$lab.sum | tr '\n' ' ')" >> $O/ov_all.out
  rm -f $O/in_$lab.jsonl
done
echo "OV ALL DONE" >> $O/ov_all.out
