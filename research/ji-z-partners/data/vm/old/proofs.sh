#!/bin/bash
# Enumeration proofs at low CPU priority (nice 19), bin12. Jobs come from ~/zruns/zprod/proof_queue.txt, one per line:
#   PRIMES|Q|TAG|REFTAG     (REFTAG: ladder dir to compare with, or "none")
# Lines may be appended while this runs; a job is done when TAG.check ends with ENUM DONE. Stops after STOP_AT (HHMM, UTC).
# Summary lines -> ~/zruns/zprod/overnight.out (prefix PROOF).
# usage: bash proofs.sh
cd ~/zruns/zprod; LOG=~/zruns/zprod/overnight.out; STOP_AT=${STOP_AT:-1415}
export ZPROD_RS=~/zgen/zprod-rs-bin12 MEMGB=16
touch proof_queue.txt
while [ "$(date +%H%M)" -lt "$STOP_AT" ]; do
  job=""
  while IFS='|' read -r pr q tag ref; do
    [ -z "$tag" ] && continue
    grep -q 'ENUM DONE' $tag.check 2>/dev/null && continue
    [ -f $tag.started ] && continue
    job="$pr|$q|$tag|$ref"; break
  done < proof_queue.txt
  if [ -z "$job" ]; then sleep 60; continue; fi
  IFS='|' read -r pr q tag ref <<< "$job"
  touch $tag.started; t=$(date +%s)
  echo "$(date +%H:%M) PROOF $tag start (primes $pr, q $q)" >> $LOG
  nice -n 19 bash ~/zgen/enum_run.sh "$pr" $q $tag $ref > $tag.check 2>&1
  fams=$(grep -h 'families by interval content' $tag.check | sed -E 's|.*/(k[0-9]+)/families.jsonl: ([0-9]+) families.*|\1:\2|' | grep -v ':0$' | tr '\n' ' ')
  diffs=$(grep '^k[0-9]*: enumeration [0-9]*, factor search' $tag.check | grep -vc 'only in enumeration 0, only in factor search 0')
  bad=$(grep -h 'families by interval content' $tag.check | grep -vc ', 0 bad')
  echo "$(date +%H:%M) PROOF $tag done in $(( $(date +%s) - t ))s: $(grep -h 'enumeration exit' $tag.check | sed 's/.*enumeration //'); families $fams; total $(cat $tag/k*/families.jsonl 2>/dev/null | wc -l); files with bad: $bad; sizes differing from $ref: $diffs" >> $LOG
done
echo "$(date +%H:%M) PROOFS STOPPED (STOP_AT)" >> $LOG
