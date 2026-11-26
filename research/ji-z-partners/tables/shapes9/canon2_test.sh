#!/bin/bash
# canon2 test (2026-11-26): same dup counts as canon in --single runs, then speed
cd ~/zgen/typeflats-rs
~/.cargo/bin/cargo build --release 2>&1 | grep -E "^error|^warning|Finished" | head -20
B=~/zgen/typeflats-rs/target/release/typeflats-rs
mkdir -p ~/zruns/canon2 && cd ~/zruns/canon2
for args in "5 --single" "6 --single --min-dim 2" "6 --single --fast"; do
  for c in "" "--canon2"; do
    echo "=== SAME: $args $c"
    $B $args $c --out x.json 2>&1 | grep -E "^k |panicked" | sed 's/cut at the parent.*good/good/'
  done
done
echo "=== SPEED: 7 --threads 64 --min-dim 2 --fast --canon2 (was 42.3 s)"
$B 7 --threads 64 --min-dim 2 --fast --canon2 --out k7.json 2>&1 | grep -E "^k |panicked|  dim"
echo "=== SPEED: 8 --threads 64 --frontier 50000 --min-dim 3 --fast --canon2 (was 860 s)"
$B 8 --threads 64 --frontier 50000 --min-dim 3 --fast --canon2 --out k8d3.json 2>&1 | grep -E "^k |panicked"
echo "CANON2 DONE"
