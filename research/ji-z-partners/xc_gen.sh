#!/bin/bash
# VM: step c of the ladder work: chord-sum and hole generators past the ladder's q (12, 15, 16 notes mostly).
# Targets (limit, q): 7-limit 1215 (ladder 729), 11-limit 729 (ladder 405), 13-limit 405 (243), 17-limit 405 (243), 19-limit 243 (proven 135).
# Each generator has a 90-minute cap; a capped run is logged and its (partial) file is not trusted.
# Results are lower bounds (generators cover chord sums and holes only); verify with verify_strays.py afterwards.
cd ~/zruns/zexp/xchk || exit 1
mkdir -p xc && cd xc || exit 1
cp ../chordgen.py ../holegen2.py .
run() {  # tag primes q
  tag=$1; pr=$2; q=$3
  for g in chord hole; do
    s=$(date +%s)
    if [ $g = chord ]; then cmd="python3 chordgen.py --primes $pr --q $q --workers 24 --out $tag.chord.jsonl"
    else cmd="python3 holegen2.py --primes $pr --q $q --workers 24 --out $tag.hole.jsonl"; fi
    timeout 5400 nice -n 15 $cmd > $tag.$g.out 2>&1
    e=$?
    echo "$tag $g exit $e $(( $(date +%s) - s )) s $(tail -2 $tag.$g.out | tr '\n' ' ' | cut -c1-200)" >> xc.log
  done
}
run l7q1215  "3 5 7"           1215
run l11q729  "3 5 7 11"        729
run l13q405  "3 5 7 11 13"     405
run l17q405  "3 5 7 11 13 17"  405
run l19q243  "3 5 7 11 13 17 19" 243
echo "XC DONE $(date)" >> xc.log
