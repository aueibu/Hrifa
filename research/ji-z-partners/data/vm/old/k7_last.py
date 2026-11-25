#!/usr/bin/env python3
"""k7_last.py: use the last window before 10:30 Eastern (15:30 UTC) for 7-note proofs, one run at a time, with
k6789_more.py's run() (process-group kill at the cap, cap never past HARD_UTC 16:45).
  1. 7-limit q <= 10,935, 7 notes only (q 6,561 took 830 s);
  2. 13-limit q <= 1,215, 7 notes only (stopped at the 7-only pass's budget after 954 s), if started before 15:30 UTC.
usage: python3 k7_last.py >> ~/zruns/zprod/k6789_more.out 2>&1
"""
import os, sys

sys.path.insert(0, os.path.expanduser("~/zgen"))
import k6789_more as m

m.log("k7_last start")
for L, q in ((7, 10935), (13, 1215)):
    if m.now() > m.at(m.STOP):
        m.log(f"stop time {m.STOP} reached")
        break
    m.run("k7only", "7", L, q, 9000)
m.log("K7 LAST DONE")
