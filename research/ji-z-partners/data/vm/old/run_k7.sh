#!/usr/bin/env bash
# Linear-ring harmonic rings: 7 notes, then report, then the all-rootings check on 5-7 notes.
# Resumable: rerun this script after a preemption; finished pieces are skipped.
set -u
cd ~/zruns/linring || exit 1
L="nice -n 10 pypy3 $HOME/zgen/linring.py"
RINGS="24 36 48 60 72 80 81 90 96 120"
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a run_k7.status; }
log "start hdisk k7"
$L hdisk --rings $RINGS --k 7 --workers 2 --out h89_k7 >> h89_k7.log 2>&1 || { log "FAILED hdisk"; exit 1; }
log "hdisk k7 done"
[ -f h89_k7/report.jsonl ] || $L report --out h89_k7 >> h89_k7.log 2>&1 || { log "FAILED report"; exit 1; }
log "report k7 done"
for D in h89_k56 h89_k7; do
  [ -f $D/rootcheck.csv ] || $L rootcheck --out $D >> $D.rootcheck.log 2>&1 || { log "FAILED rootcheck $D"; exit 1; }
  log "rootcheck $D done"
done
log "ALL DONE"
