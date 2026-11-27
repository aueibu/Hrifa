#!/bin/bash
# class table once per flat + --dedup-min-dim sweep (2026-11-26)
cd ~/zgen/typeflats-rs
~/.cargo/bin/cargo build --release 2>&1 | grep -E "^error|Finished" | head -20
B=~/zgen/typeflats-rs/target/release/typeflats-rs
mkdir -p ~/zruns/mem && cd ~/zruns/mem
S='s/cut at the parent.*good/good/'
for t in "5 --single:2061" "6 --single --min-dim 2:6487" "6 --single --fast:208166"; do
  args=${t%%:*}; want=${t##*:}
  echo "=== SAME: $args --canon2 (want $want dups)"
  $B $args --canon2 --out x.json 2>&1 | grep -E "^k |panicked" | sed "$S"
done
for D in 0 3 4 5; do
  echo "=== SWEEP: 7 --min-dim 2 --fast --canon2 --dedup-min-dim $D"
  $B 7 --threads 64 --min-dim 2 --fast --canon2 --dedup-min-dim $D --out k7.json 2>&1 | grep -E "^k |panicked" | sed "$S"
done
for D in 4 3; do
  echo "=== K8: 8 --min-dim 2 --fast --canon2 --dedup-min-dim $D (was 1998 s, 4 classes)"
  $B 8 --threads 64 --frontier 50000 --min-dim 2 --fast --canon2 --dedup-min-dim $D --out k8_$D.json 2>&1 | grep -E "^k |panicked" | sed "$S"
done
echo "MEM DONE"
