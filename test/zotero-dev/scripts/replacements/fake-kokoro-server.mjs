// A Kokoro-FastAPI-shaped test server for the Local provider (issue #237,
// items 6-9): the word-timed voice the reading checks play, and the log of
// every request's TEXT — the outgoing request the case reads, not a debug
// line. Run it with node, outside Zotero, and stop it afterwards:
//   ZTTS_FAKE_PORT=8792 ZTTS_FAKE_LOG=<abs .tmp/zotero-dev/replacements/fake-kokoro.log> node fake-kokoro-server.mjs
// Answers GET /v1/audio/voices ({ voices: [{ id, name }] }), POST
// /dev/captioned_speech ({ audio: <base64 wav>, timestamps: [{ word,
// start_time, end_time }] }) and /v1/audio/speech (the wav): a SILENT 16 kHz
// mono clip, about 0.05 s per input character (1 s at least), so the Engine's
// timings look like a real word-timed voice's. Voices default to af_bella —
// the document voice the kit plants. One JSON line per synthesis request to
// ZTTS_FAKE_LOG: time, path, voice, chars, the input TEXT, the running
// count. Headers are never logged. The first stdout line is { port, pid };
// GET /stats returns the counts; SIGTERM stops it.
import http from 'node:http';
import fs from 'node:fs';

const port = Number(process.env.ZTTS_FAKE_PORT || 8792);
const logFile = process.env.ZTTS_FAKE_LOG || '';
const voices = String(process.env.ZTTS_FAKE_VOICES || 'af_bella').split(',').map(v => v.trim()).filter(Boolean);
const counts = { voices: 0, captioned: 0, speech: 0 };
const sampleRate = 16_000;

const wav = seconds => {
  const samples = Math.round(sampleRate * seconds);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(buf.length - 8, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  return buf;
};
const send = (res, status, body, type = 'application/json') => {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': data.length, 'Access-Control-Allow-Origin': '*' });
  res.end(data);
};
const log = entry => {
  if (!logFile) return;
  try { fs.appendFileSync(logFile, JSON.stringify({ t: Date.now(), ...entry }) + '\n'); } catch { /* the log is a convenience */ }
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, Buffer.alloc(0));
  if (req.method === 'GET' && req.url === '/v1/audio/voices') {
    counts.voices++;
    log({ path: '/v1/audio/voices', n: counts.voices });
    return send(res, 200, JSON.stringify({ voices: voices.map(id => ({ id, name: 'Fake ' + id })) }));
  }
  if (req.method === 'GET' && req.url === '/stats') return send(res, 200, JSON.stringify(counts));
  if (req.method === 'POST' && (req.url === '/dev/captioned_speech' || req.url === '/v1/audio/speech')) {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      let input = '', voice = voices[0];
      try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); input = String(body.input || ''); voice = body.voice || voice; } catch { /* an empty request still gets a clip */ }
      const seconds = Math.max(1, input.length * 0.05);
      const audio = wav(seconds);
      if (req.url === '/dev/captioned_speech') {
        counts.captioned++;
        log({ path: req.url, voice, chars: input.length, input, n: counts.captioned });
        const words = input.trim().split(/\s+/).filter(Boolean);
        const step = Math.max(0.03, (seconds - 0.02) / Math.max(1, words.length));
        const timestamps = words.map((word, i) => ({ word, start_time: i * step, end_time: Math.min(seconds - 0.02, (i + 1) * step) }));
        return send(res, 200, JSON.stringify({ audio: audio.toString('base64'), timestamps }));
      }
      counts.speech++;
      log({ path: req.url, voice, chars: input.length, input, n: counts.speech });
      return send(res, 200, audio, 'audio/wav');
    });
    return;
  }
  send(res, 404, JSON.stringify({ error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => process.stdout.write(JSON.stringify({ port, pid: process.pid }) + '\n'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
