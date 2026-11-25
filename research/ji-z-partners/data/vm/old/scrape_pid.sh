#!/usr/bin/env bash
# Inject scrape_payload.py into one running PyPy process. Usage: scrape_pid.sh PID [safe]
# safe: first run the process to its next clock_gettime call (the search calls time.time() at every
#       node), a point where PyPy's heap is consistent; use for busy workers. Without it, gdb stops the
#       process wherever it is (fine for a parent blocked in a wait).
# The process is paused only while gdb is attached; it continues afterwards.
set -u
PID=$1
MODE=${2:-}
PAY=$HOME/zgen/scrape_payload.py
mkdir -p "$HOME/zruns/scrape"
SAFE=()
if [ "$MODE" = safe ]; then
  SAFE=(-ex 'break clock_gettime' -ex 'continue' -ex 'delete' -ex 'finish')
fi
timeout 300 sudo gdb -p "$PID" -batch -nx \
  -ex 'set confirm off' -ex 'set unwind-on-signal on' \
  "${SAFE[@]}" \
  -ex 'call (int) PyPyGILState_Ensure()' \
  -ex "call (int) PyPyRun_SimpleString(\"exec(open('$PAY').read(), {'__name__': 'zscrape'})\")" \
  -ex 'call (void) PyPyGILState_Release($1)' \
  -ex 'detach' -ex 'quit' > "$HOME/zruns/scrape/gdb_$PID.log" 2>&1
rc=$?
if [ -s "$HOME/zruns/scrape/scrape_$PID.json" ]; then
  echo "pid $PID: scraped ($(stat -c %s "$HOME/zruns/scrape/scrape_$PID.json") bytes), gdb rc $rc, alive: $(kill -0 $PID 2>/dev/null && echo yes || echo NO)"
else
  echo "pid $PID: NO scrape file, gdb rc $rc, alive: $(kill -0 $PID 2>/dev/null && echo yes || echo NO); see ~/zruns/scrape/gdb_$PID.log"
  cat "$HOME/zruns/scrape/error_$PID.txt" 2>/dev/null
fi
