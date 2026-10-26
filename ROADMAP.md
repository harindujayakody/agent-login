# Roadmap

Status: ✅ done · 🟡 partial · ⬜ planned

## Features

| Feature | What it means | Status |
| --- | --- | --- |
| **Profile dashboard** | Organizes profiles using names, folders, tags, notes, and search. | 🟡 Names, owner groups, colors, notes and search work. Tags and nested folders are planned. |
| **Bulk actions** | Creates, launches, edits, or organizes multiple profiles together. | ⬜ Planned: multi-select, bulk launch/close, bulk proxy import, bulk move to group. |
| **Isolated browser profiles** | Keeps each profile's cookies, logins, and browsing storage separate. | ✅ Each profile runs with its own `--user-data-dir`. |
| **Browser fingerprint management** | Controls the browser and device information websites can observe, such as operating system, screen size, language, and graphics-related signals. | 🟡 Language, timezone, window size and user agent work. OS, screen, fonts and graphics (canvas/WebGL) signals are planned. |
| **Automation and APIs** | Lets scripts create and launch profiles and automate browser tasks. | ⬜ Planned: local REST API plus a DevTools (CDP) endpoint per profile for Puppeteer/Playwright. |

## What "isolated browser profiles" means

Each profile acts like a separate browser, with its own cookies, saved logins, history, and site data. Logging in to a site in one profile won't log you in inside another.

Each profile can also have its own fingerprint and proxy settings, so websites see different browser setups and network addresses.

## Isolation checklist

| Area | Why it matters | Status |
| --- | --- | --- |
| Cookies and login sessions | One profile's login must not carry into another. | ✅ Separate data folder per profile |
| Local storage and session storage | Websites often save account or app data here. | ✅ Separate data folder per profile |
| Cache and site data | Stops saved page data from crossing profiles. | ✅ Separate data folder per profile |
| Browser fingerprint settings | OS, browser version, language, time zone, screen size, fonts, graphics signals. | 🟡 Language, time zone, window size, user agent. Rest planned |
| Proxy and network settings | Gives each profile its own IP route and network identity. | 🟡 HTTP/HTTPS/SOCKS4/SOCKS5. SOCKS username/password not supported by Chrome; planned via a local proxy bridge |
| WebRTC and DNS behavior | Can reveal network details outside the proxy. | 🟡 WebRTC locked to the proxy. Built-in leak check planned |
| Permissions and device settings | Location, camera, microphone, notifications. | 🟡 Granted permissions stay per profile. Geolocation override planned |
| Extensions and browser configuration | Extensions can share data or create a recognizable setup. | 🟡 Extensions are per profile. Managing them from the dashboard is planned |
| Downloads and saved files | Separate folders keep account files organized. | ⬜ Planned: per-profile download folder |
| Passwords and autofill data | Avoids entering one account's details in another profile. | ✅ Separate data folder per profile |
| Session restore and sync | Prevents tabs, history, or data from syncing across profiles. | ✅ Chrome Sync disabled; session restore is per profile |

> Isolation is only as strong as the implementation and your settings. A proxy or fingerprint setting alone does not guarantee that websites will treat profiles as unrelated.

## Next up

1. Tags and bulk actions on the dashboard
2. Per-profile download folder
3. Local proxy bridge for SOCKS5 with username/password
4. Screen, OS and graphics fingerprint settings
5. Local API for scripts (create, launch, stop, get CDP endpoint)
