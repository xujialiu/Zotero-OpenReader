import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { wordAt } from '../../../../src/core/engine/words';
import { encodeCommand, WINDOWS_DAEMON_SCRIPT, WINDOWS_POWERSHELL, windowsCommandArguments } from '../../../../src/core/providers/system/daemon-script.win';
import { decodeFrameBody, encodeFrame, timestampsFromMarks, type SystemRequest, type SystemResponse } from '../../../../src/core/providers/system/protocol';

const ANDREW = 'sapi5/MicrosoftWindows.Voice.en-US.AndrewHD.1';
const ONLINE = 'sapi5/Edge-en-US-AndrewNeural';
const MULTILINGUAL = 'sapi5/Edge-en-US-AndrewMultilingualNeural';
const DAVID = 'sapi5/TTS_MS_EN-US_DAVID_11.0';
const TEXT = 'One. Two. Three.';

/** Read the WAV's own chunks: System.Speech does not use a 44-byte header. */
function acousticWords(bytes: Buffer) {
  let rate = 0;
  let pcm: Buffer = Buffer.alloc(0);
  for (let p = 12; p + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', p, p + 4);
    const size = bytes.readUInt32LE(p + 4);
    if (name === 'fmt ') {
      rate = bytes.readUInt32LE(p + 12);
      expect(bytes.readUInt16LE(p + 10)).toBe(1); // mono
      expect(bytes.readUInt16LE(p + 22)).toBe(16);
    }
    if (name === 'data') {
      pcm = bytes.subarray(p + 8, p + 8 + size);
      break;
    }
    p += 8 + size + (size % 2);
  }
  expect(rate).toBeGreaterThan(0);
  const window = Math.round(rate * 0.01);
  const rms: number[] = [];
  for (let p = 0; p + window * 2 <= pcm.length; p += window * 2) {
    let energy = 0;
    for (let i = 0; i < window; i++) energy += pcm.readInt16LE(p + i * 2) ** 2;
    rms.push(Math.sqrt(energy / window));
  }
  const threshold = Math.max(20, Math.max(...rms) * 0.02);
  const words: { start: number; end: number }[] = [];
  let start: number | null = null;
  let last = 0;
  for (let i = 0; i <= rms.length; i++) {
    if (i < rms.length && rms[i] >= threshold) {
      if (start === null) start = i;
      last = i;
    }
    if (start !== null && (i === rms.length || i - last > 12)) {
      if (last - start >= 5) words.push({ start: start * 10, end: (last + 1) * 10 });
      start = null;
    }
  }
  return { rate, words };
}

function runHelper(script: string, requests: SystemRequest[]): Map<number, SystemResponse> {
  const encoded = encodeCommand(script, binary => Buffer.from(binary, 'binary').toString('base64'));
  const result = spawnSync(WINDOWS_POWERSHELL, windowsCommandArguments(encoded), {
    input: Buffer.concat(requests.map(encodeFrame)),
    // Zotero's Subprocess environment has no PATH; native format probing
    // (including Add-Type's C# compiler) must not depend on npm's PATH.
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')), PATH: '' },
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr.toString()).toBe(0);
  const responses = new Map<number, SystemResponse>();
  for (let p = 0; p < result.stdout.length;) {
    const length = result.stdout.readUInt32LE(p);
    const response = decodeFrameBody(result.stdout.subarray(p + 4, p + 4 + length));
    responses.set(response.id, response);
    p += 4 + length;
  }
  expect(responses.get(0)?.ready).toBe(true);
  return responses;
}

/**
 * Native integration for #242, not a mark-count or source-string test.
 * Runs only on Windows, and skips an exact local voice if it is not installed.
 * No Online substitution, audio playback, registry writes, or Zotero state.
 * Andrew -> David -> Andrew goes through ONE actual long-lived helper.
 */
describe.skipIf(process.platform !== 'win32')('the Windows helper word clock', () => {
  let dir = '';
  let voices: string[] = [];
  let responses = new Map<number, SystemResponse>();
  const cases = [
    { name: 'Andrew HD', id: 2, voice: ANDREW, rate: 24000 },
    { name: 'David Desktop after Andrew', id: 3, voice: DAVID, rate: 16000 },
    { name: 'Andrew HD after David', id: 4, voice: ANDREW, rate: 24000 },
  ];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ztts-word-clock-'));
    const requests: SystemRequest[] = [{ id: 1, op: 'voices' }];
    for (const c of cases) requests.push({ id: c.id, op: 'speak', voice: c.voice, text: TEXT, file: join(dir, `${c.id}.wav`) });
    responses = runHelper(WINDOWS_DAEMON_SCRIPT, requests);
    expect(responses.get(1)?.ok).toBe(true);
    voices = (responses.get(1)?.voices ?? []).map(v => v.id);
  }, 35000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  for (const c of cases) {
    it(`keeps the highlighted word with the audio for ${c.name}`, context => {
      if (!voices.includes(c.voice)) context.skip(`Local voice is not installed: ${c.voice}`);
      const response = responses.get(c.id)!;
      expect(response.ok, response.error).toBe(true);
      const audio = acousticWords(readFileSync(join(dir, `${c.id}.wav`)));
      expect(audio.words, 'fixture must have three independently audible words').toHaveLength(3);
      const marks = response.words ?? [];
      const timings = timestampsFromMarks(marks, response.ms ?? 0, TEXT);
      expect(timings, 'real word timestamps, not sentence fallback').toHaveLength(3);
      for (let i = 0; i < audio.words.length; i++) {
        // Coarse 300 ms tolerance avoids treating phonetic onset/jitter as drift.
        expect(Math.abs(marks[i].t - audio.words[i].start), `word ${i + 1} drift in ms`).toBeLessThanOrEqual(300);
        expect(wordAt(timings, 0, (audio.words[i].end - 30) / 1000), `highlight while saying word ${i + 1}`).toBe(i);
      }
      expect(audio.rate, 'each voice keeps its own negotiated PCM rate').toBe(c.rate);
    });
  }

  it('keeps audio but withholds unverified SAPI marks, without affecting OneCore', context => {
    if (!voices.includes(DAVID)) context.skip('Local David Desktop is not installed');
    const handshake = `Send '{"id":0,"ok":true,"ready":true}'`;
    const script = WINDOWS_DAEMON_SCRIPT.replace(handshake, `function SapiFormat($token) { return $null }\n${handshake}`);
    expect(script, 'the controlled format-query failure must actually be injected').not.toBe(WINDOWS_DAEMON_SCRIPT);
    const file = join(dir, 'fallback.wav');
    const requests: SystemRequest[] = [{ id: 1, op: 'speak', voice: DAVID, text: TEXT, file }];
    const mark = 'onecore/MSTTS_V110_enUS_MarkM';
    if (voices.includes(mark)) requests.push({ id: 2, op: 'speak', voice: mark, text: TEXT, file: join(dir, 'onecore.wav') });
    const replies = runHelper(script, requests);
    const fallback = replies.get(1)!;
    expect(fallback.ok, fallback.error).toBe(true);
    expect(acousticWords(readFileSync(file)).words).toHaveLength(3);
    expect(fallback.words).toEqual([]);
    expect(fallback.timingNote).toBe('the SAPI voice audio format could not be verified; using sentence highlighting');
    if (voices.includes(mark)) {
      const onecore = replies.get(2)!;
      expect(onecore.ok, onecore.error).toBe(true);
      expect(onecore.words).toHaveLength(3);
      expect(onecore.timingNote).toBeUndefined();
    }
  }, 35000);
});

