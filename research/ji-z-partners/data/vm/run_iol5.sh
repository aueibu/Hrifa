#!/bin/bash
# Validate zprod --interval-odd against the exhaustive 5-limit catalog (gamut odd <= 123):
# every exhaustive family with intervallic odd limit <= Q must be found, at each note count.
# usage: Q=729 W=2 bash run_iol5.sh   (results in ~/zruns/zprod/iol5_q$Q/, log iol5_q$Q.out)
Q=${Q:-729}; W=${W:-2}
D=~/zruns/zprod/iol5_q$Q; mkdir -p $D; cd ~/zruns/zprod
for k in 6 8 10 11 13 14; do
  [ -f $D/k$k/k$k/families.jsonl ] && continue
  t=$(date +%s)
  pypy3 ~/zgen/zprod_iol.py --zgen ~/zgen/zgen_v4.py --primes 3 5 --odd 123 --interval-odd $Q --k $k \
    --workers $W --no-types --out $D/k$k > $D/k$k.out 2>&1
  echo "$(date +%H:%M) k$k exit $? in $(( $(date +%s) - t ))s: $(grep -h 'k=' $D/k$k.out | tail -1)"
done
python3 ~/zgen/iol_compare.py exh5_all.jsonl $Q $D/k*/k*/families.jsonl
echo "IOL5 DONE"
