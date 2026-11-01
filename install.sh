#!/usr/bin/env bash
# Install or update Home Hub. It runs on Linux (a Raspberry Pi, a mini PC) and on a Mac.
#
#   Install:  curl -fsSL https://raw.githubusercontent.com/KlemmyDev/home-hub/main/install.sh | bash
#   Update:   cd home-hub && bash install.sh      (the hub's Settings page can also do this by itself)
#
# Run from anywhere but a Home Hub folder, it downloads Home Hub into ./home-hub (installing nothing but git and
# Rust if they're missing), builds it, starts it, and sets it to start whenever the machine does. Run inside that
# folder, it updates it. Your settings (.env) and data (data/) are never overwritten.
#
# Options:  --no-service  build only: don't set up starting at boot or updating from the hub's Settings page
#           --no-pull     don't fetch the latest version first
#           --uninstall   stop it and remove the start-at-boot entry and updater. Your data stays in this folder.
#           -h, --help    show this help
#
# First install only:  HH_DIR=/path   folder to install into (default: ./home-hub)
#                      HH_REPO=<url>  where to download it from (default: GitHub over https)
set -euo pipefail

REPO="${HH_REPO:-https://github.com/KlemmyDev/home-hub.git}"
CRON_TAG="# Home Hub: updates from the hub"
LABEL=dev.klemmy.home-hub
SERVICE=home-hub

SERVICE_SETUP=1; PULL=1; UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-service) SERVICE_SETUP=0 ;;
    --no-pull) PULL=0 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) sed -n '2,/^set -e/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
