# Scripts: webdav-reply-bounds — a WebDAV reply bounded in time and size (issue #169)

[Case](../../cases/webdav-reply-bounds.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

Items 1–8 of the case, run in the order 1–6, **8**, **7**. Item 1 runs the two
sandbox diagnostics against the test WebDAV; items 2–6 and 8 point the
`zotero-tts.webdav.url` pref at the local stub (one request each), item 7 puts
the test configuration back and confirms it; then the stub stops.
`sharedSettings()` is the download path (`GET`
`zotero-tts-shared-settings.json`), `settingsFiles()` the listing
(`PROPFIND` on the folder). The stub (`stub-server.cjs`, started/stopped
outside Zotero) answers whatever the file or method under five folders and
logs one JSON line per request: `method`, `path`, `bodyBytes`/`socketBytes`,
and `msAfterRequest` with `how` — `client` = full close or reset by the
client, `client-fin` = the client closed its side (FIN), `client-reset` =
socket error, `end` = the stub finished the response, `404` = unknown folder.
Since 1.16.5-beta2 a failure aborts a chrome-window `AbortController`, whose
abort closes the connection — a close line for items 2, 3, 5 and 8 is
required evidence.

| Script | Checks | Expected | Params |
| --- | --- | --- | --- |
| `webdav-01-baseline.js` | Startup identity, Zotero/window/readers, the six named webdav prefs (password as set/length), debug store on, errors ring, position rows | `version` the build, every step `ok`, `failed` empty; snapshot into `state.prefs`; `debugWasStoring` recorded | none |
| `webdav-02-isolate.js` | Test-WebDAV isolation (baseline.md "Test WebDAV first"): syncs suspended, transports settled, destination switched/confirmed | `isolationConfirmed: true`, `urlAlreadyTestConfig: true`, no in-flight/pending transport work | `secretsFile` |
| `webdav-03-item1-test-webdav.js` | Item 1: the stream path runs in the sandbox against the test WebDAV | neither diagnostic errors; `urlMatchesTestConfig` true both; `count` > 0; the listing names `zotero-tts-shared-settings.json`; no TypeError / getReader / Permission denied | `secretsFile` |
| `webdav-04-item2-stall-download.js` | Item 2: `/stall/` through `sharedSettings()` (GET), URL restored in a `finally` | error `The reply from <stubUrl> stalled: nothing arrived for 15 s.` in 15–17 s; the stub logs the GET's close within ~1 s of the answer | `secretsFile`, `stubPort`, `stubLog` |
| `webdav-05-item3-stall-list.js` | Item 3: the same through `settingsFiles()` (PROPFIND) | same error and window; the PROPFIND's close logged | same |
| `webdav-06-item4-oversize-chunked.js` | Item 4: `/big/` (chunked spaces to 64 MiB, no Content-Length) | error `The reply from <stubUrl> is larger than 10 MB; no file of ours is that big.` well under 15 s, never `stalled`; close logged with `bodyBytes` ≥ 10 MiB and < 64 MiB (the `response.text()` path has no cap and would answer a JSON parse error instead) | same |
| `webdav-07-item5-oversize-declared.js` | Item 5: `/declared/` (Content-Length 10485761, then one body byte, then nothing) | the same `is larger than 10 MB` error < 2 s, never `stalled`, never `No reply`; close logged within ~1 s of the answer, `bodyBytes` 1 | same |
| `webdav-08-item6-broken.js` | Item 6: `/broken/` (socket destroyed mid-chunk) | error `The reply from <stubUrl> broke off: ` + Gecko's reason, at once (< 2 s); a different WebDAVError naming the stub is reported verbatim, not a FAIL | same |
| `webdav-11-item8-silent.js` | Item 8: `/silent/` (request read, then nothing at all — no status line) through `sharedSettings()` | error `No reply from <stubUrl> within 15 s.` in 15–17 s, never `Cannot reach` (the abort's own rejection must not replace the deadline's); close logged within ~1 s | same |
| `webdav-09-item7-restore-confirm.js` | Item 7: the test configuration back (rewrites only if the match is gone) and the client working | url matches the file raw and normalized; both diagnostics answer as item 1 | `secretsFile` |
| `webdav-10-cleanup.js` | Cleanup per the baseline rules: `state.prefs` back (the url byte-identical), debug store as found, transports idle | every restored pref equal to the snapshot; syncs back to their originals (here: off); window left minimized | `secretsFile` |

## Before you start

- `zotero_ping`; the branch xpi installed (`zotero_plugin_install`, no
  restart) and `diagnostics.startup()` all `ok`. Build identity for
  1.16.5-beta2 and later: the installed bundle contains both
  `stalled: nothing arrived for` and `function webdavDeps()` (grep the xpi in
  the profile's `extensions/`, or compare SHA-256 with `build/zotero-tts.xpi`).
- webdav-01 + webdav-02 run before anything else; the three automatic syncs
  stay off for the whole case, and the URL pref is the only state the items
  touch (a detour to `http://127.0.0.1:<port>/…` only, restored in each
  script's `finally`).
- Start the stub from this folder:
  `node test/zotero-dev/scripts/webdav-reply-bounds/stub-server.cjs > .tmp/zotero-dev/webdav-reply-bounds/stub.log 2>&1 &`
  — the ephemeral port is the log's first `{"ev":"listening",…}` line, whose
  `pid` is the one to `kill` at the end (the shell's `$!` can be a wrapper's);
  pass the port as `stubPort`, the log path as `stubLog`, the test file as
  `secretsFile` (`~/.secrets/Zotero-TTS/test_webdav.txt`). A curl self-test
  (`curl -m 1.5` per folder; `/declared/` must download exactly 1 byte,
  `/silent/` must return nothing at all) proves the stub before Zotero
  touches it; restart it after a self-test so the log holds only Zotero's run.
- Items 2, 3 and 8 take 15–17 s each — the whole group is ~70 s: run it
  through the kit runner in the table's order (1–6, 8, 7, cleanup), one
  `zotero_execute_js` starts it, a background `sleep 90` covers it, one
  `wait` collects.
- After item 7: stop the stub (`kill <pid from the listening line>`), then
  webdav-10-cleanup. Finish with `zotero_read_errors` and
  `Zotero.ZoteroTTSRun.api.reset()`.

## Limits

- Gecko's `fetch` resolves a reply only once a body byte has arrived
  (2026-10-04, proved from chrome scope): a head alone left the fetch pending
  until the headers timeout. That is why `/declared/` sends one body byte
  after its head — the cap refusal then fires at once.
- A missing close line for items 2, 3, 5 or 8 is a FAIL on beta2 or later:
  the abort of the chrome-window controller is what must close the
  connection. Check the socket state (`lsof -nP -iTCP:<port>`) and report it;
  on 1.16.5-beta, which only cancelled the stream, every silent-server socket
  stayed ESTABLISHED for minutes (even after `forceGC`+`forceCC`).

## Runs

| Run | What it verified | Observed |
| --- | --- | --- |
| 2026-10-04, Zotero-TTS 1.16.5-beta2, Zotero 10.0.6-beta.1 | Items 1–8 + baseline/isolation/cleanup on the abort fix (issue #169; table: [#169 closing comment](https://github.com/xujialiu/Zotero-TTS/issues/169#issuecomment-5976186530)). All eleven scripts last ran here, `webdav-11-item8-silent.js` new and `webdav-07-item5-oversize-declared.js` revised for the abort expectations; items 1–5, 8, 7, cleanup ran as one runner group, item 6 after it through `one()` (omitted from the group's script list; the stub was restarted on a second port for it) | baseline/isolation PASS; 1 PASS (161 ms, `count` 60, listing 3 files, no error); 2 PASS (exact error at 15.17 s, close `client-fin` at 15.16 s); 3 PASS (15.04 s, close `client-fin` at 15.04 s); 4 PASS (18 ms; 14,680,064 bytes; close `client-reset` at 16 ms); 5 PASS (2 ms, exact error, never `stalled`/`No reply`, 1 byte, close `client-fin` at 1 ms); 6 PASS (25 ms, `broke off: Error in input stream`, close `client` at 7 ms); 8 PASS (exact `No reply … within 15 s.` at 15.01 s, never `Cannot reach`, close `client-fin` at 15.01 s); 7 PASS; cleanup PASS — no ESTABLISHED socket left (lsof: listener only) |
| 2026-10-04, Zotero-TTS 1.16.5-beta, Zotero 10.0.6-beta.1 | Items 1–7 + baseline/isolation/cleanup; continuation of the interrupted 1.16.4 run (issue #169; table: [#169 comment](https://github.com/xujialiu/Zotero-TTS/issues/169#issuecomment-5976059674)) | baseline/isolation PASS; 1 PASS (`count` 60, listing 3 files, no error); 2 FAIL (error exact at 15.1 s; no client close); 3 FAIL (15.0 s; no close); 4 PASS (37 ms; 22,544,384 bytes; close 43 ms); 5 FAIL (headers timeout at 15.1 s — refusal unreachable, see Limits); 6 PASS (16 ms; `broke off: Error in input stream`); 7 PASS; cleanup PASS |
