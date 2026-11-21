#!/bin/bash
# Start the catalog run (or, once it has finished, the 18-19 addendum) unless one is already going or both have
# finished. Safe to call any time: at boot (crontab @reboot, after a Spot preemption and relaunch), from next.sh, and
# from the PC-side watcher.
cd ~/ipcat || exit 1
if [ -f out/all-done ] && [ -f out19/all-done ]; then echo "catalog already finished"; exit 0; fi
if pgrep -f '[b]uild2.mjs' > /dev/null; then echo "catalog run already going"; exit 0; fi
rm -f out/max-workers   # back to 2 workers until watch.sh sees that zgen.py has finished again
tmux kill-session -t ipcat 2> /dev/null
if [ -f out/all-done ]; then job=./run19.sh; else job=./run.sh; fi
tmux new -d -s ipcat -n run && tmux send-keys -t ipcat:run "$job" Enter
tmux new-window -d -t ipcat -n watch && tmux send-keys -t ipcat:watch './watch.sh' Enter
[ -f out/all-done ] || { tmux new-window -d -t ipcat -n next && tmux send-keys -t ipcat:next './next.sh' Enter; }
echo "[$(date -u '+%F %T') ensure] started $job (resuming)" >> run.log
echo "started"
