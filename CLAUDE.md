# Home Hub

A private, self-hosted family dashboard for a Samsung Galaxy Tab S10 FE+ mounted on the fridge. The tablet is a wall display: landscape, always on, glanceable from a metre away, touch-friendly for quick edits.

## What it shows

- Family calendars
- Weekly menu
- Shopping lists
- Widgets for PocketPals (the family's chores and pocket-money app, in `~/PocketPals`)
- Widgets for WattsMyPower (household energy)

## Working agreements

- Stack (decided with the owner): Rust backend (axum + tokio, one small binary), a single-file vanilla HTML/CSS/JS UI embedded in it (no framework, no build step), settings in `data/config.json`. Runs on the owner's own machine as a systemd user service (Linux) or launchd agent (Mac), installed by `install.sh`.
- Updates: the hub's Settings page only *asks* (writes `data/update/request`); a per-minute cron job runs `updater.sh`, which runs `install.sh` (git pull, cargo build, restart) and reports in `data/update/status.json`. Same pattern as PocketPals.
- Widgets are listed in `CATALOG` in `src/main.rs` (PocketPals and WattsMyPower so far); each is a name plus the web address of the app on the home network.
- The owner self-hosts this. Prefer simple, low-maintenance choices (one small service, file or SQLite storage, no external accounts unless needed).
- Design for the tablet first: large type, high contrast, no hover-only interactions, screen stays awake.
- Keep secrets (API keys, calendar tokens) in `.env`, never in the repo. Keep `.env.example` current.
- Use plain, calm words in the interface; no jargon.
- Commit small and often. Ask before pushing, creating PRs or changing the repo's settings.

## Commands

- Build: `cargo build --release`; test: `cargo test`
- Run: `bash start.sh` (reads `.env`, default port 8787)
- Install or update: `bash install.sh` (`--no-service` to only build, `--uninstall` to remove)
