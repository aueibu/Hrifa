#!/bin/bash
# After widen.sh: rerun widened steps (w30n4, w31n2) that stopped at the node budget with --max-nodes 0 (cap 30 min),
# then re-union and verify. One line per rung -> overnight.out (WNB). Loops until 14:30 UTC.
cd ~/zruns/zprod; LOG=~/zruns/zprod/overnight.out
export ZPROD_RS=~/zgen/zprod-rs-bin11
KS="6 7 8 9 10 11 12 13 14 15 16"
declare -A PR=( [5]="3 5" [7]="3 5 7" [11]="3 5 7 11" [13]="3 5 7 11 13" [17]="3 5 7 11 13 17" )
stops_of() { grep -h '^zprod-rs:.*stopped at the node budget' $1 2>/dev/null | tail -1 | sed -E 's/.* ([0-9]+) stopped at the node budget.*/\1/'; }
while [ "$(date +%H%M)" -lt 1800 ]; do
  for d in l*q*_on; do
    [ -f $d/w31n2/summary.csv ] || continue
    [ -f $d/WNB_DONE ] && continue
    L=${d#l}; L=${L%%q*}; Q=${d#l*q}; Q=${Q%_on}; D=~/zruns/zprod/$d
    t0=$(date +%s); before=$(cat $D/union_k*.jsonl | wc -l); info=""
    for n in w30n4 w31n2; do
      s=$(stops_of $D/$n.out); [ -z "$s" ] || [ "$s" = 0 ] && continue
      case $n in w30n4) a="--shapes 3,0 --ucoeffs -1 0 1 2 --max-neg 4";; w31n2) a="--shapes 3,1 --ucoeffs -1 0 1 2 --max-neg 2";; esac
      t=$(date +%s)
      timeout 1800 pypy3 ~/zgen/zprod_rs2.py --fast --zgen ~/zgen/zgen_v4.py --primes ${PR[$L]} --interval-odd $Q --workers 16 \
        --no-types --max-nodes 0 --out $D/${n}_nb --k $KS $a > $D/${n}_nb.out 2>&1
      [ $? -eq 124 ] && { pkill -f "zprod/$d/${n}_n[b]"; info="$info $n($s,capped)"; } || info="$info $n($s->$(stops_of $D/${n}_nb.out),$(( $(date +%s) - t ))s)"
    done
    for k in $KS; do
      ls $D/*/k$k/families.jsonl > /dev/null 2>&1 && python3 ~/zgen/union_fams.py $D/union_k$k.jsonl $D/*/k$k/families.jsonl > /dev/null
    done
    bad=0; for f in $D/union_k*.jsonl; do pypy3 ~/zgen/verify_families.py ~/zgen/zgen_v4.py $f | tail -1 | grep -q ', 0 bad' || bad=$((bad + 1)); done
    touch $D/WNB_DONE
    echo "$(date +%H:%M) WNB $d done in $(( $(date +%s) - t0 ))s:${info:- nothing to rerun}; families $before -> $(cat $D/union_k*.jsonl | wc -l); files with bad: $bad" >> $LOG
  done
  sleep 60
done
echo "$(date +%H:%M) WNB CHAIN STOPPED" >> $LOG
