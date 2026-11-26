#!/bin/bash
# cheap child check (--fast) test (2026-11-26)
cd ~/zgen/typeflats-rs
~/.cargo/bin/cargo build --release 2>&1 | grep -E "^error|warning: unused|Finished" | head -20
B=~/zgen/typeflats-rs/target/release/typeflats-rs
mkdir -p ~/zruns/fast && cd ~/zruns/fast
for args in "5 --single" "6 --single --min-dim 2" "6 --single" "7 --threads 64 --min-dim 3" "7 --threads 64 --min-dim 2"; do
  echo "=== CHECK: $args --check-fast"
  $B $args --check-fast --out chk.json 2>&1 | grep -E "^k |panicked|mismatch"
done
for args in "5 --single" "6 --single --min-dim 2"; do
  echo "=== EXACT: $args --fast (expect good nodes 3761 / 13046)"
  $B $args --fast 2>&1 | grep -E "^k |panicked"
done
echo "=== SPEED: 7 --threads 64 --min-dim 2 --fast (was 54 s)"
$B 7 --threads 64 --min-dim 2 --fast --out k7.json 2>&1 | grep -E "^k |panicked|  dim"
echo "=== SPEED: 8 --threads 64 --frontier 50000 --min-dim 3 --fast (was 904 s)"
$B 8 --threads 64 --frontier 50000 --min-dim 3 --fast --out k8d3.json 2>&1 | grep -E "^k |panicked"
echo "FAST DONE"
