# Home Hub

A self-hosted family dashboard for a fridge-mounted Samsung Galaxy Tab S10 FE+.

## Goals

- Family calendars
- Weekly menu
- Shopping lists
- Widgets for PocketPals
- Widgets for WattsMyPower

## Status

Early version: first-run setup, a portrait tablet dashboard (greeting and clock, today's calendar card, PocketPals and WattsMyPower cards that open the apps, tonight's dinner), and updating from the hub's own Settings page. Calendars: in Settings, paste each calendar's private iCal address (Google, Apple and Outlook all give one) and its events appear on Today and on the Calendar tab (Day, Week, Month). You can also add events right on the hub: tap **+ New** on the Calendar tab (or an empty time slot) to set a name, start and end, all day, repeats (daily, weekly on chosen days, monthly, yearly, until a day) and who it's for. Add the family in the Calendar tab (+ Family) or Settings. The Dinners tab keeps a list of the family's dinners and lets you plan one for each day of the week (tonight's shows on the dashboard). The Shopping tab is a simple list: add things, tick them off, clear the ticked ones. Add `?demo` to the address to preview the dashboard with sample events and dinner.

## Install

On Linux (a Raspberry Pi or mini PC) or a Mac:

```bash
curl -fsSL https://raw.githubusercontent.com/KlemmyDev/home-hub/main/install.sh | bash
```

It downloads the hub into `./home-hub`, installs Rust if needed, builds it, starts it, and sets it to start at boot. Then open the address it prints on the tablet and follow the setup.

The hub has no sign-in, so keep it on your home network and don't expose it to the internet.

## Updating

Open Settings (the cog) on the hub. When a new version is out, tap **Update now**. Or run `bash install.sh` in the folder.
