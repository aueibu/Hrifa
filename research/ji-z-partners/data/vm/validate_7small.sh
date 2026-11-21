#!/usr/bin/env bash
# Validate zprod in 3-D: 7-limit gamuts with known exhaustive counts (handoff table):
#   odd 27: k6 3, k7 0     odd 63: k6 19     odd 75: k6 20, k7 2, k8 8
set -u
W=${W:-4}
cd ~/zruns/zprod || exit 1
run_gamut() { # odd ks...
  local odd=$1; shift
  local Z="nice -n 10 pypy3 $HOME/zgen/zprod.py --zgen $HOME/zgen/zgen_v4.py --primes 3 5 7 --odd $odd --workers $W"
  local base=v7_odd$odd
  rm -rf ${base}_*; mkdir -p ${base}_union
  local t0=$SECONDS
  $Z --k "$@" --out ${base}_a > /dev/null 2>&1
  $Z --k "$@" --shapes 3,1 4,1 4,2 --ucoeffs -1 0 1 2 --max-neg 1 --out ${base}_b > /dev/null 2>&1
  $Z --k "$@" --shapes 2,1 3,2 --ucoeffs -1 0 1 2 --max-neg 1 --out ${base}_c > /dev/null 2>&1
  $Z --k "$@" --shapes 3,1 --ucoeffs -1 0 1 2 --max-neg 2 --out ${base}_d > /dev/null 2>&1
  grep -h WARNING ${base}_?/run.log
  for k in "$@"; do
    echo "odd $odd k=$k: $(python3 ~/zgen/union_fams.py ${base}_union/k$k.jsonl $(ls ${base}_?/k$k/families.jsonl) | tail -1)"
  done
  echo "odd $odd: $((SECONDS - t0))s"
}
run_gamut 27 6 7
run_gamut 63 6
run_gamut 75 6 7 8
echo VALIDATE7 DONE
