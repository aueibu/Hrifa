#!/bin/bash
# Pack the results we keep into xz archives (new folder; nothing is deleted or moved).
# proven/: shape-free enumeration family lists; ladder/: factor-search union lists + logs; factor_struct/: exact factorization tables.
set -u
A=~/zruns/archive_2026-11-23; mkdir -p $A/proven $A/ladder $A/factor_struct; cd ~/zruns/zprod
pack() {  # out.tar.xz files...
  local out=$1; shift
  tar -cf - "$@" 2>/dev/null | xz -9 -T16 > $out
}
for d in ev2_5q729 e5q2187_on e5q3645_on ev2_7q243 e7q315_on ev2_11q135 en13q135 en17q135 e19q135_on en7_7q2187 en7_11q1215 en7_13q729; do
  pack $A/proven/$d.tar.xz $d/k*/families.jsonl $d.out
done
for d in l5q1215_on l5q2187_on l5q3645_on l7q315_on l7q405_on l7q729_on l11q243_on l11q405_on l13q243_on l17q243_on l19q135_on l5q729_rs_v6 l7q243_rs_v6 l11q135_rs l13q135_rs l17q135_rs; do
  [ -d $d ] && pack $A/ladder/$d.tar.xz $d/union_k*.jsonl $d.out $d/*.out
done
pack $A/factor_struct/factor_struct.tar.xz factor_struct/*.tsv factor_struct/*.txt factor_struct/*.out
cp overnight.out $A/overnight.out
cd $A && find . -name '*.tar.xz' -o -name '*.out' | sort | xargs md5sum > MD5SUMS
du -sh $A $A/proven $A/ladder $A/factor_struct
echo PACK DONE
