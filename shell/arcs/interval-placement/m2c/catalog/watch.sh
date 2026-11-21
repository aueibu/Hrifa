#!/bin/bash
# Raise the catalog's worker cap once the JI Z-relation batch (zgen.py) has finished. The [z] keeps pgrep from
# matching this script's own command line.
while pgrep -f '[z]gen/zgen.py' > /dev/null; do sleep 120; done
echo 14 > ~/ipcat/out/max-workers
echo "[$(date -u '+%Y-%m-%d %H:%M:%S') watcher] no zgen.py processes left: worker cap raised to 14" >> ~/ipcat/run.log
