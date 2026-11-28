#!/bin/bash
cd ~/zgen/typeflats-rs
~/.cargo/bin/cargo build --release --features mimalloc --target-dir target-sum 2>&1 | tail -3
R=~/zruns/types9d2
./target-sum/release/typeflats-rs 9 --canon2 --summarize $R/state/done.txt --out $R/partial9.json 2>&1 | tee $R/summarize.log
ls -la $R/partial9.json
