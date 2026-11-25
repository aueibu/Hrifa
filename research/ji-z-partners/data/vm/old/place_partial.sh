#!/usr/bin/env bash
# Place the scraped (partial) 11/13/14-note types, as the batch would have.
set -u
cd ~/zruns/scrape_merge || exit 1
Z="nice -n 10 pypy3 $HOME/zgen/zgen_v4.py"
for k in 11 13 14; do
  exp5=$(case $k in 11) echo 25;; 13) echo 41;; 14) echo 495;; esac)
  t0=$SECONDS
  $Z place --primes 3 5 --odd 123 --types uv$k/uv_types.jsonl --workers 8 --allow-rank3 --out place_5lim_odd123_k$k > place_5lim_k$k.log 2>&1
  echo "k=$k 5-limit: $(wc -l < place_5lim_odd123_k$k/families.jsonl) families (expected $exp5) in $((SECONDS - t0))s"
  t0=$SECONDS
  $Z place --primes 3 5 7 --odd 123 --types uv$k/uv_types.jsonl --workers 8 --out place_7lim_odd123_k$k > place_7lim_k$k.log 2>&1
  echo "k=$k 7-limit (rank <= 2): $(wc -l < place_7lim_odd123_k$k/families.jsonl) families in $((SECONDS - t0))s"
done
echo PLACE DONE
