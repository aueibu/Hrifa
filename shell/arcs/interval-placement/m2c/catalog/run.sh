#!/bin/bash
# The catalog run (resumable: rerunning continues where it stopped). Change the worker cap live with: echo N > ~/ipcat/out/max-workers
cd ~/ipcat
nice -n 10 ./node/bin/node --disable-warning=ExperimentalWarning build2.mjs --n 2,3,4,5 --max 17 --wmax 60 --out out --max-workers 2 --reserve-gb 6 2>&1 | tee -a run.log
