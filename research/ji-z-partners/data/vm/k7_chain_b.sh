#!/bin/bash
# After k7_enum_chain.sh: validate bin12 (bitsets to 2,048 vertices) on two complete lists, then, only if every
# size matches the ladder exactly, the 7-note enumeration at 13-limit q <= 1,215 (1,045 vertices; needs bin12).
# usage: bash k7_chain_b.sh >> ~/zruns/zprod/k7_chain_b.out 2>&1
cd ~/zruns/zprod
echo "$(date +%H:%M) waiting for K7 CHAIN DONE"
until grep -q 'K7 CHAIN DONE' k7_enum_chain.out 2>/dev/null; do sleep 60; done
export ZPROD_RS=~/zgen/zprod-rs-bin12 MEMGB=16
ok=1
for spec in "3 5:729:ev12_5q729:l5q729_rs_v6" "3 5 7:243:ev12_7q243:l7q243_rs_v6"; do
  IFS=: read pr q tag ref <<< "$spec"
  bash ~/zgen/enum_run.sh "$pr" $q $tag $ref > $tag.check 2>&1
  cat $tag.check
  grep -q 'enumeration exit 0' $tag.check || ok=0
  grep 'families by interval content' $tag.check | grep -qv ', 0 bad' && ok=0
  grep '^k[0-9]*: enumeration' $tag.check | grep -qv 'only in enumeration 0, only in factor search 0' && ok=0
  [ "$(grep -c '^k[0-9]*: enumeration' $tag.check)" -eq 11 ] || ok=0
done
if [ $ok = 1 ]; then
  echo "$(date +%H:%M) BIN12 VALIDATED (compare times: bin11 7-limit q 243 107 s)"
  echo "13-limit q 1215 k7 deferred (625 B sets; full lists first)"

else
  echo "$(date +%H:%M) BIN12 VALIDATION FAILED: 13-limit q 1215 not run"
fi
echo K7 CHAIN B DONE
