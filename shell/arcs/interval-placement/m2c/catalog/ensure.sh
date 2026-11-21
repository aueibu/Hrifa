#!/bin/bash
# Start the catalog run and its zgen watcher unless the run is already going or has finished. Safe to call any time:
# at boot (crontab @reboot, after a Spot preemption and relaunch) and from the PC-side watcher.
cd ~/ipcat || exit 1
if [ -f out/all-done ]; then echo "catalog already finished"; exit 0; fi
if pgrep -f '[b]uild2.mjs' > /dev/null; then echo "catalog run already going"; exit 0; fi
rm -f out/max-workers   # back to 2 workers until watch.sh sees that zgen.py has finished again
tmux kill-session -t ipcat 2> /dev/null
tmux new -d -s ipcat -n run && tmux send-keys -t ipcat:run './run.sh' Enter
tmux new-window -d -t ipcat -n watch && tmux send-keys -t ipcat:watch './watch.sh' Enter
echo "[$(date -u '+%F %T') ensure] started the catalog run (resuming)" >> run.log
echo "started"
