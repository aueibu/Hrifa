#!/usr/bin/env bash
# Test zgen_v4 checkpointing on the 8-note shapes: outputs must be byte-identical to the reference.
set -u
Z=$HOME/zgen/zgen_v4.py
REF=$HOME/zruns/d1_k10-14_v2/check_uv8_all/uv_types.jsonl
T=$HOME/zruns/ckpt_test
rm -rf "$T"; mkdir -p "$T"; cd "$T" || exit 1
N="nice -n 10 pypy3 $Z types --shape 4,3,1 8,2,1"
ok() { if cmp -s "$1/uv_types.jsonl" "$REF"; then echo "PASS $2"; else echo "FAIL $2"; fi; }

t0=$SECONDS; $N --workers 1 --out plain > plain.log 2>&1; echo "plain run: $((SECONDS - t0))s"
ok plain "no checkpoint, 1 worker"

for D in 3 2 5; do
  out=ck_d$D; kills=0
  while :; do
    timeout -s KILL 5 $N --workers 2 --checkpoint --ckpt-depth $D --ckpt-every 1 --out $out > $out.log 2>&1
    rc=$?
    [ $rc -eq 0 ] && break
    kills=$((kills + 1))
    [ $kills -gt 60 ] && { echo "FAIL depth $D: no progress after 60 kills"; break; }
  done
  echo "depth $D: finished after $kills kills; resume lines: $(grep -c 'resuming from checkpoint' $out.log) in last log"
  ok $out "checkpoint depth $D, killed every 5s"
done

t0=$SECONDS; $N --workers 2 --checkpoint --out ck_d3 > rerun.log 2>&1
echo "rerun of finished run: $((SECONDS - t0))s, $(grep -c 'already finished' rerun.log) searches loaded"
ok ck_d3 "rerun of finished checkpointed run"
