#!/bin/bash
# k 8 min-dim 2 benchmark with --fast --canon2 (2026-11-26). Expect 4 classes (zgen 91, 94, s1, c3). Resume = rerun.
mkdir -p ~/zruns/types8d2b
echo "start $(date)" >> ~/zruns/types8d2b/k8.log
~/zgen/typeflats-rs/target/release/typeflats-rs 8 --threads 64 --frontier 50000 --min-dim 2 --fast --canon2 \
  --state ~/zruns/types8d2b/state --out ~/zruns/types8d2b/types8.json >> ~/zruns/types8d2b/k8.log 2>&1
echo "exit $? $(date)" >> ~/zruns/types8d2b/k8.log
