#!/usr/bin/env bash
# Updates Home Hub when its Settings page asks (Settings → Updates → Update now).
#
# install.sh sets this up to run every minute (cron). Each time, it leaves a note that it's here and whether it can
# update (data/update/updater.json). When the hub has asked (data/update/request), it runs this folder's
# install.sh, as you would by hand. The output goes to data/update/update.log and how it went to
# data/update/status.json, which the hub shows. The hub can only ask: what runs is install.sh, and nothing in the
# request is read.
set -uo pipefail

cd "$(dirname "$0")" || exit 1
# cron starts with a bare PATH.
export PATH="$HOME/.cargo/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
# So that "systemctl --user" works from cron on Linux.
[ "$(uname -s)" = Linux ] && export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

DIR=data/update
mkdir -p "$DIR" || exit 1

jstr() { printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\000-\037')"; }
put() { printf '%s\n' "$2" >"$DIR/.$1.tmp" && mv -f "$DIR/.$1.tmp" "$DIR/$1"; }

why=""
if ! command -v git >/dev/null 2>&1; then
  why="git isn't installed on this machine"
elif [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  why="this folder has changes of its own, which an update would overwrite"
fi
put updater.json "{\"seen_at\": $(date +%s), \"can_update\": $([ -z "$why" ] && echo true || echo false), \"why\": $([ -n "$why" ] && jstr "$why" || echo null)}"

# Cron starts this once a minute. Rather than make a tap on "Update now" wait for the next minute, one copy stays
# for most of the minute and looks every two seconds (a lock stops two copies doing that; a stale one expires).
if ! mkdir "$DIR/.watching" 2>/dev/null; then
  [ -n "$(find "$DIR/.watching" -maxdepth 0 -mmin +3 2>/dev/null)" ] || exit 0
  rm -rf "$DIR/.watching" && mkdir "$DIR/.watching" || exit 0
fi
mine=""
trap 'rm -rf "$DIR/.watching"; [ -z "$mine" ] || rm -rf "$DIR/.running"' EXIT

for _ in $(seq 1 28); do
  if [ -f "$DIR/request" ]; then break; fi
  sleep 2
done
[ -f "$DIR/request" ] || exit 0

# One update at a time (a lock left by a crash expires).
if ! mkdir "$DIR/.running" 2>/dev/null; then
  [ -n "$(find "$DIR/.running" -maxdepth 0 -mmin +60 2>/dev/null)" ] || exit 0
  rm -rf "$DIR/.running" && mkdir "$DIR/.running" || exit 0
fi
mine=1

# Say it's running before taking the request away, so the hub never sees neither.
started="$(date +%s)"
put status.json "{\"state\": \"running\", \"started_at\": $started, \"step\": \"starting\", \"step_at\": $started}"
rm -f "$DIR/request"

if [ -n "$why" ]; then
  put status.json "{\"state\": \"failed\", \"started_at\": $started, \"finished_at\": $(date +%s), \"message\": $(jstr "$why")}"
  exit 0
fi

# install.sh reports its steps (getting the code, tools, building, restarting) into status.json as it goes.
if HH_PROGRESS="$DIR/status.json" HH_STARTED="$started" bash install.sh >"$DIR/update.log" 2>&1; then
  finished="$(date +%s)"
  put last.json "{\"took\": $((finished - started))}"
  put status.json "{\"state\": \"done\", \"started_at\": $started, \"finished_at\": $finished}"
else
  put status.json "{\"state\": \"failed\", \"started_at\": $started, \"finished_at\": $(date +%s), \"message\": \"the build didn't finish: see data/update/update.log\"}"
fi
