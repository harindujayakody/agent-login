// Applies per-profile overrides (currently timezone) to every tab of a running
// browser over the DevTools protocol. Chrome on Windows ignores the TZ env var,
// so this is the reliable way to make each profile report its own timezone.
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

async function waitForDevToolsPort(dataDir, timeoutMs = 15000) {
  const file = path.join(dataDir, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const [port, wsPath] = fs.readFileSync(file, 'utf8').trim().split('\n');
      if (port && wsPath) return `ws://127.0.0.1:${port.trim()}${wsPath.trim()}`;
    } catch {
      // File not written yet.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Browser did not open its DevTools port in time');
}

// Call before launching, so a stale file from a previous run isn't mistaken for the new port.
function clearDevToolsPort(dataDir) {
  fs.rmSync(path.join(dataDir, 'DevToolsActivePort'), { force: true });
}

async function attachOverrides(dataDir, { timezone, startUrl }) {
  const url = await waitForDevToolsPort(dataDir);
  const ws = new WebSocket(url, { perMessageDeflate: false });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  let nextId = 1;
  let navigatedStart = !startUrl;
  const send = (method, params = {}, sessionId) => {
    const msg = { id: nextId++, method, params };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  };

  const autoAttach = (sessionId) =>
    send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.method !== 'Target.attachedToTarget') return;
    const { sessionId, targetInfo } = msg.params;
    if (targetInfo.type === 'page' || targetInfo.type === 'iframe') {
      if (timezone) send('Emulation.setTimezoneOverride', { timezoneId: timezone }, sessionId);
      // Cover workers and out-of-process iframes spawned by this page too.
      autoAttach(sessionId);
      if (!navigatedStart && targetInfo.type === 'page') {
        navigatedStart = true;
        send('Page.navigate', { url: startUrl }, sessionId);
      }
    }
    send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  });

  autoAttach();
  return ws;
}

module.exports = { attachOverrides, clearDevToolsPort };
