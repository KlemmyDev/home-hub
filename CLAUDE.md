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
- Overview Today card: Day (timeline of what's left today) and Week (one short row per day with event chips) switch in place; Month, "Open calendar" and tapping a day open the full Calendar.
- Phones: when the screen's short side is under 600px the stage becomes 430 wide (as tall as the screen needs) at about real size, instead of the scaled-down tablet stage. Overview scrolls with the cards in one column, Week becomes a day-by-day list, Month shows dots, Day's hours scroll, and the dock shows icons only. Safe areas (notch, home bar) are read through `#probe`. Tablets keep the fixed stage below.
- The dashboard is a fixed 800 x 1280 portrait stage (the S10 FE+ in portrait, about 800 x 1280 CSS px: an estimate, check `innerWidth` on the tablet) scaled to fit the screen, so landscape just letterboxes for now. Light theme, Comfortaa for the greeting and clock, Onest for everything else; the widget cards borrow each app's own look (PocketPals violet sky and pals, WattsMyPower dark card and house). Fonts load from Google Fonts and fall back to system fonts.
- Calendars come from iCal addresses (Google "Secret address in iCal format", Apple public link, Outlook publish link) pasted into Settings. No accounts or sign-in. `src/calendar.rs` downloads them with `curl` every ten minutes, reads the events (time zones, repeats, skipped dates and moved occurrences included) and answers `GET /api/events?from=&to=` (RFC 3339). The addresses are secrets: they live only in `data/config.json` (git-ignored) and are never sent back to the screen. Day, Week and Month views are on the Calendar tab. Imported calendars only read.
- Family and hub events: `src/family.rs` keeps the family (name + colour) and events made on the hub in `data/family.json` (git-ignored; times are the family's own wall clock, no time zones). Hub events reuse the calendar engine for repeats (daily/weekly with days/monthly/yearly, interval, until a day) and can skip one day. API: `POST /api/people` (replace the list), `GET/POST /api/hub-event`, `POST /api/hub-event/delete` (`only` skips one occurrence). `/api/events` returns them with `hub`, `series`, `people`; people also come in `/api/state`. Editing a repeating event changes all of it; deleting can be just one day.
- Navigation: no top nav. A round menu button sits bottom-left; tapping it grows into a floating dock (Overview, Calendar, Menu, Shopping, plus Chores and Energy when those widgets are set up). The Calendar card grows out of the Overview Today card and shrinks back. The calendar header holds a compact clock and date. Designs live in the "Klemm Home Hub" design artifact (boards NavA to NavF, CalFlow, CalDay, CalWeek, CalMonth).
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
