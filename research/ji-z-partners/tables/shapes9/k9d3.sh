#!/bin/bash
# k 9 universal types of dim >= 3 (2026-11-26). Resume = run this script again (same state dir).
mkdir -p ~/zruns/types9d3
echo "start $(date)" >> ~/zruns/types9d3/k9.log
~/zgen/typeflats-rs/target/release/typeflats-rs 9 --threads 64 --frontier 50000 --min-dim 3 --fast --canon2 \
  --state ~/zruns/types9d3/state --out ~/zruns/types9d3/types9.json >> ~/zruns/types9d3/k9.log 2>&1
echo "exit $? $(date)" >> ~/zruns/types9d3/k9.log
