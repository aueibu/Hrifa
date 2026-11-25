#!/usr/bin/env bash
# Scrape the live D1 batch's types searches. Order per size (tested on copies):
#   1. scrape the RUNNING parent (blocked waiting on its workers; holds the finished searches' results)
#   2. pause the parent (SIGSTOP) so a worker crash cannot make it tear down the other workers
#   3. scrape each worker (busy ones at a safe point: their next clock_gettime call)
# Does not stop anything else: parents stay paused, workers keep running, until the kill step.
# Parents: 5607 (11 notes), 5608 (13 notes), 5610 (14 notes).
set -u
PARENTS="5607 5608 5610"
mkdir -p ~/zruns/scrape_live
for P in $PARENTS; do
  pgrep -P "$P" | sort -n > ~/zruns/scrape_live/children_$P.txt
  bash ~/zgen/scrape_pid.sh "$P"
  kill -STOP "$P" && echo "paused parent $P"
  for W in $(cat ~/zruns/scrape_live/children_$P.txt); do
    st=$(ps -o stat= -p "$W" | cut -c1)
    if [ "$st" = R ]; then bash ~/zgen/scrape_pid.sh "$W" safe; else bash ~/zgen/scrape_pid.sh "$W"; fi
  done
done
cp ~/zruns/scrape/scrape_*.json ~/zruns/scrape/gdb_*.log ~/zruns/scrape_live/ 2>/dev/null
echo "parents are paused (STOP); workers keep running until the kill step"
