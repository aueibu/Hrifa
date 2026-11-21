#!/usr/bin/env bash
# Resume the D1 batch after a Spot preemption (same steps as run_batch.sh step 2, skipping what is done).
# A size whose types file exists goes straight to placement; a size without it reruns types from zero
# the first time (the original batch kept no checkpoint). Uses zgen_v4.py with --checkpoint, so a
# later preemption resumes from its finished branches (rerun this script).
# Usage (inside tmux): bash ~/zgen/resume_batch.sh d1_k10-14_v2
set -u
ZGEN=${ZGEN:-$HOME/zgen/zgen_v4.py}
R=$HOME/zruns/$1
cd "$R" || exit 1
STATUS=$R/status.txt
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$STATUS"; }
note "RESUMED after preemption with $(basename "$ZGEN") (md5 $(md5sum "$ZGEN" | cut -d' ' -f1))"

place() { # k tag primes extra-flags expected
  local k=$1 tag=$2 primes=$3 flags=$4 expect=$5 t0=$SECONDS out=place_${2}_odd123_k${1}
  [ -s "$out/families.jsonl" ] && { note "k=$k $tag placement already done"; return 0; }
  if flock place.lock pypy3 "$ZGEN" place --primes $primes --odd 123 --types "uv$k/uv_types.jsonl" \
       --workers 15 $flags --out "$out" > "logs/${out}.log" 2>&1; then
    note "k=$k $tag odd 123 placed in $((SECONDS - t0))s: $(wc -l < "$out/families.jsonl") families (expected $expect)"
  else
    note "k=$k $tag placement FAILED after $((SECONDS - t0))s, see logs/${out}.log"
  fi
}

pipeline() { # k "shapes" expected-5-limit
  local k=$1 shapes=$2 t0=$SECONDS
  if [ -s "uv$k/uv_types.jsonl" ]; then
    note "k=$k types already done: $(wc -l < "uv$k/uv_types.jsonl") types"
  else
    [ -f "logs/types_k$k.log" ] && [ ! -d "uv$k/ckpt" ] && mv "logs/types_k$k.log" "logs/types_k$k.preempted.$(date -u +%H%M).log"
    note "k=$k types (re)start with checkpoints (shapes $shapes)"
    if ! pypy3 "$ZGEN" types --shape $shapes --checkpoint --out "uv$k" >> "logs/types_k$k.log" 2>&1; then
      note "k=$k types FAILED after $((SECONDS - t0))s, see logs/types_k$k.log"
      return 1
    fi
    note "k=$k types done in $((SECONDS - t0))s: $(wc -l < "uv$k/uv_types.jsonl") types"
  fi
  place "$k" 5lim "3 5" --allow-rank3 "$3"
  place "$k" 7lim "3 5 7" "" "new"
}

( while sleep 300; do
    note "mem $(free -m | awk '/Mem/{print $3}') MB used of $(free -m | awk '/Mem/{print $2}'), $(pgrep -c pypy3) pypy3 processes"
  done ) &
WATCH=$!
pipeline 11 "11,2,1" "25" &
P11=$!
pipeline 13 "13,2,1" "41" &
P13=$!
pipeline 14 "7,3,1 7,4,2 14,2,1" "495" &
P14=$!
wait $P11 $P13 $P14
kill $WATCH 2>/dev/null
note "all done"
cd "$HOME/zruns" && tar czf "$1.tgz" "$1" && note "packed $HOME/zruns/$1.tgz"
