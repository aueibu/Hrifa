#!/bin/bash
# Waits for the main catalog run to finish, then lets ensure.sh start the addendum (run19.sh).
while [ ! -f ~/ipcat/out/all-done ]; do sleep 120; done
sleep 30; setsid nohup ~/ipcat/ensure.sh >> ~/ipcat/boot.log 2>&1 < /dev/null &
