#!/bin/bash
cd ~/zgen/theory
for K in 6 7 8 9; do
  echo "=== k $K $(date)"
  ~/tfenv/bin/python shapes_image.py $K ~/zruns/shapes9/k$K.classes.jsonl --workers 60 > ~/zruns/shapes9/k$K.image.txt 2>&1
  head -3 ~/zruns/shapes9/k$K.image.txt
done
echo "IMAGE DONE"
