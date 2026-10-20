// Local, credential-free OpenAI-compatible stub for the provider-controls
// kit (issues #214–#216 verification). Loopback only, no logging of
// request bodies, headers, or URLs beyond counters.
//
// Launch:   node stub-server.cjs <port>       (default 8931)
// Stop:     POST /control/stop                (settles held, exits)
// Contract:
//   GET  /v1/models                       -> { data: [{ id: 'stub-tts-model' }] }
//   GET  /v1/audio/voices                 -> { voices: [{ id: 'stub-voice', name: 'Stub Voice' }] }
//   POST /v1/audio/speech                 -> HELD until released; 30 s self-fault (504)
//   POST /control/release?mode=pass|fail  -> finishes every held speech request
//   POST /control/reset                   -> settles held (as fail), zeroes counters
//   GET  /control/state                   -> { held, speechTotal, released }   (counts only)
//   POST /control/stop                    -> settle held (as fail), destroy sockets, exit
// The stub never reads or stores Authorization headers or request bodies;
// state is counters only. Held replies are always settled (never dropped)
// before their entries are discarded.
const http = require('http');
const PORT = Number(process.argv[2] || 8931);
const state = { held: new Set(), speechTotal: 0, released: 0, stopping: false };
const sockets = new Set();

const MP3 = Buffer.from(
  'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//uQxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATmNvchg=',
  'base64',
);

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// Finish one held request. mode 'fail' -> 500 with a stub reason; 'pass' -> mp3 bytes.
function finish(entry, mode) {
  if (entry.done) return;
  entry.done = true;
  clearTimeout(entry.timer);
  state.held.delete(entry);
  try {
    if (mode === 'pass') {
      entry.res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': MP3.length });
      entry.res.end(MP3);
    } else {
      json(entry.res, mode === 'timeout' ? 504 : 500, { error: { message: 'stub ' + (mode || 'fail'), type: 'server_error' } });
    }
  } catch (e) {
    /* client went away */
  }
}

function settleAll(mode) {
  const pending = [...state.held];
  for (const entry of pending) {
    finish(entry, mode);
    state.released += 1;
  }
  return pending.length;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/v1/models') {
    return json(res, 200, { data: [{ id: 'stub-tts-model' }] });
  }
  if (req.method === 'GET' && url.pathname === '/v1/audio/voices') {
    return json(res, 200, { voices: [{ id: 'stub-voice', name: 'Stub Voice' }] });
  }
  if (req.method === 'POST' && url.pathname === '/v1/audio/speech') {
    state.speechTotal += 1;
    const entry = { res, done: false };
    state.held.add(entry);
    // Safety net: never hold past the client's own 15 s timeout plus slack.
    entry.timer = setTimeout(() => finish(entry, 'timeout'), 30000);
    return; // hold: no response yet
  }
  if (req.method === 'POST' && url.pathname === '/control/release') {
    const mode = url.searchParams.get('mode') === 'pass' ? 'pass' : 'fail';
    const n = settleAll(mode);
    return json(res, 200, { released: n, mode });
  }
  if (req.method === 'GET' && url.pathname === '/control/state') {
    return json(res, 200, { held: state.held.size, speechTotal: state.speechTotal, released: state.released });
  }
  if (req.method === 'POST' && url.pathname === '/control/reset') {
    // Settle first, then discard: a pending check reads a deterministic
    // failure instead of hanging on a dropped connection.
    const settled = settleAll('fail');
    state.speechTotal = 0;
    state.released = 0;
    return json(res, 200, { ok: true, settled });
  }
  if (req.method === 'POST' && url.pathname === '/control/stop') {
    json(res, 200, { ok: true, settled: settleAll('fail') });
    setTimeout(() => {
      state.stopping = true;
      for (const s of sockets) s.destroy();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1000).unref();
    }, 50);
    return;
  }
  return json(res, 404, { error: 'not found', path: url.pathname });
});

server.on('connection', (s) => {
  sockets.add(s);
  s.on('close', () => sockets.delete(s));
});

server.listen(PORT, '127.0.0.1', () => console.log(`stub listening on 127.0.0.1:${PORT}`));
