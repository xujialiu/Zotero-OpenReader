# Scripts: 1a. Fish Speech: a server of the owner's own (issue #89, 1.11.8)

[Case](../../cases/fish-speech.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | What it checks | What it expects (measured) | Params it reads |
|---|---|---|---|
| `1a15-01-reader-getaudio-a.js` | Calls the live reader's attached `getAudio` twice with the first short sentence from fixture A | Pre-count A 1→2, B stays 1; both blobs 5,477 bytes, SHA-256 `458bed47669598d3c5be2a5f78564b67168079ffb4a6cbbf9c8fbbabd7e5a68f` | none; saves reader index/text and `bella` id/locale in state |
| `1a15-02-preview-a-a.js` | Two Voice browser clicks on `bella` at A; observes the detached audio elements and waits for `ended` | Pre-count A 1→2, B stays 1; two ended events, volume 0, both blobs match A | none |
| `1a15-03-ui-switch-to-b.js` | Same settings window: Disable, edit address, Enable | Disable/edit/Enable all true; B address; field locked; cache on, volume 0 | none |
| `1a15-04-select-multilingual.js` | Selects Fish Speech → Multilingual in the Voice browser | Rows `bella`, `cedar`; provider remains enabled at B | none |
| `1a15-05-reader-getaudio-b.js` | Calls the same attached reader `getAudio` twice with the retained `bella` voice id and fixture text at B | Pre-count B 1→2, A stays 2; both blobs 5,477 bytes, SHA-256 `2a912a134fecac2eb9fafd4e9c64f740bc220085b4c96691dd4c81166f8a02c7` | `state.fishReaderIndex`, `state.fishReaderText`, `state.fishVoiceA` |
| `1a15-06-preview-b-b.js` | Two Voice browser clicks on `bella` at B in the same window | Pre-count B 1→2, A stays 2; two ended events, volume 0, both blobs match B | `state.fishSettingsWindow` |

Before you start:

- Use the disposable Zotero instance and the local Fish Speech fixtures at `127.0.0.1:63670` (A) and `127.0.0.1:63671` (B). Both list `bella` and `cedar`; paid providers and Zotero tiers stay off.
- If the listeners are down, start the supplied fixture server with `python3 test/fixtures/fish-speech/servers.py` (requires `ffmpeg`). It prints the generated audio hashes and holds both loopback ports; this run reused the already-running servers.
- Start with a live attached PDF reader, Fish Speech enabled at A, `cacheAudio` on, volume 0, and memory on `fishspeech::bella`. Keep the same preferences window open for scripts 1–6. The reader text is `Zotero-TTS fixture A, page one.`; the browser sample text is counted separately.
- Run the scripts in table order through `_shared/run.js`. The reader scripts call the attached `getAudio` interface with the same `fishspeech::bella` id/locale across A and B; they do not require a live playback session. Keep the exact per-text `/counts` values from before the case for delta checks.
- At the end, restore the starting A address/enabled state, cache, volume, memory, fixture readers and selected tab. Do not reset the local server counters; the main session owns endpoint disposal.

Limits:

- The Voice browser audio player creates a detached `<audio>` element, so `document.querySelectorAll('audio')` cannot observe it. The two preview scripts temporarily wrap `document.createElementNS` to retain each created element, then restore the method. Both previews ended with element volume 0.
- Before beta3, each exact text already had one request on each server. During this run each server gained exactly one more request per text: A counts `1→2`, B counts `1→2`; A did not change after the switch. The second read/click on each side used that side's cache.
- The reader scripts used the fixture's actual first sentence through the live attached `getAudio` interface. No full playback session was needed for the `getAudio` check; the Voice browser previews did play to `ended`. The separate #218 Shift+Space check activated B from its saved Document voice.
- Source expectation: `audioSetup()` includes normalized Fish Speech `baseURL`, and `cacheVersion()` includes `audioSetup`; the Voice browser sample key uses its `sampleSetup`. This is why changing A→B must produce a fresh audio result. See [settings.ts](../../../../src/core/settings.ts#L519), [index.ts](../../../../src/index.ts#L463), and [voice-browser-rows.ts](../../../../src/ui/voice-browser-rows.ts#L562).

Runs:

| Run | Coverage | Result |
|---|---|---|
| 2026-11-22 / 1.17.3-beta3 ([issue #222 verification](https://github.com/xujialiu/Zotero-OpenReader/issues/222#issuecomment-7069152129), item 1a.15; xpi SHA-256 `25787d3dd5843e94ed5c9f734b7a890be46f3ccb6653dcd9e7a7ddab6eb1b657`) | A/A then B/B; per-text count deltas; reader and preview digests; UI Disable/Edit/Enable; same settings window; cleanup | PASS. Both tested texts gained one request on each server; all A/B bytes matched their endpoint digests, and A received no request after the switch. |
