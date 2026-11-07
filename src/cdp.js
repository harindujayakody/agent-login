// Applies per-profile overrides (currently timezone) to every tab of a running
// browser over the DevTools protocol. Chrome on Windows ignores the TZ env var,
// so this is the reliable way to make each profile report its own timezone.
//
// Transport: the browser is launched with `--remote-debugging-pipe`, so the
// DevTools protocol travels over an anonymous pipe (file descriptors 3/4)
// instead of a TCP port. No DevTools port is ever opened, so no other local
// process can connect to a profile's browser and drive its logged-in sessions.
// Messages are NUL-delimited JSON, per the Chromium DevTools pipe protocol.

// Framing for the DevTools pipe: JSON messages separated by NUL bytes.
// `writeStream` is the browser's fd 3 (commands in), `readStream` is fd 4
// (events/replies out).
function createPipeTransport(writeStream, readStream) {
  let buf = Buffer.alloc(0);
  const handlers = new Set();

  readStream.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let idx;
    while ((idx = buf.indexOf(0)) !== -1) {
      const raw = buf.slice(0, idx).toString('utf8');
      buf = buf.slice(idx + 1);
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        continue; // Ignore malformed frames; the pipe stays usable.
      }
      for (const handler of [...handlers]) handler(msg);
    }
  });

  return {
    send(obj) {
      writeStream.write(JSON.stringify(obj) + '\0');
    },
    onMessage(fn) {
      handlers.add(fn);
      return () => handlers.delete(fn);
    },
    close() {
      try {
        writeStream.end();
      } catch {
        // Already closed.
      }
    },
  };
}

// Attach timezone overrides to a browser launched with --remote-debugging-pipe.
// `pipeIn`/`pipeOut` are the child process streams for fds 3 and 4
// (child.stdio[3] / child.stdio[4]). Returns a handle with a close() method.
async function attachOverrides(pipeIn, pipeOut, { timezone, startUrl }) {
  if (!pipeIn || !pipeOut) {
    throw new Error('DevTools pipe streams are not available for this profile');
  }
  const transport = createPipeTransport(pipeIn, pipeOut);

  let nextId = 1;
  let navigatedStart = !startUrl;
  const send = (method, params = {}, sessionId) => {
    const msg = { id: nextId++, method, params };
    if (sessionId) msg.sessionId = sessionId;
    transport.send(msg);
  };

  const autoAttach = (sessionId) =>
    send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);

  transport.onMessage((msg) => {
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
  return transport;
}

module.exports = { attachOverrides, createPipeTransport };
