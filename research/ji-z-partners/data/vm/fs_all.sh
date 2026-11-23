#!/bin/bash
# Exact factor structure (factor_struct.py) of every proven list; one tsv + summary per list.
# usage: bash fs_all.sh   (logs to ~/zruns/zprod/factor_struct/fs_all.out)
O=~/zruns/zprod/factor_struct; mkdir -p $O; cd ~/zruns/zprod
for spec in 5q729:ev2_5q729 7q243:ev2_7q243 11q135:ev2_11q135 13q135:en13q135 17q135:en17q135 19q135:e19q135_on 7q315:e7q315_on 5q2187:e5q2187_on 5q3645:e5q3645_on; do
  lab=${spec%%:*}; d=${spec##*:}
  cat $d/k*/families.jsonl > $O/in_$lab.jsonl
  t=$(date +%s)
  PYTHONPATH=~/pylib python3 ~/zgen/factor_struct.py $O/in_$lab.jsonl --workers 16 > $O/$lab.tsv 2> $O/$lab.sum
  echo "$(date +%H:%M) $lab: $(wc -l < $O/in_$lab.jsonl) families in $(( $(date +%s) - t ))s; $(grep -h 'flipped factors\|check\|error' $O/$lab.sum | tr '\n' ' ')" >> $O/fs_all.out
  rm -f $O/in_$lab.jsonl
done
echo "FS ALL DONE" >> $O/fs_all.out
