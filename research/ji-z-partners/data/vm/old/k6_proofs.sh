#!/bin/bash
# Overnight 2026-11-24 (human: "You have all night - just run it to the max"): shape-free enumeration proofs for 6 notes only (added at the human's request, beside k789_proofs.sh); same rungs as the 7, 8
# and 9 notes only, every limit 5..23, q up a ladder per limit (first rung above what is proven for 8 and 9 notes).
# 6 GB per run, beside the 16 GB 7/8/9 chain. Round-robin over rungs; a run past CAP seconds is killed and its limit stops; no
# new run after STOP_UTC. The enumerator handles at most 2,048 allowed intervals (bin12); larger rungs fail at once.
# usage: bash k6_proofs.sh >> ~/zruns/zprod/k6.out 2>&1
export ZPROD_RS=~/zgen/zprod-rs-bin12K6 MEMGB=${MEMGB:-6}
CAP=${CAP:-4500}; STOP=${STOP_UTC:-13:30}
cd ~/zruns/zprod
NAMES=(5 7 11 13 17 19 23)
declare -A PR=([5]="3 5" [7]="3 5 7" [11]="3 5 7 11" [13]="3 5 7 11 13" [17]="3 5 7 11 13 17" [19]="3 5 7 11 13 17 19" [23]="3 5 7 11 13 17 19 23")
declare -A RUNGS=([5]="6561 10935 19683 32805" [7]="405 729 1215 2187 3645" [11]="243 405 729 1215" [13]="243 405 729 1215" [17]="243 405 729 1215" [19]="243 405 729" [23]="135 243 405 729")
declare -A DEAD
echo "== K6 PROOFS start $(date -u)"
for round in 0 1 2 3 4; do
  for L in "${NAMES[@]}"; do
    [ -n "${DEAD[$L]}" ] && continue
    rs=(${RUNGS[$L]}); q=${rs[$round]}; [ -z "$q" ] && continue
    if [[ "$(date -u +%H:%M)" > "$STOP" ]]; then echo "$(date -u +%H:%M) stop time $STOP reached"; break 2; fi
    tag=k6_l${L}q$q
    echo "$(date -u +%H:%M) $tag start"
    setsid bash ~/zgen/enum_run.sh "${PR[$L]}" $q $tag none "6" > $tag.run 2>&1 &
    pid=$!; t=$(date +%s)
    while kill -0 $pid 2>/dev/null; do
      if (( $(date +%s) - t > CAP )); then
        kill -- -$pid 2>/dev/null; sleep 5; pkill -f "zprod-rs-bin12K6 " ; DEAD[$L]=1
        echo "$(date -u +%H:%M) $tag CAPPED after ${CAP}s: limit $L stops here"
        break
      fi
      sleep 20
    done
    wait $pid 2>/dev/null
    if grep -q "exited with -9" $tag.out 2>/dev/null; then echo "$(date -u +%H:%M) $tag OOM-killed: limit $L stops"; DEAD[$L]=1; fi
    if grep -qi "error\|panicked" $tag.out 2>/dev/null; then echo "  $tag error: $(grep -i -m1 'error\|panicked' $tag.out | cut -c1-160)"; DEAD[$L]=1; fi
    echo "  $(grep -h '^k[0-9]*: enumeration\|ENUM DONE' $tag.run | tr '\n' ' ') ($(( $(date +%s) - t ))s)"
  done
done
echo "K6 PROOFS DONE $(date -u)"
