#!/bin/bash
# profile the current code: k 8 --min-dim 2 --fast --canon2 --dedup-min-dim 5, 10 minutes (2026-11-26 late;
# human: "code fix, yes"; the one-table-per-flat fix from prof2 is already in canon2, so: what costs now?)
sudo sysctl -q kernel.perf_event_paranoid=-1
cd ~/zgen/typeflats-rs
CARGO_PROFILE_RELEASE_DEBUG=true CARGO_TARGET_DIR=target-prof ~/.cargo/bin/cargo build --release 2>&1 | tail -1
mkdir -p ~/zruns/prof3 && cd ~/zruns/prof3
perf record -F 299 -g -o perf.data -- timeout 600 ~/zgen/typeflats-rs/target-prof/release/typeflats-rs 8 --threads 32 --frontier 50000 --min-dim 2 --fast --canon2 --dedup-min-dim 5 --out k8.json > run.log 2>&1
tail -2 run.log | cut -c1-250
echo "=== self"
perf report -i perf.data --no-children --sort symbol --stdio 2>/dev/null | grep -E "^ +[0-9]" | head -30
echo "=== inclusive"
perf report -i perf.data --children --sort symbol --stdio 2>/dev/null | grep -E "^ +[0-9]" | grep -v "core::\|alloc::\|std::" | head -30
echo "PROF3 DONE"
