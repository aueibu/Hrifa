#!/bin/bash
# PC-side watcher for the catalog run on the Spot VM. Polls the VM status; when the VM comes back after being down
# (the zruns session relaunches it), waits for boot and runs ~/ipcat/ensure.sh, then exits so Claude is notified.
# Also nudges ensure.sh every 15 min while the VM is up (it does nothing when the run is going), and exits when the
# catalog has finished. Log: pcwatch.log next to this script.
GCLOUD=C:/Users/apoor/scoop/shims/gcloud.cmd
VM=instance-20261120-235803; ZONE=us-central1-b; PROJECT=project-f5757a43-c874-4e0b-8f8
LOG="$(dirname "$0")/pcwatch.log"
say() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
status() { "$GCLOUD" compute instances describe "$VM" --zone "$ZONE" --project "$PROJECT" --format="value(status)" 2>/dev/null | tr -d '\r'; }
ensure() { ssh -o BatchMode=yes -o ConnectTimeout=60 gvm '~/ipcat/ensure.sh' 2>/dev/null | tr -d '\r'; }

prev=$(status); say "watching: VM is ${prev:-unknown}"
last_nudge=0
while true; do
  sleep 180
  now=$(status)
  [ -z "$now" ] && { say "could not read VM status (will retry)"; continue; }
  if [ "$now" != "$prev" ]; then say "VM status: $prev -> $now"; fi
  if [ "$now" = "RUNNING" ] && [ "$prev" != "RUNNING" ]; then
    say "VM is back up; waiting 3 min for boot, then making sure the catalog resumes"
    sleep 180
    for try in 1 2 3 4 5; do
      out=$(ensure)
      if [ -n "$out" ]; then say "ensure.sh: $out"; break; fi
      say "ssh not ready yet (try $try)"; sleep 120
    done
    say "RELAUNCH HANDLED"
    exit 0
  fi
  if [ "$now" = "RUNNING" ] && [ $(( $(date +%s) - last_nudge )) -ge 900 ]; then
    out=$(ensure); last_nudge=$(date +%s)
    case "$out" in
      *"already finished"*) say "catalog finished"; exit 0 ;;
      *started*) say "ensure.sh had to start the run (it was not running): $out" ;;
    esac
  fi
  prev=$now
done
