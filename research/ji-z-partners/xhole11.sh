#!/bin/bash
# VM: hole generator on the 11-limit q 405 rung again, writing the strays (first run: 1,893 hole families in the ladder, 2,556 not: 12 notes 468, 15 notes 1,963, 16 notes 125).
cd ~/zruns/zexp/xchk || exit 1
nice -n 15 python3 holegen2.py --primes 3 5 7 11 --q 405 --workers 16 --check ~/zruns/zprod/l11q405_on --strays l11q405.hole.strays > l11q405.hole2.out 2>&1
echo "HOLE11 DONE $(date)" >> xchk.log