/** Real selection with a read-only ping probe; no Windows setting is changed. */
describe.skipIf(process.platform !== 'win32')('the Windows helper exact voice selection', () => {
  let dir = '';
  let installed: string[] = [];
  let responses = new Map<number, SystemResponse>();
  const cases = [
    { name: 'Andrew HD', voice: ANDREW, speak: 2, ping: 3 },
    { name: 'Andrew Online after Andrew HD', voice: ONLINE, speak: 4, ping: 5 },
    { name: 'AndrewMultilingual Online', voice: MULTILINGUAL, speak: 6, ping: 7 },
    { name: 'Andrew HD again', voice: ANDREW, speak: 8, ping: 9 },
  ];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ztts-exact-voice-'));
    const catalog = runHelper(WINDOWS_DAEMON_SCRIPT, [{ id: 1, op: 'voices' }]).get(1)!;
    expect(catalog.ok, catalog.error).toBe(true);
    installed = (catalog.voices ?? []).map(v => v.id);
    if (![ANDREW, ONLINE, MULTILINGUAL].every(id => installed.includes(id))) return;
    const ping = `'ping' { Send ('{"id":' + $id + ',"ok":true}') }`;
    const probe = `'ping' { Send ('{"id":' + $id + ',"ok":true,"voice":' + (JStr $script:spokenToken) + '}') }`;
    const speak = '$s.Speak($text)';
    const capture = `${speak}; $script:spokenToken = $s.Voice.Id`;
    expect(WINDOWS_DAEMON_SCRIPT.split(ping)).toHaveLength(2);
    expect(WINDOWS_DAEMON_SCRIPT.split(speak)).toHaveLength(2);
    const script = WINDOWS_DAEMON_SCRIPT.replace(ping, probe).replace(speak, capture);
    expect(script).not.toBe(WINDOWS_DAEMON_SCRIPT);
    // Observe the token during Speak, before restoring flags resets the default.
    expect(script.replace(probe, ping).replace(capture, speak)).toBe(WINDOWS_DAEMON_SCRIPT);
    const requests: SystemRequest[] = [{ id: 1, op: 'voices' }];
    for (const c of cases) {
      requests.push({ id: c.speak, op: 'speak', voice: c.voice, text: 'One.', file: join(dir, `${c.speak}.wav`) });
      requests.push({ id: c.ping, op: 'ping' });
    }
    requests.push({ id: 10, op: 'voices' });
    responses = runHelper(script, requests);
  }, 35000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function requireAndrews(context: { skip(note?: string): never }): void {
    const missing = [ANDREW, ONLINE, MULTILINGUAL].filter(id => !installed.includes(id));
    if (missing.length) context.skip(`Exact voices are not installed: ${missing.join(', ')}`);
  }

  for (const c of cases) {
    it(`selects the exact token and produces audio for ${c.name}`, context => {
      requireAndrews(context);
      const response = responses.get(c.speak)!;
      expect(response.ok, response.error).toBe(true);
      const selected = responses.get(c.ping)!;
      expect('voice' in selected ? selected.voice : undefined).toBe(c.voice.slice('sapi5/'.length));
      expect(acousticWords(readFileSync(join(dir, `${c.speak}.wav`))).words.length).toBeGreaterThan(0);
      expect(response.ms).toBeGreaterThan(0);
      expect((response.words?.length ?? 0) > 0 || !!response.timingNote).toBe(true);
    });
  }

  it('restores all candidate eligibility and raw catalog identities after switching', context => {
    requireAndrews(context);
    expect(responses.get(10)?.voices).toEqual(responses.get(1)?.voices);
  });

  it('restores eligibility after a selection error and accepts the next request', context => {
    requireAndrews(context);
    const selection = /\$s\.SelectVoice\([^\r\n]+\)/;
    expect(WINDOWS_DAEMON_SCRIPT.match(new RegExp(selection.source, 'g'))).toHaveLength(1);
    const script = WINDOWS_DAEMON_SCRIPT.replace(selection, `if ($token -eq 'Edge-en-US-AndrewNeural') { throw 'controlled selection failure' }; $&`);
    expect(script).not.toBe(WINDOWS_DAEMON_SCRIPT);
    const replies = runHelper(script, [
      { id: 1, op: 'voices' },
      { id: 2, op: 'speak', voice: ONLINE, text: 'One.', file: join(dir, 'error.wav') },
      { id: 3, op: 'voices' },
      { id: 4, op: 'speak', voice: ANDREW, text: 'One.', file: join(dir, 'recovered.wav') },
    ]);
    expect(replies.get(2)).toMatchObject({ ok: false, error: 'controlled selection failure' });
    expect(replies.get(3)?.voices).toEqual(replies.get(1)?.voices);
    expect(replies.get(4)?.ok, replies.get(4)?.error).toBe(true);
    expect(acousticWords(readFileSync(join(dir, 'recovered.wav'))).words.length).toBeGreaterThan(0);
  }, 35000);

  it('rejects a different selected token and missing targets without changing eligibility', context => {
    requireAndrews(context);
    const selection = /\$s\.SelectVoice\([^\r\n]+\)/;
    const script = WINDOWS_DAEMON_SCRIPT.replace(selection, `$&; if ($token -eq 'MicrosoftWindows.Voice.en-US.AndrewHD.1') { $token = 'controlled-wrong-token' }`);
    expect(script).not.toBe(WINDOWS_DAEMON_SCRIPT);
    const replies = runHelper(script, [
      { id: 1, op: 'voices' },
      { id: 2, op: 'speak', voice: ANDREW, text: 'One.', file: join(dir, 'wrong-token.wav') },
      { id: 3, op: 'voices' },
      { id: 4, op: 'speak', voice: 'sapi5/NotAnInstalledVoice', text: 'One.', file: join(dir, 'missing.wav') },
      { id: 5, op: 'voices' },
    ]);
    expect(replies.get(2)).toMatchObject({ ok: false, error: 'SAPI selected a different voice than controlled-wrong-token' });
    expect(replies.get(3)?.voices).toEqual(replies.get(1)?.voices);
    expect(replies.get(4)).toMatchObject({ ok: false, error: 'no enabled voice: NotAnInstalledVoice' });
    expect(replies.get(5)?.voices).toEqual(replies.get(1)?.voices);
  }, 35000);

  it('does not enable a deliberately disabled voice while selecting another', context => {
    requireAndrews(context);
    if (!installed.includes(DAVID)) context.skip('Local David Desktop is not installed');
    const handshake = `Send '{"id":0,"ok":true,"ready":true}'`;
    const disable = `foreach ($v in (SapiSynth).GetInstalledVoices()) { if ($v.VoiceInfo.Id -eq 'TTS_MS_EN-US_DAVID_11.0') { $v.Enabled = $false } }`;
    const script = WINDOWS_DAEMON_SCRIPT.replace(handshake, `${disable}\n${handshake}`);
    expect(script).not.toBe(WINDOWS_DAEMON_SCRIPT);
    const replies = runHelper(script, [
      { id: 1, op: 'voices' },
      { id: 2, op: 'speak', voice: ONLINE, text: 'One.', file: join(dir, 'disabled-other.wav') },
      { id: 3, op: 'speak', voice: DAVID, text: 'One.', file: join(dir, 'disabled-target.wav') },
      { id: 4, op: 'voices' },
    ]);
    expect(replies.get(1)?.voices?.some(v => v.id === DAVID)).toBe(false);
    expect(replies.get(2)?.ok, replies.get(2)?.error).toBe(true);
    expect(replies.get(3)?.ok).toBe(false);
    expect(replies.get(4)?.voices).toEqual(replies.get(1)?.voices);
  }, 35000);
});
