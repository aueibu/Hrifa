#!/bin/bash
# One census.py process per complete list, in parallel; each writes census_<label>.txt and appends "label exit N HH:MM" to census_par.time.
cd ~/zruns/zprod
date +"start %H:%M" > census_par.time
for spec in 5-limit_q729:ev2_5q729 7-limit_q243:ev2_7q243 11-limit_q135:ev2_11q135 13-limit_q135:en13q135 17-limit_q135:en17q135; do
  label=${spec%%:*}
  ( python3 ~/zgen/census.py ~/zgen/smallfactor.py "$spec" > census_$label.txt 2> census_$label.err
    echo "$label exit $? $(date +%H:%M)" >> census_par.time ) &
done
wait
echo "ALL DONE $(date +%H:%M)" >> census_par.time
