#!/bin/bash
# k 9 universal types of dim >= 2 (2026-11-27 ~00:15 Eastern; human: "what is the harm in running it tonight and then
# seeing if we get approved?"). Resume = run this script again (same state dir), also after a machine-type change.
# Binary: the --features mimalloc build (fast hasher + mimalloc, 1.30x, exact). --dedup-min-dim 5 (memory).
# Frontier 200,000 (finer than 50,000: a stop loses less in-flight work). Sample: every 10,000,000th good flat.
B=~/zgen/typeflats-rs/target-mi/release/typeflats-rs
R=~/zruns/types9d2
mkdir -p $R
echo "start $(date) on $(curl -s -H Metadata-Flavor:Google http://metadata.google.internal/computeMetadata/v1/instance/machine-type | sed 's|.*/||')" >> $R/k9.log
$B 9 --threads $(nproc) --frontier 200000 --min-dim 2 --fast --canon2 --dedup-min-dim 5 \
  --sample-out $R/samp_$(date +%s).jsonl --sample-every 10000000 \
  --state $R/state --out $R/types9.json >> $R/k9.log 2>&1
echo "exit $? $(date)" >> $R/k9.log
