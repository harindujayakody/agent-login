# Multi Browser

A desktop dashboard for running many isolated browser profiles side by side, so each person or account (e.g. each family member's Pinterest) gets its own cookies, logins, history and extensions.

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
