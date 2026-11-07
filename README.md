# Multi Browser

A desktop dashboard for running many isolated browser profiles side by side, so each person or account (e.g. each family member's Pinterest) gets its own cookies, logins, history and extensions.

> **Name note:** this repository is called `agent-login`, but the product it
> builds is **Multi Browser** (`package.json` `name: multi-browser`,
> `productName: Multi Browser`, app id `com.infiax.multibrowser`). The repo
> keeps its original name for continuity; everything user-facing says
> Multi Browser.

## Run

```bash
npm install
npm start
```

Build the Windows installer (output in `dist/`):

```bash
npm run dist
```

See [ROADMAP.md](ROADMAP.md) for planned features.

## How it works

- **Electron dashboard** (`src/main.js`, `src/renderer/`) lists, creates, edits and launches profiles.
- **Launcher** (`src/launcher.js`) starts your installed Chrome / Edge / Chromium / Brave with a separate `--user-data-dir` per profile. That folder is the isolation: nothing is shared between profiles.
- **Per-profile settings**
  - Proxy (HTTP, HTTPS, SOCKS4/5), with WebRTC locked to the proxy so it can't leak the real IP
  - Language (`--lang` / `Accept-Language`)
  - Timezone, applied to every tab over the DevTools protocol (`src/cdp.js`), because Chrome on Windows ignores the `TZ` variable
  - Window size, optional custom user agent, start page, owner/group, color and notes
- **Data** lives in `%APPDATA%\multi-browser\data` (`profiles.json`, `settings.json`, and one folder per profile).

## Notes

- Timezone overrides need the dashboard to stay open while that profile is running.
- A custom user agent changes only the UA string, not Chrome's client hints, so leave it empty unless you need it.

## Security

- **DevTools channel (no open port).** When a profile sets a timezone, the
  browser is launched with `--remote-debugging-pipe` and the DevTools
  protocol travels over an anonymous pipe (`src/cdp.js`), not a TCP port.
  No `--remote-debugging-port` is ever opened, so no other local process can
  connect to a profile's browser and drive its logged-in sessions. Profiles
  without a timezone open no DevTools channel at all.
- **Single-user machine.** The app is designed for one user on their own
  machine: profile data is only as private as the OS user account. Anyone
  who can log in as the same Windows/macOS user can read the profile
  folders, so don't run it on a shared account.
- **Profiles are stored in plaintext.** `profiles.json` and the per-profile
  browser folders live under `%APPDATA%\multi-browser\data` (see "Data"
  above) with no encryption. They contain no passwords themselves — logins
  live inside each profile's browser data, protected only by the OS account
  — but treat the folder as sensitive and don't share or back it up
  unencrypted.
- **Proxy authentication is not supported.** `--proxy-server` carries no
  credentials, and this app deliberately does not add proxy username/password
  fields: storing them in the plaintext profile file would be worse than
  not supporting them. If proxy auth is ever added, credentials must go in
  the OS credential store (Electron `safeStorage`), never in `profiles.json`.
- **Renderer hardening.** The dashboard window runs with
  `contextIsolation: true, nodeIntegration: false` (`src/main.js`).

## Screenshots

No screenshots are bundled with the repo yet. The dashboard is a profile
list with per-profile launch/stop controls and a settings panel for browser
path, proxy, language, timezone, window size and user agent (see
[ROADMAP.md](ROADMAP.md)). Screenshots are welcome as a contribution.

## Tests

```bash
npm test
```

Runs the Node test suite (`tests/`, no extra dependencies): launcher argument
building, the DevTools pipe transport framing, and profile store round-trips.
