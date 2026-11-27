#!/bin/bash
# stop the VM when the --dedup-min-dim tests (tmux mem2) finish (2026-11-26 handoff)
until grep -qE "MEM2 DONE|panicked" ~/zruns/mem2.log 2>/dev/null; do sleep 60; done
echo "mem2 finished $(date), shutting down" >> ~/zruns/mem2.log
sudo shutdown -h now
