[Checklist index](../README.md) · [Scripts](../scripts/late-audio/README.md)

## Audio that arrives after its tab closed is dropped (issue #116, 1.12.11)

Zotero's controller kept up to three sentences of audio on the way
(`_prefetchFrom`, `resource/reader/reader.js:40258-40260`: MAX_WINDOW 3,
two requests at a time), and the Engine keeps the same window since issue
#133 (its answers land on the plugin's side, counted in
`diagnostics.engine()` `stats.late`); nothing cancels them when the popup closes
(`deactivate`, reader.js:82728) or the tab does: `Zotero_Tabs.close` runs
`tab.onClose()` synchronously (`chrome/content/zotero/tabs.js:767-768`) and
removes the browser element a `setTimeout` later (tabs.js:773-774), which
nukes the reader window. A result landing after that used to throw twice —
the prefetcher reading the dead `_internalReader` for the next segments,
then the interface wrapper cloning the result into the dead window — two
`can't access dead object` lines per late result, `line: 0` in
`Zotero.getErrors()` and the bundle line in the console message's
`columnNumber`. Since 1.12.11 the result is **dropped**: not cloned, not
resolved, not logged as an error (`src/read-aloud/window-interface.ts`);
the prefetcher answers `[]` for a reader whose window is gone
(`src/read-aloud/upcoming-segments.ts`). Since issue #166 the only
prefetch is the Engine's: the tab's close ends its session, which drops
what the prefetch had left to ask, and a window gone without that close
asks no provider (`fetchFor`, `src/read-aloud/engine/index.ts`). The count is
`JSON.parse(Zotero.ZoteroTTS.diagnostics.patches()).lateResults` —
`{ dropped, byMethod: { getAudio: n, … }, last: [{ method, at }] }`, the
last ten drops — and `patches()` is synchronous, like `startup()`. The
debug store carries one `late result dropped: getAudio answered after its
reader window was gone` line per drop.

Run the baseline first. Fixtures: `fixture-a.pdf` and `fixture-b.pdf` as
standalone attachments, erased in calls of their own. The plugin's volume
at 0 for the whole case; `readAloud.memory` pointed at a listed voice of
a plugin provider slow enough for a request to be in flight at the close.
**Kokoro on the h200 is too fast** (measured 2026-09-16: `getAudio`
answered in under 300 ms even for a 132-character segment on a cold
cache, five attempts caught nothing) — use Xiaomi MiMo, whose
chat-completions synthesis takes seconds and caught a drop on the first
try, at four short paid reads for items 1 and 3. `m.active` turning true
means the audio has already resolved, not that the request just went
out, so the catch window is the provider's live speed, not the nominal
delay. The audio cache is keyed by text and voice and outlives a fixture
re-import; an in-place reinstall of the same xpi is the way to a cold
cache, and it resets `lateResults`. `play()` is called on the fixtures only, never
on the owner's document. Nothing here is audible by design; the check is
the diagnostic, the debug store and the console. Read `lateResults`
before every item and report the rise, never the absolute: the counter is
the instance's, and a drop from another tab counts too. Expected values
come from the design and are corrected from the run.

### 1

1. **A late result after the × path.** Open `fixture-a.pdf`, open the
   player, `play()`, and about 200–300 ms later close the tab the way the
   × does: `reader._window.Zotero_Tabs.close(reader.tabID)`. Wait ~5 s.
   Expected: `lateResults.dropped` up by ≥ 1 with the rise in
   `byMethod.getAudio` and `last[last.length - 1].at` within the seconds
   after the close; one `late result dropped: getAudio answered after its
   reader window was gone` line per drop in the debug store; the reader
   gone from `Zotero.Reader._readers`; **no** `can't access dead object`
   in the console after the close, found by content and timestamp
   (`Services.console.getMessageArray()`, an entry's `timeStamp`). If
   `dropped` did not rise, the request landed before the window died:
   repeat with a shorter delay or a slower provider, and say so.

### 2

2. **The prefetch stops with the reader (issue #166).** Custom prefetch
   at 10 sentences ahead and 1 request at once (restored after), on a
   fixture whose audio is not cached yet (`fixture-b.pdf`, or a restart
   emptied the cache). `play()`, wait until `diagnostics.engine()` shows
   `session.prefetch.open: 1` with indices of `order` still unasked (the
   prefetch is going), then close the tab as in item 1. Expected: no
   provider request after the close beyond the one open at it (the
   provider's synthesis lines in the debug store), and `dropped` or the
   Engine's `late audio dropped` line up by that one when it lands. If
   the prefetch had finished before the close, NOT TESTABLE with the
   reason and the retry taken.

### 3

3. **The erase path, as the kits' teardown does it.** A fixture tab
   reading; `toggleReadAloudPopup(false)` about 300 ms after `play()`,
   then `item.eraseTx()` about 300 ms later — the sequence of
   `openai-split/05-cleanup-restore.js`, and the one the issue was found
   on. Expected as in item 1: `dropped` up by ≥ 1, no dead-object line,
   no other line from `zotero-tts.js`; Zotero One's
   `NS_ERROR_FILE_UNRECOGNIZED_PATH` at an erase is its own noise, not a
   finding.

### 4

4. **Control: a quiet close.** A fixture tab whose popup has been closed
   for ≥ 5 s, so nothing is in flight, closed with `Zotero_Tabs.close`.
   Expected: `dropped` unchanged, no `late result dropped` line, no error.

### 5

5. **Playback itself is untouched.** After item 1, open a fixture again
   and `play()`: the manager reads `active: true, paused: false`, the
   `<provider>: … chars` synthesis lines and the `ready ahead of playback`
   lines appear as before, `dropped` unchanged while the tab lives.
   The advance is `diagnostics.engine()`'s `session.currentIndex`; before
   issue #133 a script-started `AudioContext` stayed suspended
   (baseline.md) and the advance took a trusted Shift+Space, or an ear —
   the Engine asks its output to run on Play ([engine](engine.md) item
   23).

### 6

6. **A late answer through the Engine reads nothing of the dead reader
   (issue #165, 1.16.4-beta4).** The Engine asks the interface with the
   reader's own segment and voice, which die with the tab; `getAudio`
   reads both before its first await and never after it. A fixture tab
   on a plugin voice slow enough to have a request in flight (MiMo, as
   items 1 and 3), started with a trusted Shift+Space (a script-started
   session's output stays suspended, `prefetch-cache` run of
   2026-10-01), closed the × way 200–300 ms after the start. Wait ~5 s.
   Expected: one Engine line `late audio dropped: its reader window was
   gone` per answer that landed after the close (from `fetchFor`, which
   a rejected `getAudio` never reaches); `lateResults` unchanged, since
   the Engine's requests do not pass the window wrapper; **no** `can't
   access dead object` from `zotero-tts.js` after the close, by content
   and timestamp. No line means the answer landed before the window
   died: repeat with a shorter delay, and say so. A *failure* that
   settles after the close is unit-only, pinned in
   `test/read-aloud/remote-interface.test.ts`: no provider fails on cue.
   Build identity: `tinySegmentText(originalText)` in the installed
   bundle.

**State**: the plugin's volume (snapshot and restore, user-value state
included), `readAloud.memory` (byte-identical restore, the last write),
`extensions.zotero.reader.readAloudVoices` (a fixture rewrites its `en`
entry — snapshot and rebuild), the three `readAloud.prefetch*` prefs if changed, the
fixture items. **Budget**: a handful of short readings on the chosen
provider; on Kokoro nothing is metered, MiMo is paid per request.
**Human-only**: whether audio still plays after the change (item 5's
advance); the feature's own effect is the absence of console lines.
