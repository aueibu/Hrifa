#!/bin/bash
# k 8 min-dim 2 with --dedup-min-dim 5, 6, 0 (2026-11-26): time, nodes, classes stored, 4 maximal classes
B=~/zgen/typeflats-rs/target/release/typeflats-rs
cd ~/zruns/mem
for D in 5 6 0; do
  echo "=== K8: 8 --min-dim 2 --fast --canon2 --dedup-min-dim $D (D 4: 1111 s, 438 M nodes, 182 M stored)"
  $B 8 --threads 64 --frontier 50000 --min-dim 2 --fast --canon2 --dedup-min-dim $D --out k8_$D.json 2>&1 | grep -E "^k |panicked" | sed 's/cut at the parent.*good/good/'
done
echo "MEM2 DONE"
