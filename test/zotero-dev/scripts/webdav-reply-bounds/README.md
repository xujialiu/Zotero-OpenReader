# Scripts: webdav-reply-bounds — a WebDAV reply bounded in time and size (issue #169)

[Case](../../cases/webdav-reply-bounds.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

Items 1–7 of the case. Item 1 runs the two sandbox diagnostics against the
test WebDAV; items 2–6 point the `zotero-tts.webdav.url` pref at the local
stub (one request each), item 7 puts the test configuration back and
confirms it. `sharedSettings()` is the download path (`GET`
`zotero-tts-shared-settings.json`), `settingsFiles()` the listing
(`PROPFIND` on the folder). The stub (`stub-server.cjs`, started/stopped
outside Zotero) answers whatever the method under four folders and logs one
JSON line per request: `method`, `path`, `bodyBytes`/`socketBytes`, and
`msAfterRequest` with `how` — `client` = full close or reset by the client,
`client-fin` = the client closed its side (FIN), `client-reset` = socket
error, `end` = the stub finished the response, `404` = unknown folder.

| Script | Checks | Expected | Params |
| --- | --- | --- | --- |
| `webdav-01-baseline.js` | Startup identity, Zotero/window/readers, the six named webdav prefs (password as set/length), debug store on, errors ring, position rows | `version` the build, every step `ok`, `failed` empty; snapshot into `state.prefs`; `debugWasStoring` recorded | none |
| `webdav-02-isolate.js` | Test-WebDAV isolation (baseline.md "Test WebDAV first"): syncs suspended, transports settled, destination switched/confirmed | `isolationConfirmed: true`, `urlAlreadyTestConfig: true`, no in-flight/pending transport work | `secretsFile` |
| `webdav-03-item1-test-webdav.js` | Item 1: the stream path runs in the sandbox against the test WebDAV | neither diagnostic errors; `urlMatchesTestConfig` true both; `count` > 0; the listing names `zotero-tts-shared-settings.json`; no TypeError / getReader / Permission denied | `secretsFile` |
| `webdav-04-item2-stall-download.js` | Item 2: `/stall/` through `sharedSettings()` (GET), URL restored in a `finally` | error `The reply from <stubUrl> stalled: nothing arrived for 15 s.` in 15–17 s; the stub logs the GET's close within ~1 s of the answer | `secretsFile`, `stubPort`, `stubLog` |
| `webdav-05-item3-stall-list.js` | Item 3: the same through `settingsFiles()` (PROPFIND) | same error and window; the PROPFIND's close logged | same |
| `webdav-06-item4-oversize-chunked.js` | Item 4: `/big/` (chunked spaces to 64 MiB, no Content-Length) | error `The reply from <stubUrl> is larger than 10 MB; no file of ours is that big.` well under 15 s, never `stalled`; close logged with `bodyBytes` ≥ 10 MiB and < 64 MiB (the `response.text()` path has no cap and would answer a JSON parse error instead) | same |
| `webdav-07-item5-oversize-declared.js` | Item 5: `/declared/` (Content-Length 10485761, then nothing) | the case expected the same error < 2 s, never `stalled` — unreachable in Gecko, see Limits; the script still records the error, the window check and the close | same |
| `webdav-08-item6-broken.js` | Item 6: `/broken/` (socket destroyed mid-chunk) | error `The reply from <stubUrl> broke off: ` + Gecko's reason, at once (< 2 s); a different WebDAVError naming the stub is reported verbatim, not a FAIL | same |
| `webdav-09-item7-restore-confirm.js` | Item 7: the test configuration back (rewrites only if the match is gone) and the client working | url matches the file raw and normalized; both diagnostics answer as item 1 | `secretsFile` |
| `webdav-10-cleanup.js` | Cleanup per the baseline rules: `state.prefs` back (the url byte-identical), debug store as found, transports idle | every restored pref equal to the snapshot; syncs back to their originals (here: off); window left minimized | `secretsFile` |

## Before you start

- `zotero_ping`; the branch xpi installed (`zotero_plugin_install`, no
  restart) and `diagnostics.startup()` all `ok`. Build identity: the
  installed bundle contains `stalled: nothing arrived for` (grep the xpi in
  the profile's `extensions/`, or compare SHA-256 with `build/zotero-tts.xpi`).
- webdav-01 + webdav-02 run before anything else; the three automatic syncs
  stay off for the whole case, and the URL pref is the only state the items
  touch (a detour to `http://127.0.0.1:<port>/…` only, restored in each
  script's `finally`).
- Start the stub from this folder:
  `node test/zotero-dev/scripts/webdav-reply-bounds/stub-server.cjs > .tmp/zotero-dev/webdav-reply-bounds/stub.log 2>&1 &`
  — the ephemeral port is the log's first `{"ev":"listening",…}` line; pass
  it as `stubPort`, the log path as `stubLog`, the test file as
  `secretsFile` (`~/.secrets/Zotero-TTS/test_webdav.txt`). A curl self-test
  (`curl -m 1.5` per folder) proves it before Zotero touches it; restart the
  stub after a self-test so the log holds only Zotero's run.
- Items 2 and 3 take 15–17 s each, item 5 15 s: run the group through the
  kit runner — one `zotero_execute_js` starts it, a background `sleep 60`
  covers it, one `wait` collects.
- After item 7: stop the stub (`kill <pid>`), then webdav-10-cleanup.
  Finish with `zotero_read_errors` and `Zotero.ZoteroTTSRun.api.reset()`.

## Limits

- 2026-10-04, first stub attempt: `writeHead` alone never sent
  `/declared/`'s headers (Node flushes them on the first body write), so the
  fetch never saw them; and only full socket closes were logged, so a
  client half-close went unseen. Fixed in the stub: `res.flushHeaders()` on
  `/declared/`, and `client-fin`/`client-reset` close modes from the socket.
- 2026-10-04, item 5: Gecko's `fetch` does not resolve a reply whose head
  carries no body byte — proved from chrome scope (diagnosis, not sandbox
  proof): `/declared/` still pending at 4 s (aborted), `/stall/` resolved in
  7 ms; with one body byte after the head the sandbox refuses in 44 ms with
  exactly the case's `is larger than 10 MB` error. Against a silent
  `/declared/` the client answers `No reply from <url> within 15 s.` at
  15.1 s — bounded, never `stalled`, but not the case's expected error. The
  case is the main session's to correct.
- 2026-10-04, items 2/3 and the declared path: the cancel does not close the
  connection. `reader.cancel()` / `body.cancel()` left every silent-server
  socket ESTABLISHED for minutes (also after `Cu.forceGC()`+`forceCC()`),
  and the stub logged no close; only the actively-streaming `/big/` reply's
  close was observed (EPIPE at 43 ms). An `AbortController` abort from
  chrome scope did close its socket — the sandbox has none. No close line is
  the expected stub evidence until this changes.

## Runs

| Run | What it verified | Observed |
| --- | --- | --- |
| 2026-10-04, Zotero-TTS 1.16.5-beta, Zotero 10.0.6-beta.1 | Items 1–7 + baseline/isolation/cleanup; continuation of the interrupted 1.16.4 run (issue #169; verification report in the main session's context) | baseline/isolation PASS; 1 PASS (`count` 60, listing 3 files, no error); 2 FAIL (error exact at 15.1 s; no client close); 3 FAIL (15.0 s; no close); 4 PASS (37 ms; 22,544,384 bytes; close 43 ms); 5 FAIL (headers timeout at 15.1 s — refusal unreachable, see Limits); 6 PASS (16 ms; `broke off: Error in input stream`); 7 PASS; cleanup PASS. Scripts last ran: 01/02/03/06/08 → `-main`, 04/05/07 → `-items235` (revised matchers), 09 → `-item7`, 10 → `-cleanup` |
