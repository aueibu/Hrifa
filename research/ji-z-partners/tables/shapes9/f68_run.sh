#!/bin/bash
# families of the 2-D 9-note shapes #37, #68, #69, #70 from the 5-limit lists, then their factor structure
# (2026-11-26 evening; human: "lets do the factor breakdown for #68")
cd ~/zgen/theory
mkdir -p ~/zruns/f68
files=$(find ~/zruns/zprod -path "*/k9/families.jsonl" -size +0 | grep -E "_5q|_l5q" | sort)
echo "=== $(echo "$files" | wc -l) files, start $(date)"
echo "$files"
nice -n 19 ~/tfenv/bin/python shape_fams.py 9 ~/zruns/shapes9/k9.classes.jsonl 37,68,69,70 ~/zruns/f68/fams.jsonl $files --workers 16
echo "=== extract done $(date)"
PYTHONPATH=~/pylib nice -n 19 ~/tfenv/bin/python factor_struct.py ~/zruns/f68/fams.jsonl --workers 16 > ~/zruns/f68/factor.tsv
echo "=== factor done $(date)"
echo "F68 DONE"
