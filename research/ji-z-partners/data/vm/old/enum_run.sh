#!/bin/bash
# Shape-free enumeration (zprod-rs --enum via zprod_rs.py --enumerate), then verify and compare with a factor-search
# ladder family for family. usage: bash enum_run.sh "PRIMES" Q TAG REFTAG [K list]   (REFTAG: ladder dir in ~/zruns/zprod)
PRIMES=$1; Q=$2; TAG=$3; REF=$4; KS=${5:-"6 7 8 9 10 11 12 13 14 15 16"}
export ZPROD_RS=${ZPROD_RS:-~/zgen/zprod-rs-bin8}
D=~/zruns/zprod/$TAG; cd ~/zruns/zprod
t=$(date +%s); echo "$(date +%H:%M) $TAG start"
pypy3 ~/zgen/zprod_rs.py --fast --enumerate --zgen ~/zgen/zgen_v4.py --primes $PRIMES --interval-odd $Q --workers 16 \
  --no-types --mem-gb ${MEMGB:-6} --out $D --k $KS > $D.out 2>&1
RC=$?
echo "$(date +%H:%M) $TAG enumeration exit $RC in $(( $(date +%s) - t ))s"
grep -h '  k=' $D.out
for k in $KS; do
  f=$D/k$k/families.jsonl; [ -f $f ] || continue
  pypy3 ~/zgen/verify_families.py ~/zgen/zgen_v4.py $f | tail -1
  if [ -f $REF/union_k$k.jsonl ]; then
    python3 ~/zgen/usesp.py $f | grep -v '^#' | cut -d' ' -f1,4- | sort > /tmp/en_a
    python3 ~/zgen/usesp.py $REF/union_k$k.jsonl | grep -v '^#' | cut -d' ' -f1,4- | sort > /tmp/en_b
    echo "k$k: enumeration $(wc -l < /tmp/en_a), factor search $(wc -l < /tmp/en_b), only in enumeration $(comm -23 /tmp/en_a /tmp/en_b | wc -l), only in factor search $(comm -13 /tmp/en_a /tmp/en_b | wc -l)"
  else
    echo "k$k: enumeration $(grep -c . $f) families (no factor-search list for this size)"
  fi
done
# 2026-11-25: success only with exit 0 and summary.csv (the old line printed DONE after panics and kills)
if [ "$RC" = 0 ] && [ -f $D/summary.csv ]; then echo "$TAG ENUM DONE"; else echo "$TAG ENUM FAILED (exit $RC, summary.csv missing or run broken)"; exit 1; fi
