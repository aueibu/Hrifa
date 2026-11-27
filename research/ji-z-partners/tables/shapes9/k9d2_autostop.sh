#!/bin/bash
# stop the VM when the k 9 min-dim 2 run exits (finished or crashed); results stay on the disk (~/zruns/types9d2)
until grep -q "^exit" ~/zruns/types9d2/k9.log 2>/dev/null; do sleep 300; done
echo "autostop $(date)" >> ~/zruns/types9d2/k9.log
sudo shutdown -h now
