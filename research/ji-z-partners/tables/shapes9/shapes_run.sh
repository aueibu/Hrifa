#!/bin/bash
# shapes_k.py on every known k-note list (k 6, 7, 8 as checks, then 9)
cd ~/zgen/theory
mkdir -p ~/zruns/shapes9
for K in 6 7 8 9; do
  files=$(find ~/zruns/zprod -path "*/k$K/families.jsonl" -size +0 | sort)
  echo "=== k $K: $(echo "$files" | wc -l) files, start $(date)"
  ~/tfenv/bin/python shapes_k.py $K ~/zruns/shapes9/k$K $files --workers 60
  echo "=== k $K done $(date)"
done
echo "SHAPES DONE"
