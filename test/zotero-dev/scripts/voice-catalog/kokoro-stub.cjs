// Loopback Kokoro stub for the voice-catalog kit (issue #261 live run).
// 127.0.0.1 only; stores counters and booleans only — never header values,
// bodies or URLs. The /v1/audio/voices answer is HELD until released so the
// live voice list can be observed while one source is loading.
//
// Launch:   node kokoro-stub.cjs <port>        (default 8973)
// POST /control/hold-voices?mode=pass|empty|fail   arm the next listing
// POST /control/release                            finish every held listing
// POST /control/reset                              settle held (as fail), zero counters
// GET  /control/state      -> { held, voicesTotal, voicesReleased, speechTotal,
//                                 sawCredentialLikeHeader, sawAnyHeader }
// POST /control/stop        -> settle held (as fail), exit
const http = require('http');
const PORT = Number(process.argv[2] || 8973);
const state = { held: new Set(), mode: 'pass', voicesTotal: 0, voicesReleased: 0, speechTotal: 0, sawCredentialLikeHeader: false, sawAnyHeader: false };
const sockets = new Set();

function toneWav() {
  const rate = 22050, seconds = 0.35, n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = toneWav();

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

function finish(entry) {
  if (entry.done) return;
  entry.done = true;
  state.held.delete(entry);
  state.voicesReleased++;
  try {
    if (state.mode === 'fail') { entry.res.writeHead(500, { 'Content-Type': 'application/json' }); entry.res.end(JSON.stringify({ error: 'stub refused the listing' })); }
    else if (state.mode === 'empty') json(entry.res, 200, { voices: [] });
    else json(entry.res, 200, { voices: [{ id: 'af_sample', name: 'Sample (fixture)' }] });
  } catch (e) { /* client gone */ }
}

const server = http.createServer((req, res) => {
  const authish = Object.keys(req.headers || {}).some(h => /auth|key|token|cookie/i.test(h));
  if (authish) state.sawCredentialLikeHeader = true;
  if (req.headers && Object.keys(req.headers).length) state.sawAnyHeader = true;
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname === '/v1/audio/voices' && req.method === 'GET') {
    state.voicesTotal++;
    const entry = { res, done: false };
    state.held.add(entry);
    entry.timer = setTimeout(() => { state.mode = 'fail'; finish(entry); }, 30000);
    return;
  }
  if (u.pathname === '/v1/audio/speech' && req.method === 'POST') {
    state.speechTotal++;
    res.writeHead(200, { 'Content-Type': 'audio/wav' });
    res.end(WAV);
    return;
  }
  if (u.pathname === '/dev/captioned_speech') { res.writeHead(404); res.end(); return; }
  if (u.pathname === '/control/hold-voices') { state.mode = u.searchParams.get('mode') || 'pass'; json(res, 200, { mode: state.mode }); return; }
  if (u.pathname === '/control/release') { for (const e of Array.from(state.held)) finish(e); json(res, 200, { released: state.voicesReleased }); return; }
  if (u.pathname === '/control/reset') { for (const e of Array.from(state.held)) { state.mode = 'fail'; finish(e); } state.voicesTotal = 0; state.voicesReleased = 0; state.speechTotal = 0; json(res, 200, { reset: true }); return; }
  if (u.pathname === '/control/stop') { for (const e of Array.from(state.held)) { state.mode = 'fail'; finish(e); } res.writeHead(200); res.end('bye'); setTimeout(() => process.exit(0), 200); return; }
  if (u.pathname === '/control/state') { json(res, 200, { held: state.held.size, voicesTotal: state.voicesTotal, voicesReleased: state.voicesReleased, speechTotal: state.speechTotal, sawCredentialLikeHeader: state.sawCredentialLikeHeader, sawAnyHeader: state.sawAnyHeader }); return; }
  res.writeHead(404); res.end();
});
server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
server.listen(PORT, '127.0.0.1', () => console.log('kokoro-stub on 127.0.0.1:' + PORT));
process.on('SIGTERM', () => { for (const e of Array.from(state.held)) { state.mode = 'fail'; finish(e); } process.exit(0); });
