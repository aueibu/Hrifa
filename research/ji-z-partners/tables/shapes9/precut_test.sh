#!/bin/bash
# parent-side cut test (2026-11-26); waits for the f4 test to finish
until grep -q "F4TEST DONE" ~/zruns/f4test.log; do sleep 10; done
cd ~/zgen/typeflats-rs
~/.cargo/bin/cargo build --release 2>&1 | tail -2
B=~/zgen/typeflats-rs/target/release/typeflats-rs
mkdir -p ~/zruns/precut && cd ~/zruns/precut
for args in "5 --single" "6 --single --min-dim 2"; do
  for pc in "" "--precut"; do
    echo "=== A: $args $pc"
    $B $args $pc | grep "^k "
  done
done
for pc in "" "--precut"; do
  echo "=== B: 7 --threads 64 --min-dim 2 $pc"
  $B 7 --threads 64 --min-dim 2 $pc --out k7$pc.json 2>&1 | grep -A2 "^k 7"
done
echo "=== C: 8 --threads 64 --frontier 50000 --min-dim 3 --precut (no-precut: 907 s with --f4 6)"
$B 8 --threads 64 --frontier 50000 --min-dim 3 --precut --out k8d3.json 2>&1 | grep "^k 8"
echo "PRECUT DONE"
