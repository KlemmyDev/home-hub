# Home Hub

A self-hosted family dashboard for a fridge-mounted Samsung Galaxy Tab S10 FE+.

## Goals

- Family calendars
- Weekly menu
- Shopping lists
- Widgets for PocketPals
- Widgets for WattsMyPower

## Status

Early version: first-run setup, a tablet dashboard with PocketPals and WattsMyPower tiles, and updating from the hub's own Settings page.

## Install

On Linux (a Raspberry Pi or mini PC) or a Mac:

```bash
curl -fsSL https://raw.githubusercontent.com/KlemmyDev/home-hub/main/install.sh | bash
```

It downloads the hub into `./home-hub`, installs Rust if needed, builds it, starts it, and sets it to start at boot. Then open the address it prints on the tablet and follow the setup.

The hub has no sign-in, so keep it on your home network and don't expose it to the internet.

## Updating

Open Settings (the cog) on the hub. When a new version is out, tap **Update now**. Or run `bash install.sh` in the folder.
