#!/bin/bash
# Chord-sum test (chordsum_fs.py) on every proven list; one tsv + summary per list.
# usage: bash cs_all.sh   (log: ~/zruns/zprod/chordsum/cs_all.out)
O=~/zruns/zprod/chordsum; mkdir -p $O; cd ~/zruns/zprod
for spec in 19q135:e19q135_on 5q729:ev2_5q729 7q243:ev2_7q243 11q135:ev2_11q135 13q135:en13q135 17q135:en17q135 7q315:e7q315_on 5q2187:e5q2187_on 5q3645:e5q3645_on; do
  lab=${spec%%:*}; d=${spec##*:}
  cat $d/k*/families.jsonl > $O/in_$lab.jsonl
  t=$(date +%s)
  PYTHONPATH=~/pylib python3 ~/zgen/chordsum_fs.py $lab $O/in_$lab.jsonl --workers 16 > $O/$lab.tsv 2> $O/$lab.sum
  echo "$(TZ=America/New_York date +%H:%M) $lab: $(( $(date +%s) - t ))s; $(head -1 $O/$lab.sum)" >> $O/cs_all.out
  rm -f $O/in_$lab.jsonl
done
echo "CS ALL DONE" >> $O/cs_all.out
