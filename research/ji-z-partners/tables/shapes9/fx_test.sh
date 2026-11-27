#!/bin/bash
# fast hasher (+ optional mimalloc) + the untested stats code (2026-11-26 late; human: "code fix, yes")
# 1) exactness: --single k 5 and k 6 min-dim 2 must give the old dups / good nodes (2,061; 6,487 dups, 13,046 good)
# 2) speed: k 8 min-dim 2 --dedup-min-dim 5, 64 threads (baseline 1,049 s, 512,224,269 nodes, 4 maximal classes)
# 3) stats: the mimalloc run also writes --sample-out (every 100,000th distinct good flat)
cd ~/zgen/typeflats-rs
~/.cargo/bin/cargo build --release 2>&1 | tail -2
CARGO_TARGET_DIR=target-mi ~/.cargo/bin/cargo build --release --features mimalloc 2>&1 | tail -2
FX=~/zgen/typeflats-rs/target/release/typeflats-rs
MI=~/zgen/typeflats-rs/target-mi/release/typeflats-rs
mkdir -p ~/zruns/fx && cd ~/zruns/fx
for B in $FX $MI; do
  echo "=== single checks with $B"
  $B 5 --single --fast --canon2 2>&1 | grep -E "^k |panicked|good flats|dim " | head -12
  $B 6 --single --min-dim 2 --fast --canon2 2>&1 | grep -E "^k |panicked|good flats|dim " | head -12
done
echo "=== K8 FX: 8 --min-dim 2 --fast --canon2 --dedup-min-dim 5 (baseline 1,049 s)"
$FX 8 --threads 64 --frontier 50000 --min-dim 2 --fast --canon2 --dedup-min-dim 5 --out k8_fx.json 2>&1 | grep -E "^k |panicked|good flats|dim " | sed 's/cut at the parent.*good/good/'
echo "=== K8 MI: same + mimalloc + --sample-out"
$MI 8 --threads 64 --frontier 50000 --min-dim 2 --fast --canon2 --dedup-min-dim 5 --sample-out ~/zruns/fx/k8samp.jsonl --sample-every 100000 --out k8_mi.json 2>&1 | grep -E "^k |panicked|good flats|dim " | sed 's/cut at the parent.*good/good/'
wc -l ~/zruns/fx/k8samp.jsonl
echo "FX DONE"
