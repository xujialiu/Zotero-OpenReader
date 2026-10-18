[Checklist index](../README.md) · [Scripts](../scripts/position-library-numbers/README.md)

## A position written under another computer's library number is taken here (issue #187, 1.16.12)

An entry of `zotero-tts-positions.json` names its attachment by the
writer's `libraryID` and the item key. A group library is numbered per
computer, so since 1.16.12 an entry whose number holds no such key here is
matched by the key in this computer's My Library and groups (never a
feed) and taken under this computer's number; the file keeps the entry as
written, and this computer's copy goes up beside it with the same `ts`
(docs/spec/SYNC-FORMAT.md, section 5). `diagnostics.positionSync()`'s
`transport.remapped` counts the entries taken that way, and the debug line
says `(N under this computer's library number)`.

Against the test WebDAV folder (`MEMORY/testing.md`, Test WebDAV first),
never the owner's own, with *Sync reading positions between computers* on;
the snapshot, isolation and cleanup gate are the
[position sync case](position-sync.md)'s. The fixture is a generated PDF
of the run's own (at least five pages), imported into My Library, with no
position held for it before the run; nothing plays out loud. The owner's
profile has My Library only, so the entry is written under a number no
library has here: `L` is a number with `Zotero.Libraries.exists(L)`
false. Two real numberings of one group need two profiles and are not
testable here; the several-libraries refusal and the feed exclusion are
unit-tested (`test/read-aloud/position-transport.test.ts`,
`test/index.test.ts`).

### 1

1. **Taken under this computer's number.** Put into the test folder's
   `zotero-tts-positions.json` (as found, plus one item, canonical: items
   by `lib` then `key`, fields `lib, key, pos, ts`) the item `{lib: L,
   key: <fixture key>, pos: {pageIndex: 3, rects: [[x, y, x, y]]}, ts:
   Date.now() + 60000}`, the point at the start of a sentence on page 4.
   Open the fixture's tab. Expected: the log line `position sync
   (reader-open): N remote, M merged, 1 adopted (1 under this computer's
   library number), 0 dropped`; `positionSync().transport` `lastOutcome`
   `ok`, `adopted` 1, `remapped` 1; `localEntries` one more than before;
   the store holds `1/<fixture key>` with that `ts` and `pos`. On
   1.16.12-beta4 the same file gives `0 adopted`, no `remapped` field and
   no row for the fixture (the bug).

### 2

2. **Shift+Space resumes there.** In the fixture's tab, scrolled to page
   1, muted, with a non-metered System voice: Shift+Space logs `position
   sync (resume)` first, and the first segment read is on page 4 at the
   crafted point (`pageIndex` 3), not on the page in view. Stop reading.

### 3

3. **The file settles.** Close the fixture's tab (a sync): `uploaded`
   true, and the file holds both `{lib: 1, key: <fixture key>}` and `{lib:
   L, key: <fixture key>}` (item 2's reading moved this computer's copy on:
   its `ts` newer than the crafted one, `L`'s entry as written). Open and
   close another tab twice: each sync `uploaded` false, the file byte for
   byte the same.

Cleanup: the fixture's two entries out of the file, which goes back as
found; the fixture's row, Document Id mapping and tombstone as the
position sync case's cleanup gate says; the switches restored last.
