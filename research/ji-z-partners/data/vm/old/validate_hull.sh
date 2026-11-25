#!/usr/bin/env bash
# Rerun the full 5-limit odd 123 recipe with hull-pruned factors; compare with the exhaustive families.
set -u
cd ~/zruns/zprod || exit 1
Z="nice -n 10 pypy3 $HOME/zgen/zprod.py --zgen $HOME/zgen/zgen_v4.py --primes 3 5 --odd 123 --workers 6"
rm -rf h5_a h5_b h5_c h5_d h5_union; mkdir -p h5_union
t0=$SECONDS
$Z --k 10 11 13 14 --out h5_a > h5_a.out 2>&1
$Z --k 10 13 14 --shapes 3,1 4,1 4,2 --ucoeffs -1 0 1 2 --max-neg 1 --out h5_b > h5_b.out 2>&1
$Z --k 10 13 14 --shapes 2,1 3,2 --ucoeffs -1 0 1 2 --max-neg 1 --out h5_c > h5_c.out 2>&1
$Z --k 10 13 14 --shapes 3,1 --ucoeffs -1 0 1 2 --max-neg 2 --out h5_d > h5_d.out 2>&1
echo "all four runs: $((SECONDS - t0))s"
grep -h "WARNING" h5_?/run.log
for k in 10 11 13 14; do
  ref=exh_k$k.jsonl; [ $k = 10 ] && ref=$HOME/zruns/d1_k10-14_v2/exh_5lim_odd123_k10/families.jsonl
  files=$(ls h5_?/k$k/families.jsonl 2>/dev/null)
  echo "k=$k: $(python3 ~/zgen/union_fams.py h5_union/k$k.jsonl $files --ref $ref | tail -1)"
done
echo VALIDATE DONE
