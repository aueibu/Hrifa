#!/usr/bin/env bash
# D1 batch: JI Z-family types and placements on the VM, with logs (ratio-rhythm arc, D1 step 3).
#
# Usage (inside tmux, from the folder holding this script and zgen.py):
#   bash run_batch.sh [batch-name]
# Needs: pypy3 on PATH; zgen.py next to this script (or ZGEN=/path/to/zgen.py).
# Writes ~/zruns/<batch>/ :
#   machine.txt   host, cores, memory, pypy version, zgen.py md5, start time
#   status.txt    one line per step with timings and family counts (tail -f this to watch)
#   logs/         full output of every step
#   uv<k>/        types per size;  place_<limit>_odd123_k<k>/  families.jsonl, types.jsonl, summary.csv, run.log
# and ~/zruns/<batch>.tgz at the end (everything above; small).
#
# Steps:
#   1. check: multi-core `types` must give byte-identical output to one worker on the 8-note shapes (102 types)
#   2. one pipeline per size, all four at once: types -> 5-limit odd 123 placement -> 7-limit odd 123 placement
#      Placements take a lock, so one runs at a time with 15 workers; the types searches run alongside.
#      7-limit skips rank-3 types (|intervals|^3 placements is out of reach in a 99-note gamut); run.log lists them.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ZGEN=${ZGEN:-$HERE/zgen.py}
BATCH=${1:-batch_$(date -u +%Y%m%d_%H%M)}
R=$HOME/zruns/$BATCH
mkdir -p "$R/logs"
cd "$R" || exit 1
STATUS=$R/status.txt
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$STATUS"; }

[ -f "$ZGEN" ] || { echo "zgen.py not found at $ZGEN"; exit 1; }
{
  echo "batch:   $BATCH"
  echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host:    $(hostname)"
  echo "cpus:    $(nproc)"
  free -g | head -2
  echo "pypy3:   $(pypy3 --version 2>&1 | tr '\n' ' ')"
  echo "zgen:    $ZGEN"
  echo "md5:     $(md5sum "$ZGEN" | cut -d' ' -f1)"
} > machine.txt
cat machine.txt

# 1. check
note "check: 8-note types, 1 worker vs all workers"
pypy3 "$ZGEN" types --shape 4,3,1 8,2,1 --workers 1 --out check_uv8_w1 > logs/check_uv8_w1.log 2>&1 \
  || { note "FAILED: check run with 1 worker, see logs/check_uv8_w1.log"; exit 1; }
pypy3 "$ZGEN" types --shape 4,3,1 8,2,1 --out check_uv8_all > logs/check_uv8_all.log 2>&1 \
  || { note "FAILED: check run with all workers, see logs/check_uv8_all.log"; exit 1; }
if ! cmp -s check_uv8_w1/uv_types.jsonl check_uv8_all/uv_types.jsonl; then
  note "FAILED: multi-core types output differs from 1 worker; stopping"
  exit 1
fi
note "check passed: identical output, $(wc -l < check_uv8_all/uv_types.jsonl) types (expected 102)"

# 2. pipelines
place() { # k tag primes extra-flags expected
  local k=$1 tag=$2 primes=$3 flags=$4 expect=$5 t0=$SECONDS out=place_${2}_odd123_k${1}
  if flock place.lock pypy3 "$ZGEN" place --primes $primes --odd 123 --types "uv$k/uv_types.jsonl" \
       --workers 15 $flags --out "$out" > "logs/${out}.log" 2>&1; then
    note "k=$k $tag odd 123 placed in $((SECONDS - t0))s: $(wc -l < "$out/families.jsonl") families (expected $expect)"
  else
    note "k=$k $tag placement FAILED after $((SECONDS - t0))s, see logs/${out}.log"
  fi
}

pipeline() { # k "shapes" expected-5-limit
  local k=$1 shapes=$2 t0=$SECONDS
  note "k=$k types start (shapes $shapes)"
  if ! pypy3 "$ZGEN" types --shape $shapes --out "uv$k" > "logs/types_k$k.log" 2>&1; then
    note "k=$k types FAILED after $((SECONDS - t0))s, see logs/types_k$k.log"
    return 1
  fi
  note "k=$k types done in $((SECONDS - t0))s: $(wc -l < "uv$k/uv_types.jsonl") types"
  place "$k" 5lim "3 5" --allow-rank3 "$3"
  place "$k" 7lim "3 5 7" "" "new"
}

# memory watch: a line every 5 minutes, so a squeeze shows in status.txt (types caps its memory per
# search with --seen-max; a killed worker now stops its run with an error instead of hanging)
OOM0=$(sudo -n dmesg 2>/dev/null | grep -c "Killed process")
( while sleep 300; do
    note "mem $(free -m | awk '/Mem/{print $3}') MB used of $(free -m | awk '/Mem/{print $2}'), $(pgrep -c pypy3) pypy3 processes"
  done ) &
WATCH=$!

pipeline 11 "11,2,1" "25" &
P11=$!
pipeline 10 "5,3,1 10,2,1 5,4,2" "292" &
P10=$!
pipeline 13 "13,2,1" "41" &
P13=$!
pipeline 14 "7,3,1 7,4,2 14,2,1" "495" &
P14=$!
wait $P11 $P10 $P13 $P14
kill $WATCH 2>/dev/null

OOM1=$(sudo -n dmesg 2>/dev/null | grep -c "Killed process")
note "out-of-memory kills during this batch: $((OOM1 - OOM0))"
note "all done"
echo "finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> machine.txt
cd "$HOME/zruns" && tar czf "$BATCH.tgz" "$BATCH" && note "packed $HOME/zruns/$BATCH.tgz"
