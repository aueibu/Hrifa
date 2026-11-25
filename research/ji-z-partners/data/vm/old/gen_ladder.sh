#!/bin/bash
# chordgen.py at the highest ladder rungs: chord sums the ladder missed are written to gen_<lab>.strays.
# usage: bash gen_ladder.sh   (log: ~/zruns/zprod/chordsum/gen_ladder.out); 60-min cap per rung
O=~/zruns/zprod/chordsum; cd ~/zruns/zprod
for spec in "13q243:l13q243_on:3 5 7 11 13" "17q243:l17q243_on:3 5 7 11 13 17" "7q729:l7q729_on:3 5 7" \
            "11q405:l11q405_on:3 5 7 11"; do
  IFS=: read lab d pr <<< "$spec"
  q=${lab#*q}
  t=$(date +%s)
  timeout 3600 python3 ~/zgen/chordgen.py --primes $pr --q $q --workers 16 --out $O/gen_$lab.jsonl --check $d \
    --strays $O/gen_$lab.strays 2> $O/gen_$lab.sum
  echo "$(TZ=America/New_York date +%H:%M) $lab: exit $? $(( $(date +%s) - t ))s; $(grep -h '^# [0-9]* families\|^# check' $O/gen_$lab.sum | tr '\n' ' ')" >> $O/gen_ladder.out
done
echo "GEN LADDER DONE" >> $O/gen_ladder.out
