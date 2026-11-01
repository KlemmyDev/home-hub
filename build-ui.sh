#!/usr/bin/env bash
# Rebuild the dashboard (ui/, React with TanStack Start) into web/, which the hub embeds in its binary.
# Only needed after changing ui/. The built web/ is kept in git, so installing and updating the hub never needs Node.
set -euo pipefail
cd "$(dirname "$0")/ui"
# Rules that stop the screen jumping when a sheet opens: fields are focused through ui/src/lib/focus.ts, never with
# the autoFocus attribute or a bare .focus(), which scroll the page behind to show the field.
if grep -rn "autoFocus" src --include='*.tsx' --include='*.ts' | grep -v "src/lib/focus.ts" | grep . || grep -rn "\.focus(" src --include='*.tsx' --include='*.ts' | grep -v preventScroll | grep -v "src/lib/focus.ts" | grep .; then
  echo "Stop: use useAutoFocus / focusRef from lib/focus.ts instead of autoFocus or .focus() without preventScroll (see the lines above)." >&2
  exit 1
fi
npm ci
npx vite build
rm -rf ../web
cp -R dist/client ../web
echo "Built the dashboard into web/. Now run: cargo build --release"
