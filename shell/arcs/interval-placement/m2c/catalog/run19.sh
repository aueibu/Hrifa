#!/bin/bash
# Addendum run (human, 2026-11-21): sets that contain an 18 or a 19 (octave + augmented 4th / perfect 5th), same
# cardinalities and windows as the main run, into out19/. Starts only after the main run has finished (ensure.sh / next.sh).
# The worker cap follows the main run's control file: out19/max-workers is a link to out/max-workers.
set -o pipefail
cd ~/ipcat
mkdir -p out19 && ln -sfn ../out/max-workers out19/max-workers
nice -n 10 ./node/bin/node --disable-warning=ExperimentalWarning build2.mjs --n 2,3,4,5 --max 19 --min-largest 18 --wmax 60 --out out19 --max-workers 2 --reserve-gb 6 2>&1 | tee -a run19.log \
  && touch out19/all-done && echo "[$(date -u '+%F %T') run19] addendum finished" >> run19.log
