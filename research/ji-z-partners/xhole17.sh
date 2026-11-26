#!/bin/bash
# VM: hole generator on the 17-limit q 243 rung again, writing the stray family(ies) the ladder lacks (first run: 539 in the ladder, 1 not, 16 notes).
cd ~/zruns/zexp/xchk || exit 1
nice -n 15 python3 holegen2.py --primes 3 5 7 11 13 17 --q 243 --workers 12 --check ~/zruns/zprod/l17q243_on --strays l17q243.hole.strays > l17q243.hole2.out 2>&1
echo "HOLE17 DONE $(date)" >> xchk.log
