# Home Hub

A private, self-hosted family dashboard for a Samsung Galaxy Tab S10 FE+ mounted on the fridge. The tablet is a wall display: portrait (landscape later), always on, glanceable from a metre away, touch-friendly for quick edits.

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
- The dashboard is a fixed 800 x 1280 portrait stage (the S10 FE+ in portrait, about 800 x 1280 CSS px: an estimate, check `innerWidth` on the tablet) scaled to fit the screen, so landscape just letterboxes for now. Light theme, Comfortaa for the greeting and clock, Onest for everything else; the widget cards borrow each app's own look (PocketPals violet sky and pals, WattsMyPower dark card and house). Fonts load from Google Fonts and fall back to system fonts.
- Calendars come from iCal addresses (Google "Secret address in iCal format", Apple public link, Outlook publish link) pasted into Settings. No accounts or sign-in. `src/calendar.rs` downloads them with `curl` every ten minutes, reads the events (time zones, repeats, skipped dates and moved occurrences included) and answers `GET /api/events?from=&to=` (RFC 3339). The addresses are secrets: they live only in `data/config.json` (git-ignored) and are never sent back to the screen. Day, Week and Month views are on the Calendar tab; they only read, nothing is edited on the hub yet.
- Only show real data. The calendar and dinner cards show an empty state until they're connected; open the hub with `?demo` to see them filled with sample content. Don't put the family's real names in the repo (it is public); the pals and logo are PocketPals brand art, embedded as data in `web/index.html`.
- Time format: Settings has a 12-hour / 24-hour choice, saved as `hour24` in `data/config.json` (`POST /api/clock`) and used by the big clock and every event time.
- The Menu and Shopping list tabs only say "Coming soon" so far.
- Installable web app: `web/manifest.webmanifest` (display `fullscreen`), `web/sw.js` (network first, falls back to the saved page offline, never stores `/api`) and the logo in `web/icon.svg` plus PNGs in `web/icons/`, all embedded in the binary and served by `src/main.rs`. Browsers only allow service workers on `https://` or `localhost`, so the tablet needs one of those (or Chrome's "Insecure origins treated as secure" flag set to the hub's address).
- Keep secrets (API keys, calendar tokens) in `.env`, never in the repo. Keep `.env.example` current.
- Use plain, calm words in the interface; no jargon.
- Commit small and often. Ask before pushing, creating PRs or changing the repo's settings.

## Commands

- Build: `cargo build --release`; test: `cargo test`
- Run: `bash start.sh` (reads `.env`, default port 8787)
- Install or update: `bash install.sh` (`--no-service` to only build, `--uninstall` to remove)
