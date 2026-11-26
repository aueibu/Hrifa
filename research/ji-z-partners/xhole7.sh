#!/bin/bash
# VM: hole generator on the 7-limit q 729 rung with the fixed check (first run read the wrong layout: 0 found).
cd ~/zruns/zexp/xchk || exit 1
nice -n 15 python3 holegen2.py --primes 3 5 7 --q 729 --workers 8 --check ~/zruns/zprod/l7q729_on --strays l7q729.hole.strays > l7q729.hole2.out 2>&1
echo "HOLE7 DONE $(date)" >> xchk.log
