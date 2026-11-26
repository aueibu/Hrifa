#!/bin/bash
# Widened steps (widen.sh) on every overnight rung, each after its no-budget pass (NB_DONE); gives up waiting at 14:15 UTC.
cd ~/zruns/zprod
for spec in "3 5|1215|l5q1215_on" "3 5 7|405|l7q405_on" "3 5 7 11|243|l11q243_on" "3 5 7 11 13|243|l13q243_on" \
            "3 5|3645|l5q3645_on" "3 5 7 11|405|l11q405_on" "3 5 7 11 13 17|243|l17q243_on" "3 5 7|729|l7q729_on"; do
  IFS='|' read -r pr q tag <<< "$spec"
  until [ -f $tag/NB_DONE ] || [ "$(date +%H%M)" -ge 1415 ]; do sleep 30; done
  [ -f $tag/NB_DONE ] || { echo "$(date +%H:%M) WIDEN $tag skipped: no NB_DONE by 14:15 UTC" >> overnight.out; continue; }
  bash ~/zgen/widen.sh "$pr" $q $tag
done
echo "$(date +%H:%M) WIDEN CHAIN DONE" >> overnight.out
