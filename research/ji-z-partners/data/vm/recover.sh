#!/usr/bin/env bash
# After a Spot preemption + restart: relaunch this session's jobs if their tmux sessions are gone.
# Other sessions' jobs (e.g. ipcat) are theirs to restart.
cd ~/zruns || exit 1
if ! tmux has-session -t zruns 2>/dev/null; then
  if [ -f d1_k10-14_v2/STOPPED ]; then echo "batch stopped on purpose (see d1_k10-14_v2/STOPPED); not relaunched"
  elif grep -q "all done" d1_k10-14_v2/status.txt 2>/dev/null; then echo "batch already finished"
  else tmux new-session -d -s zruns "bash $HOME/zgen/resume_batch.sh d1_k10-14_v2" && echo "batch resumed in tmux zruns"; fi
fi
if ! tmux has-session -t linring 2>/dev/null; then
  if grep -q "ALL DONE" linring/run_k7.status 2>/dev/null; then echo "linring run already finished"
  else (cd linring && echo "$(date -u +%H:%M:%S) RESUMED after preemption" >> run_k7.status && tmux new-session -d -s linring "bash run_k7.sh") && echo "linring run resumed in tmux linring"; fi
fi
tmux ls
