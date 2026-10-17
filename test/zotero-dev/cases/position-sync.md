[Checklist index](../README.md) · [Scripts](../scripts/position-sync/README.md)

## Reading position sync over WebDAV (issues #40, #51, #206)

Use the dedicated test WebDAV configuration under `MEMORY/testing.md`,
never the owner's normal folder. Snapshot the affected local state and
settings privately, settle pending requests, confirm isolation before
running, and restore local positions before re-enabling the original sync.
Use generated fixtures only. Restore the test folder's prior contents and
confirm restoration on failure as well as success. Boolean prefs go through
`Zotero.Prefs.set(name, false, true)` and a read-back; `zotero_set_pref`
cannot write false. Never open a native import/export dialog.

The following historical measurements predate that isolation rule. On
2026-09-05 and 2026-09-06 both switches — reading
position sync and the settings auto-upload — were on, and the folder held
five files — the pre-1.11 shared `zotero-tts-settings.json`, this machine's
`_win11`, another machine's `_macos` (live on the folder: it rewrote its own
file during the 2026-09-06 run), an orphan of an earlier rename of this
machine, and the positions file (45 entries on 09-05, 8 of them the erased
fixtures of earlier runs, issue #51; 57 on 09-06 with no fixture leftover) —
all left as found. Those eight predated the tombstones of 1.10.12 and left
the file by one hand-clean on 2026-09-05, which has stuck. Item 6.2's "first
upload creates the file" is not re-run from absence while the file holds
other machines' entries; the `not-found` branch is proved with a GET of a
name that does not exist (404). Items 6.3 and 6.4's crafted entries name the
run's own fixture, never a user document.

Items 6.1–6.5 and 6.10 keep their original numbers. Items 6.11–6.15 cover
one attachment open in multiple readers (issue #206).

### 6.1

1. **Positions, switch off** (the default): every trigger runs and
   sends nothing — `diagnostics.positionSync()` → `enabled: false`;
   across a tab open and close the transport's `syncs` and
   `lastTrigger` move with `lastOutcome` `skipped` (the counter is
   bumped before the switch is read), while `remoteEntries`, `adopted`,
   `uploaded` and the file's `lastModified` do not.

### 6.2

2. **Switch on** syncs at once (the pref observer): the transport's
   `lastAt`/outcome move, the first upload creates
   `zotero-tts-positions.json` with the store's bookmarks in canonical
   order (`diagnostics.settingsFiles()` lists it); a second sync with
   nothing new uploads nothing.

### 6.3

3. **Merge by recency.** A crafted remote entry newer than the local one
   for a real attachment is adopted (the reader's resume target becomes
   it); a crafted entry for an attachment this machine lacks survives
   every merge in the file and never enters the local store (`rows`
   unchanged).

### 6.4

4. **Deletion leaves the file** (issue #51, 1.10.12). With the switch on
   and the run's fixture read, closed and in the file: `eraseTx()` → at
   once `positionSync().localEntries` down by one and `tombstones` up by
   one (`position().store.deletions` the same count); the erase itself
   pokes one sync — `transport.lastTrigger` `delete`, `dropped` 1,
   `uploaded` true, the log line `… 1 dropped, uploaded` — and the file
   no longer holds the key; `database.rows` down by one within ~10 s.
   Then a copy of the entry put back into the file by hand: the next sync
   (a tab open or close) drops it again, `dropped` 1, `uploaded` true,
   `rows` unchanged. The same erase with the fixture's tab still open
   ends the same way — Zotero closes the tab first, the `trace` shows
   `tab.onClose fired` before the notifier, and the row and the entry are
   gone afterwards; which of the two syncs drops the entry is a race on
   where the notifier yields (2026-09-06: the `reader-close` sync logged
   `1 dropped, uploaded` and the trailing `delete` sync was a no-op), so
   check the pair, not the trigger name. The tombstone is this machine's
   alone: the
   downloaded file parses to real entries only. Before 1.10.12 the
   erased key came back from the sampler's map at the next sync.

### 6.5

5. **Failure.** An unreachable URL: one reported error within the
   timeout, a back-off window, recovery when the URL is back; the local
   store untouched.

### 6.10

10. **The shutdown flush** (both transports) needs a real quit: not
    testable here; unit-tested, including multiple readers of one
    attachment. Do not quit Zotero for this check.

### 6.11

11. **An idle duplicate is not a pause.** Open one generated PDF or EPUB
    in two readers (Duplicate Tab, or a tab and a separate window). Leave
    one without a Reading session and read in the other, muted, using an
    authorized non-metered voice. After startup/open requests settle,
    observe at least four sampler ticks (two seconds): neither positions
    transport gains a `pause` sync just because the duplicate exists.
    Pause the speaking reader once: within one sampler tick plus network
    completion, both transports report one pause sync, then their counts
    remain stable for two more seconds. Repeat with the opposite reader
    speaking. Evidence: `diagnostics.positionSync()` transport counts,
    `lastTrigger`, and the bounded debug lines for both files. A slow server
    is waited on before comparing counts, not treated as a sampler failure.

### 6.12

12. **The speaking position wins, in either reader order.** With one
    reader paused at an earlier sentence and the other speaking later in
    the same fixture, observe the plugin's saved native position and, for
    EPUB, its shared item's text anchor and stamp. They follow the speaking
    sentence, not the earlier duplicate, and a stable sentence does not
    alternate writes or stamps. Repeat with the other reader speaking.
    Compare `diagnostics.position()` and `diagnostics.positionSync()` with
    the actual readers' saved positions; for EPUB also inspect the fixture's
    item in the isolated Positions File after a real pause. Record whether
    both managers can naturally retain open sessions. If the current Engine
    prevents that topology, report that part NOT TESTABLE live rather than
    presenting fabricated manager state as a real session; both orders and
    shared captures are covered by the multi-reader unit tests.

### 6.13

13. **An adopted position survives unchanged duplicates.** After sampling
    both paused readers of the fixture, introduce a newer position for that
    fixture alone in the test folder and trigger a pull. Verify adoption,
    then leave both readers unchanged for at least four ticks: the adopted
    position and stamp stay held, with no new local write or pause sync.
    Use the native positions file to isolate sampler adoption; the EPUB
    Positions File's text resolution remains the document-positions case.
    Never fabricate a position for a user document. The same live-topology
    limitation as 6.12 applies; report it explicitly if needed.

### 6.14

14. **Closing a duplicate cannot rewind the position.** Close the idle or
    earlier paused duplicate while the other reader speaks: the held
    position must not jump back. Then use a fresh duplicate to close the
    speaking reader after a new sentence begins, leaving the older reader
    open: the final captured position survives later ticks. For EPUB, the
    shared capture names that final sentence too. The tab-close and uninit
    backstop together must not replace it twice. Use real close paths, not
    `reader._window.close()`. Closing during the sub-tick race and a stale
    `active=true` after teardown are additionally covered deterministically
    in `test/read-aloud/position-sync-duplicates.test.ts`.

### 6.15

15. **A real backward skip still counts.** With narration paused and no
    other reader speaking, skip to an earlier sentence: that position
    becomes the held one with a newer stamp, and remains stable on later
    ticks. Closing a duplicate must not freeze this surviving reader.
    Reopen the document and verify the new reader can record normally.
    Finish with the fixture-close cleanup, remove test positions before
    restoring the original folder, and confirm every saved setting and
    local/remote fixture record is restored. No new setting or file-format
    change is part of #206.
