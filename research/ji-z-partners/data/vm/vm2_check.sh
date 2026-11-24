#!/bin/bash
# --vminus2 check: (1) bin13 without the flag = bin12 (same raw products, 5-limit q 729, shapes 3,1 4,1);
# (2) shape 3,1 with one minus point at -2 and second factor 0..2, no budget, 5-limit q 3645: must rebuild
# residue family 15/19292. log ~/zruns/zprod/chordsum/vm2_check.out
O=~/zruns/zprod/chordsum/resgen; L=$O/../vm2_check.out; cd ~/zruns/zprod
for b in 12 13; do
  ~/zgen/zprod-rs-bin$b --primes 3 5 --q 729 --k 6 8 9 10 12 14 15 16 --shapes 3,1 4,1 --ucoeffs 0 1 --max-neg 0 \
    --max-nodes 0 --threads 8 --out /tmp/vm2_bin$b.jsonl 2>/dev/null
  sort /tmp/vm2_bin$b.jsonl | md5sum | sed "s/^/bin$b /" >> $L
done
R=$O/v31m2_q3645; rm -rf $R; t=$(date +%s)
ZPROD_RS=~/zgen/zprod-rs-bin13 timeout 3000 pypy3 ~/zgen/zprod_rs3.py --fast --zgen ~/zgen/zgen_v4.py --primes 3 5 \
  --interval-odd 3645 --workers 8 --no-types --k 12 13 14 15 16 --max-nodes 0 --out $R --shapes 3,1 \
  --ucoeffs 0 1 2 --max-neg 0 --vminus2 > $R.out 2>&1
echo "$(TZ=America/New_York date +%H:%M) v31m2 q3645: exit $? $(( $(date +%s) - t ))s $(grep -h '^k=' $R.out | tr '\n' ' ')" >> $L
(cd ~/zgen && PYTHONPATH=~/pylib python3 resclass.py $O/residue3_q3645.jsonl $O/*_q3645) 2>> $L
echo "VM2 DONE" >> $L
