#!/usr/bin/env bash
# Runs the hub from this folder, with the settings in .env. The service and "bash start.sh" both use it.
cd "$(dirname "$0")" || exit 1
[ -f .env ] && { set -a; . ./.env; set +a; }
exec ./target/release/home-hub
