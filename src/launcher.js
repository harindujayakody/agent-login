// Finds an installed Chromium-based browser and launches it with an isolated profile.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { attachOverrides } = require('./cdp');

const CANDIDATES = [
  ['Google Chrome', '%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe'],
  ['Google Chrome', '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe'],
  ['Google Chrome', '%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe'],
  ['Chromium', '%LocalAppData%\\Chromium\\Application\\chrome.exe'],
  ['Microsoft Edge', '%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe'],
  ['Microsoft Edge', '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe'],
  ['Brave', '%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
  ['Google Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  ['Chromium', '/usr/bin/chromium'],
  ['Chromium', '/usr/bin/chromium-browser'],
  ['Google Chrome', '/usr/bin/google-chrome'],
];

function expandEnv(p) {
  return p.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
}

function detectBrowsers() {
  const seen = new Set();
  const found = [];
  for (const [name, raw] of CANDIDATES) {
    const p = expandEnv(raw);
    if (!p || seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    if (fs.existsSync(p)) found.push({ name, path: p });
  }
  return found;
}

function buildArgs(profile, dataDir) {
  const args = [
    `--user-data-dir=${dataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    // Stops WebRTC from leaking the real local/public IP around a proxy.
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  ];

  const { proxy } = profile;
  if (proxy && proxy.type !== 'none' && proxy.host && proxy.port) {
    args.push(`--proxy-server=${proxy.type}://${proxy.host}:${proxy.port}`);
  }
  if (profile.language) {
    args.push(`--lang=${profile.language}`, `--accept-lang=${profile.language}`);
  }
  if (profile.userAgent) args.push(`--user-agent=${profile.userAgent}`);
  if (profile.windowWidth && profile.windowHeight) {
    args.push(`--window-size=${profile.windowWidth},${profile.windowHeight}`);
  }
  if (profile.timezone) {
    // Timezone is applied over DevTools (see cdp.js), which also opens the start page
    // once the override is in place, so the first page load already sees it.
    // --remote-debugging-pipe carries DevTools over an anonymous pipe instead of
    // a TCP port, so no other local process can connect to this browser.
    args.push('--remote-debugging-pipe', 'about:blank');
  } else if (profile.startUrl) {
    args.push(profile.startUrl);
  }
  return args;
}

class Launcher {
  constructor(onChange) {
    this.running = new Map(); // profile id -> child process
    this.onChange = onChange;
  }

  isRunning(id) {
    return this.running.has(id);
  }

  runningIds() {
    return [...this.running.keys()];
  }

  launch(profile, dataDir, browserPath) {
    if (this.running.has(profile.id)) return;
    if (!browserPath || !fs.existsSync(browserPath)) {
      throw new Error('No browser found. Set the browser path in Settings.');
    }
    fs.mkdirSync(dataDir, { recursive: true });

    // With --remote-debugging-pipe the browser uses fds 3 (commands in) and 4
    // (events out); pass them through as pipes only when a timezone override
    // needs the DevTools channel. Otherwise keep stdio ignored.
    const needsPipe = Boolean(profile.timezone);
    const child = spawn(browserPath, buildArgs(profile, dataDir), {
      cwd: path.dirname(browserPath),
      detached: false,
      stdio: needsPipe ? ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] : 'ignore',
    });
    this.running.set(profile.id, child);
    this.onChange();

    let devtools = null;
    if (needsPipe) {
      attachOverrides(child.stdio[3], child.stdio[4], profile)
        .then((transport) => {
          devtools = transport;
          if (!this.running.has(profile.id)) transport.close();
        })
        .catch((err) => console.error(`[${profile.name}] timezone override failed:`, err.message));
    }

    const done = () => {
      if (devtools) devtools.close();
      if (this.running.get(profile.id) === child) {
        this.running.delete(profile.id);
        this.onChange();
      }
    };
    child.on('exit', done);
    child.on('error', done);
  }

  stop(id) {
    const child = this.running.get(id);
    if (!child) return;
    if (process.platform === 'win32') {
      // Kill the whole browser process tree, not just the launcher process.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  }

  stopAll() {
    for (const id of this.runningIds()) this.stop(id);
  }
}

module.exports = { Launcher, detectBrowsers, buildArgs };
