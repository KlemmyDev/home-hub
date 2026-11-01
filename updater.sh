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

[ -f "$DIR/request" ] || exit 0

# One at a time: cron starts another run every minute while an update is going (a lock left by a crash expires).
if ! mkdir "$DIR/.running" 2>/dev/null; then
  [ -n "$(find "$DIR/.running" -maxdepth 0 -mmin +60 2>/dev/null)" ] || exit 0
  rm -rf "$DIR/.running" && mkdir "$DIR/.running" || exit 0
fi
trap 'rm -rf "$DIR/.running"' EXIT

# Say it's running before taking the request away, so the hub never sees neither.
put status.json "{\"state\": \"running\", \"started_at\": $(date +%s)}"
rm -f "$DIR/request"

if [ -n "$why" ]; then
  put status.json "{\"state\": \"failed\", \"message\": $(jstr "$why")}"
  exit 0
fi

if bash install.sh >"$DIR/update.log" 2>&1; then
  put status.json "{\"state\": \"done\", \"finished_at\": $(date +%s)}"
else
  put status.json "{\"state\": \"failed\", \"message\": \"the build didn't finish: see data/update/update.log\"}"
fi
