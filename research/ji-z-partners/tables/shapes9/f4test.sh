#!/bin/bash
# fourth-power prune test (2026-11-26)
cd ~/zgen/typeflats-rs
~/.cargo/bin/cargo build --release 2>&1 | tail -2
B=~/zgen/typeflats-rs/target/release/typeflats-rs
mkdir -p ~/zruns/f4test && cd ~/zruns/f4test
echo "=== A: k 5 --single (expect 17124 nodes, 13363 bad)"
$B 5 --single --f4 0 | grep "^k 5"
for K in 6 7; do
  for M in 0 4 6 8; do
    echo "=== B: k $K --min-dim 2 --f4 $M"
    $B $K --threads 64 --min-dim 2 --f4 $M --out k${K}_f4_$M.json > k${K}_f4_$M.log 2>&1
    grep -A4 "^k $K" k${K}_f4_$M.log | head -3
  done
done
for M in 6 10; do
  echo "=== C: k 8 --min-dim 3 --f4 $M (baseline 941 s, 0 types)"
  $B 8 --threads 64 --frontier 50000 --min-dim 3 --f4 $M --out k8d3_f4_$M.json > k8d3_f4_$M.log 2>&1
  grep "^k 8" k8d3_f4_$M.log
done
echo "F4TEST DONE"
