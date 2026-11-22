#!/bin/bash
# factor counts (count only = factor generation time) for 13- and 17-limit --fast (no hull computation:
# zprod uses the allowed intervals directly, see check_hull_eq.py)
D=~/zruns/zprod/count_hp; mkdir -p $D; cd ~/zruns/zprod
ZP=${ZP:-~/zgen/zprod_hc3.py}
run() {  # name primes q shapes...
  n=$1; pr=$2; q=$3; shift 3
  [ -f $D/$n.done ] && return
  ( t=$(date +%s); timeout 3600 pypy3 $ZP --fast --count-only \
      --zgen ~/zgen/zgen_v4.py --primes $pr --interval-odd $q --k 9 --shapes "$@" --workers 1 \
      --out $D/$n > $D/$n.out 2>&1; e=$?; echo "$n exit $e $(( $(date +%s) - t ))s" >> $D/times.txt
    [ $e = 0 ] && touch $D/$n.done ) &
}
for q in 39 65 99; do
  run p13_q${q}_S "3 5 7 11 13" $q 3,0 4,0 3,1 4,1
  run p13_q${q}_rest "3 5 7 11 13" $q 5,0 2,1 3,2 4,2
done
for q in 51 85; do
  run p17_q${q}_S "3 5 7 11 13 17" $q 3,0 4,0 3,1 4,1
  run p17_q${q}_rest "3 5 7 11 13 17" $q 5,0 2,1 3,2 4,2
done
wait; echo COUNT DONE >> $D/times.txt
