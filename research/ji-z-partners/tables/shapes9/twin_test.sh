#!/bin/bash
# twin pruning in canon2 (2026-11-26): same classes, then speed, then (if the classes match) start k 9 min-dim 3
cd ~/zgen/typeflats-rs
~/.cargo/bin/cargo build --release 2>&1 | grep -E "^error|Finished" | head -20
B=~/zgen/typeflats-rs/target/release/typeflats-rs
mkdir -p ~/zruns/twin && cd ~/zruns/twin
ok=1
for t in "5 --single:2061" "6 --single --min-dim 2:6487" "6 --single --fast:208166"; do
  args=${t%%:*}; want=${t##*:}
  line=$($B $args --canon2 --out x.json 2>&1 | grep -E "^k |panicked")
  echo "=== SAME: $args --canon2 (want $want dups)"; echo "$line" | sed 's/cut at the parent.*good/good/'
  echo "$line" | grep -q " $want dups" || ok=0
done
echo "=== SPEED: 8 --min-dim 3 --fast --canon2 (was 100 s, frontier phase 82 s)"
$B 8 --threads 64 --frontier 50000 --min-dim 3 --fast --canon2 --out k8d3.json 2>&1 | grep -E "^frontier|^k |panicked" | cut -c1-250
if [ $ok = 1 ]; then
  echo "CLASSES MATCH: starting k 9"
  tmux new -d -s tf9 'bash ~/zgen/k9d3.sh'
else
  echo "CLASS MISMATCH: k 9 NOT started"
fi
echo "TWIN DONE"
