#!/bin/bash
# profile typeflats-rs k 7 --min-dim 2 --fast (2026-11-26)
if ! command -v perf >/dev/null; then
  sudo apt-get install -y -q linux-tools-$(uname -r) linux-tools-generic >/dev/null 2>&1 || sudo apt-get install -y -q linux-perf >/dev/null 2>&1
fi
command -v perf || { echo "NO PERF"; exit 1; }
sudo sysctl -q kernel.perf_event_paranoid=-1
cd ~/zgen/typeflats-rs
CARGO_PROFILE_RELEASE_DEBUG=true CARGO_TARGET_DIR=target-prof ~/.cargo/bin/cargo build --release 2>&1 | tail -1
mkdir -p ~/zruns/prof && cd ~/zruns/prof
perf record -F 499 -g -o perf.data ~/zgen/typeflats-rs/target-prof/release/typeflats-rs 7 --threads 16 --min-dim 2 --fast --out k7.json 2>&1 | grep -E "^k 7"
perf report -i perf.data --no-children --sort symbol --stdio 2>/dev/null | grep -E "^ +[0-9]" | head -40
echo "=== with children (inclusive)"
perf report -i perf.data --children --sort symbol --stdio 2>/dev/null | grep -E "^ +[0-9]" | head -40
echo "PROF DONE"
