#!/usr/bin/env bash
# Rebuild the dashboard (ui/, React with TanStack Start) into web/, which the hub embeds in its binary.
# Only needed after changing ui/. The built web/ is kept in git, so installing and updating the hub never needs Node.
set -euo pipefail
cd "$(dirname "$0")/ui"
npm ci
npx vite build
rm -rf ../web
cp -R dist/client ../web
echo "Built the dashboard into web/. Now run: cargo build --release"