# When the hub's updater runs this, it says where it is up to, so the screen can show it (steps: pull, tools, build, start).
progress() {
  [ -n "${HH_PROGRESS:-}" ] || return 0
  printf '{"state": "running", "started_at": %s, "step": "%s", "step_at": %s}\n' "${HH_STARTED:-0}" "$1" "$(date +%s)" >"$HH_PROGRESS.tmp" 2>/dev/null \
    && mv -f "$HH_PROGRESS.tmp" "$HH_PROGRESS" 2>/dev/null || true
}
die() { printf '\nSomething went wrong: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
OS="$(uname -s)"

# Where are we? Inside a Home Hub folder (this script's own), or somewhere else (piped from curl).
here=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/Cargo.toml" ] \
   && grep -q '^name = "home-hub"' "$(dirname "${BASH_SOURCE[0]}")/Cargo.toml" 2>/dev/null; then
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [ -z "$here" ]; then
  have git || die "git isn't installed. Install it first (Linux: sudo apt install git; Mac: xcode-select --install), then run this again."
  DIR="${HH_DIR:-$PWD/home-hub}"
  if [ -d "$DIR/.git" ]; then
    echo "Home Hub is already in $DIR."
  else
    say "Downloading Home Hub into $DIR"
    git clone --depth 1 "$REPO" "$DIR" || die "couldn't download $REPO. If it's private, set HH_REPO to an address you can use (for example the git@github.com: one)."
  fi
  exec bash "$DIR/install.sh" "$@"
fi
cd "$here"

if [ "$UNINSTALL" = 1 ]; then
  say "Removing Home Hub's start-at-boot entry and updater"
  if [ "$OS" = Darwin ]; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
  else
    systemctl --user disable --now "$SERVICE" 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/$SERVICE.service"
    systemctl --user daemon-reload 2>/dev/null || true
    systemctl disable --now "$SERVICE" 2>/dev/null || true
    rm -f "/etc/systemd/system/$SERVICE.service"
    systemctl daemon-reload 2>/dev/null || true
  fi
  (crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true) | crontab - 2>/dev/null || true
  echo "Done. Your data is still in $here/data (delete this folder to remove everything)."
  exit 0
fi

# 1. The latest version.
if [ "$PULL" = 1 ] && [ -d .git ]; then
  progress pull
  say "Getting the latest version"
  git pull --ff-only || die "couldn't update: this folder has changes of its own. Undo them (git status shows what), then run this again."
  # The pull may have changed this very script, which bash is still reading: carry on in the new copy instead.
  if [ -z "${HH_REEXEC:-}" ]; then HH_REEXEC=1 exec bash "$here/install.sh" --no-pull "$@"; fi
fi

# 2. A C compiler (Rust needs one to link), then Rust itself, if they aren't here yet.
as_root() { if [ "$(id -u)" = 0 ]; then "$@"; elif have sudo; then sudo "$@"; else return 1; fi; }
if ! have cc && ! have gcc && ! have clang; then
  progress tools
  say "Installing a C compiler (Rust needs one)"
  if [ "$OS" = Darwin ]; then
    die "the Mac's developer tools are missing. Run: xcode-select --install   then run this again."
  elif have apt-get; then as_root apt-get update -qq && as_root apt-get install -y build-essential
  elif have dnf; then as_root dnf install -y gcc make
  elif have apk; then as_root apk add build-base
  elif have pacman; then as_root pacman -Sy --noconfirm base-devel
  else false; fi || die "couldn't install a C compiler. Install gcc (Debian/Ubuntu: sudo apt install build-essential), then run this again."
fi
export PATH="$HOME/.cargo/bin:$PATH"
if ! have cargo; then
  have curl || die "curl isn't installed, and it's needed to fetch Rust."
  progress tools
  say "Installing Rust (the language the hub is written in)"
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path
  export PATH="$HOME/.cargo/bin:$PATH"
fi

# 3. Build. The old version keeps running until the new one is ready.
progress build
say "Building Home Hub (the first time takes a few minutes)"
cargo build --release --locked 2>/dev/null || cargo build --release

[ -f .env ] || cp .env.example .env
chmod 600 .env
PORT_NOW="$(sed -n 's/^PORT=//p' .env | tail -n1)"; PORT_NOW="${PORT_NOW:-8787}"

# 4. Start it, now and at every boot.
progress start
restart_service() {
  if [ "$OS" = Darwin ]; then
    launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null
  elif [ "$(id -u)" = 0 ]; then
    systemctl restart "$SERVICE" 2>/dev/null
  else
    systemctl --user restart "$SERVICE" 2>/dev/null
  fi
}

if [ "$SERVICE_SETUP" = 1 ]; then
  say "Setting it to start whenever this machine does"
  if [ "$OS" = Darwin ]; then
    plist="$HOME/Library/LaunchAgents/$LABEL.plist"
    mkdir -p "$(dirname "$plist")" data
    cat >"$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$here/start.sh</string></array>
  <key>WorkingDirectory</key><string>$here</string>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$here/data/hub.log</string>
  <key>StandardErrorPath</key><string>$here/data/hub.log</string>
</dict></plist>
PLIST
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist"
  elif have systemctl; then
    # As root (a server or container) it's a system service; otherwise it's the user's own.
    if [ "$(id -u)" = 0 ]; then SCTL="systemctl"; unit="/etc/systemd/system/$SERVICE.service"; WANTED=multi-user.target
    else SCTL="systemctl --user"; unit="$HOME/.config/systemd/user/$SERVICE.service"; WANTED=default.target; fi
    mkdir -p "$(dirname "$unit")"
    cat >"$unit" <<UNIT
[Unit]
Description=Home Hub
After=network-online.target

[Service]
WorkingDirectory=$here
ExecStart=/bin/bash $here/start.sh
Restart=always

[Install]
WantedBy=$WANTED
UNIT
    $SCTL daemon-reload
    $SCTL enable "$SERVICE" >/dev/null 2>&1
    if [ "$(id -u)" != 0 ]; then
      # Without this, a user service only runs while that user is logged in.
      loginctl enable-linger "$USER" 2>/dev/null || echo "(To start at boot without logging in, run once: sudo loginctl enable-linger $USER)"
    fi
    $SCTL restart "$SERVICE"
  else
    echo "No service manager found. Start it with: bash $here/start.sh"
  fi

  # The updater: every minute it checks whether the hub's Settings page asked for an update.
  if have crontab; then
    chmod +x updater.sh
    { crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true; echo "* * * * * /bin/bash \"$here/updater.sh\" >/dev/null 2>&1 $CRON_TAG"; } | crontab -
  else
    echo "cron isn't available, so updating from the hub's Settings page won't work. Run bash install.sh to update."
  fi
else
  restart_service || true
fi

# 5. Where to find it.
ip=""
if have hostname; then ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"; fi
if [ -z "$ip" ] && have ipconfig; then ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"; fi
cat <<MSG

Home Hub is ready.

  On the tablet, open:   http://${ip:-YOUR-MACHINE-ADDRESS}:$PORT_NOW
  On this machine:       http://localhost:$PORT_NOW

The first time you open it, it walks you through setup. Updates are in Settings (the cog).
MSG
