#!/bin/bash
# Follows overnight.sh: for every finished ladder rung (l<L>q<Q>_on, LADDER DONE), rerun each step whose final line
# reports factors "stopped at the node budget" with --max-nodes 0 (no budget; capped at NB_MAX s), then redo
# union, verify, scores. One line per rung -> ~/zruns/zprod/overnight.out (prefix NB).
# usage: bash nb_chain.sh   (logs itself)
LOG=~/zruns/zprod/overnight.out; NB_MAX=${NB_MAX:-1800}
export ZPROD_RS=~/zgen/zprod-rs-bin11
cd ~/zruns/zprod
declare -A PR=( [5]="3 5" [7]="3 5 7" [11]="3 5 7 11" [13]="3 5 7 11 13" [17]="3 5 7 11 13 17" )
KS="6 7 8 9 10 11 12 13 14 15 16"
args_for() {  # step name -> zprod arguments
  case $1 in
    main) echo "--k $KS --shapes 3,1 4,1 4,2 3,0 4,0 5,0";;
    five) echo "--k $KS --shapes 5,1 5,2";;
    neg30) echo "--k $KS --shapes 3,0 --ucoeffs -1 0 1 2 --max-neg 2";;
    s1_k*) echo "--k ${1#s1_k} --shapes 2,1 3,2";;
  esac
}
stops_of() { grep -h '^zprod-rs:.*stopped at the node budget' $1 2>/dev/null | tail -1 | sed -E 's/.* ([0-9]+) stopped at the node budget.*/\1/'; }
declare -A DONE
while true; do
  last=0; grep -q 'OVERNIGHT DONE' $LOG && last=1
  for tagout in l*q*_on.out; do
    tag=${tagout%.out}
    [ -n "${DONE[$tag]}" ] && continue
    grep -q 'LADDER DONE' $tagout || continue
    DONE[$tag]=1
    [ -f $tag/NB_DONE ] && continue
    L=${tag#l}; L=${L%%q*}; Q=${tag#l*q}; Q=${Q%_on}
    D=~/zruns/zprod/$tag; t0=$(date +%s); rerun=""; left=""
    for so in $D/main.out $D/five.out $D/neg30.out $D/s1_k*.out; do
      n=$(basename $so .out); s=$(stops_of $so)
      [ -z "$s" ] || [ "$s" = 0 ] && continue
      t=$(date +%s)
      timeout $NB_MAX pypy3 ~/zgen/zprod_rs2.py --fast --zgen ~/zgen/zgen_v4.py --primes ${PR[$L]} --interval-odd $Q \
        --workers 16 --no-types --max-nodes 0 --out $D/${n}_nb $(args_for $n) > $D/${n}_nb.out 2>&1
      e=$?
      if [ $e -eq 124 ]; then pkill -f "zprod/$tag/${n}_nb"; left="$left $n($s,capped)"; else rerun="$rerun $n($s->$(stops_of $D/${n}_nb.out),$(( $(date +%s) - t ))s)"; fi
    done
    for k in $KS; do
      ls $D/*/k$k/families.jsonl > /dev/null 2>&1 && python3 ~/zgen/union_fams.py $D/union_k$k.jsonl $D/*/k$k/families.jsonl
    done
    bad=0; for f in $D/union_k*.jsonl; do pypy3 ~/zgen/verify_families.py ~/zgen/zgen_v4.py $f | tail -1 | grep -q ', 0 bad' || bad=$((bad + 1)); done
    pypy3 ~/zgen/interval_odd.py $D/union_k*.jsonl > $D/interval_odd.txt
    python3 ~/zgen/shade.py $D/union_k*.jsonl > $D/shade.txt
    s=""; for k in $KS; do [ -s $D/union_k$k.jsonl ] && s="$s k$k:$(wc -l < $D/union_k$k.jsonl)"; done
    touch $D/NB_DONE
    echo "$(date +%H:%M) NB $tag done in $(( $(date +%s) - t0 ))s: reran${rerun:- none}; still capped:${left:- none}; families$s; total $(cat $D/union_k*.jsonl | wc -l); files with bad: $bad" >> $LOG
  done
  [ $last = 1 ] && break
  sleep 60
done
echo "$(date +%H:%M) NB CHAIN DONE" >> $LOG
