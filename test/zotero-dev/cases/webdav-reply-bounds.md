[Checklist index](../README.md) · [Scripts](../scripts/webdav-reply-bounds/README.md)

## A WebDAV reply that stalls, breaks or runs too large fails instead of hanging, and its connection is closed (issue #169, 1.16.5)

The timeout around a WebDAV request (`request()` in `src/core/webdav.ts`,
`WEBDAV_TIMEOUT_MS` 15 s) ends when the reply's headers arrive. Since
1.16.5 the body that follows is read by `readText` in the same file:
through the body's stream reader, every chunk within the timeout (the gap
is bounded, not the whole body), at most `WEBDAV_MAX_REPLY_BYTES`
(10 MiB, a declared `Content-Length` above it refused before reading).
Before it, `download()` and `list()` awaited `response.text()` outside any
bound, and one stalled reply wedged its single-flight sync for the session.

Every failure — the headers timeout, a stall, the cap, a broken stream —
aborts the request through an AbortController injected from a chrome
window (`webdavDeps()` in `src/index.ts`, `newChromeAbortController`; the
settings window's client uses the pane's own), and that abort is what
closes the connection. 1.16.5-beta only cancelled the body's stream, and
the 2026-10-04 run on it found every silent server's socket still
ESTABLISHED minutes later, after a forced GC and CC too ([issue #169's
comment](https://github.com/xujialiu/Zotero-TTS/issues/169#issuecomment-5976059674));
since 1.16.5-beta2 the stream is cancelled after the abort, as the release
left when no controller could be made.

Two diagnostics run the plugin's own client inside the plugin sandbox,
against `extensions.zotero.zotero-tts.webdav.url`, with the same
`webdavDeps()` the syncs use:
`Zotero.ZoteroTTS.diagnostics.sharedSettings()` downloads
`zotero-tts-shared-settings.json` (`download()`), and
`Zotero.ZoteroTTS.diagnostics.settingsFiles()` lists the folder
(`list()`). Both answer JSON, `{ error: "…" }` on a failure. A chrome-scope
`fetch` does not prove the sandbox's view.

Run the baseline first, with its test WebDAV isolation: every automatic
sync and upload suspended for the whole case. Items 2–6 and 8 point the
URL pref at a **local stub server** on `127.0.0.1` (an ephemeral port),
which holds no data and is not the owner's WebDAV; that detour is
permitted while the automatic syncs stay suspended, and item 7 puts the
test configuration back and confirms it before anything else runs. Run
order: 1–6, 8, 7. The stub, started from the kit and stopped at the end,
answers under five folders whatever the file or method (GET and PROPFIND
alike) and logs, per request, the method, the path, the bytes it wrote and
when the client closed the connection (`client`, `client-fin` or
`client-reset`), relative to the request's arrival:

- `/stall/` — status 200 (207 for PROPFIND) with headers and a first
  fragment of the body, chunked, then nothing, the socket kept open.
- `/big/` — status 200, chunked with no `Content-Length`, spaces streamed
  without pause up to 64 MiB, then the end.
- `/declared/` — status 200 with `Content-Length: 10485761` and **one body
  byte**, then nothing, the socket kept open. Gecko's `fetch` resolves only
  once a body byte has arrived (2026-10-04: a head alone left the fetch
  pending until the headers timeout), so without that byte the reply never
  reaches the cap check.
- `/broken/` — status 200, chunked, a first fragment, then the socket
  destroyed mid-chunk.
- `/silent/` — the connection accepted and the request read, then nothing
  at all, no status line, the socket kept open.

Times are measured around the diagnostic's call. A call outlasting the
bridge's 30 s limit goes through the kit runner. Expected values come
from the design and are corrected from the run.

Only unit tests cover a slow but steady reply finishing past the timeout,
a multi-byte character split across chunks (`test/core/webdav.test.ts`,
"the reply's body"), a client with no controller to abort — no window
up — still failing in time ("closing the connection"), and the deadline's
error winning over the AbortError an aborted fetch rejects with
(`test/core/timeout.test.ts`). The main window is up for every live run.

### 1

1. **The stream path runs in the sandbox against the test WebDAV.** The
   installed bundle contains `stalled: nothing arrived for` and
   `function webdavDeps()` (build identity: 1.16.5-beta2 or later).
   `sharedSettings()` answers its `url` (the test folder), `count` and
   `items`, and `settingsFiles()` its `url` and `files`, neither with an
   `error`. A file that does not exist on the test server yet is `error`
   with `No backup on the server yet`. That is the client working: say
   so, and prove the download with `settingsFiles()`'s listing and a file
   the listing names. Any `TypeError`, `getReader`, `signal` or
   `Permission denied` in an `error` is the stream reader or the injected
   controller failing in the sandbox: a FAIL that stops the pass.

### 2

2. **A download that stalls mid-reply.** URL at `http://127.0.0.1:<port>/stall/`.
   `sharedSettings()` answers in 15–17 s with an `error` containing
   `The reply from http://127.0.0.1:<port>/stall/ stalled: nothing arrived for 15 s.`
   The stub logs the GET's connection closed by the client within about
   a second of the answer: the abort reached the network. Before 1.16.5
   the call never answered; on 1.16.5-beta it answered at 15.1 s and the
   connection stayed open.

### 3

3. **A listing that stalls mid-reply.** The same URL. `settingsFiles()`
   answers in 15–17 s with the same `error`, and the stub logs the
   PROPFIND's connection closed by the client within about a second of
   it.

### 4

4. **A reply past 10 MiB with no `Content-Length`.** URL at `/big/`.
   `sharedSettings()` answers within a few seconds, well under 15 s,
   with an `error` containing `is larger than 10 MB; no file of ours is that big.`
   The stub logs the connection closed by the client before the 64 MiB
   end, its bytes written at least 10 MiB. This item proves the stream
   path specifically: `response.text()` has no cap and would have
   answered a JSON parse error instead. (1.16.5-beta: 37 ms, 22,544,384
   bytes written, the close at 43 ms.)

### 5

5. **A declared `Content-Length` past the cap.** URL at `/declared/`.
   `sharedSettings()` answers at once, in under 2 s, with the same
   `is larger than 10 MB` error, never the `stalled` one and never
   `No reply`, and the stub logs the connection closed by the client
   within about a second of it, its bytes written 1. (1.16.5-beta, the
   one-byte stub as a probe: 44 ms.)

### 6

6. **A reply that breaks mid-body.** URL at `/broken/`. `sharedSettings()`
   answers at once with an `error` containing
   `The reply from http://127.0.0.1:<port>/broken/ broke off:` followed by
   Gecko's reason (1.16.5-beta: `Error in input stream`, at 16 ms). A
   different message is not a FAIL if it is a `WebDAVError` naming the
   stub: report it verbatim, and the case is corrected from it.

### 7

7. **The test configuration is back, and the client works.** URL restored
   to the test WebDAV and the effective destinations confirmed against
   the test file (the match only, never the values). `sharedSettings()`
   and `settingsFiles()` answer as in item 1. Then the stub is stopped.
   The automatic syncs come back only under the baseline's cleanup rules.

### 8

8. **A server that never answers.** Runs before item 7. URL at
   `/silent/`. `sharedSettings()` answers in 15–17 s with an `error`
   containing `No reply from http://127.0.0.1:<port>/silent/ within 15 s.`,
   never `Cannot reach` (the abort's own rejection must not replace the
   deadline's), and the stub logs the GET's connection closed by the
   client within about a second of the answer: the headers timeout
   aborts too. Before 1.16.5-beta2 this connection stayed open.
