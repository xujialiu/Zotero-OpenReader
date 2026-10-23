# Scripts: Local HTML reading compatibility (issue #228)

[Case](../../cases/html-compatibility.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | Check and expected result | Inputs |
| --- | --- | --- |
| `00-webdav-off.js` | Snapshot the folder switch, settle transports, turn it off before other changes | `state.webdav` written |
| `01-baseline-snapshot.js` | Snapshot named prefs/user flags, window/tab, debug state and position rows; then mute | `state.baseline` written |
| `02-install-identity.js` | Installed bundle hash matches the verified beta, startup includes HTML compatibility, no failed steps, folder off | `tmpDir`; update expected hash for a new build |
| `10-import-fixtures.js` | Import authored HTML in file/linked/snapshot forms, ordinary HTML controls, original by path, empty HTML, PDF and EPUB | `htmlFixturesDir`, `originalFile`, `fixturesDir`, `tmpDir`, `runId`; writes `state.fx` |
| `11-epub-control.js` | Independently import the actual EPUB file; native nonempty analysis, no HTML diagnostic row | `fixturesDir`; writes `state.fx2.epub` |
| `20-html-analysis.js` | Original and affected variants have nonempty compatibility packs, unchanged link mode; no script/comment text extracted | `state.fx` |
| `30-reading-bodyless.js` | Real Azure reading; sentence selector and drawn word spotlight resolve to expected text; visible rects; bound to heading and first sentence | `htmlFixturesDir`; writes `state.fx2.bodyless` |
| `31-reading-original.js` | Same selector/word test on the original, including its multi-node code-line range | `originalFile`; writes `state.fx2.original` |
| `40-position.js` | Store paragraph-two position, normal tab close/reopen, trusted Shift+Space on idle reader; trace proves stored-row resume, sentence matches | `htmlFixturesDir`; uses/writes `state.fx2.bodyless` |
| `50-controls-cache.js` | Ordinary snapshot native; PDF and EPUB nonempty/no HTML row; compatibility cache hit, separate caller buffers, storage unchanged | `state.fx` |
| `60-failure.js` | Fresh empty HTML: failed diagnostic and localized notice, not permanent preparation; another valid fixture still works | `tmpDir`, `state.fx`; records new item in `state.fx` |
| `70-lifecycle-disable.js` | Close fixture Players only; block on owner session; disable plugin; native imported HTML unavailable, bodyless snapshot empty; built-in Read Aloud has no segments | `state.fx`, `state.fx2` |
| `71-lifecycle-reinstall.js` | After reinstall: startup ok, folder off, idle empty state cleared, no reading started, fresh compatibility pack | `state.fx` |
| `80-cleanup-teardown.js` | Union fixture registries by item ID; close/erase only fixtures and their voice prefs; close test-created settings pane before exact pref restore; native voice pref uses its full name; row count restored | `state.fx`, `state.fx2`, `state.baseline`; writes `state.cleanupOk` |
| `81-cleanup-restore.js` | Require successful cleanup and snapshots; restore original folder value/user flag last, original geometry/tab/debug state; minimize; missing evidence leaves folder off | `state.webdav`, `state.baseline.window`, `state.cleanupOk` |

## Before running

- Follow the tester workflow and case baseline. This is not a WebDAV test:
  run 00 before 01 mutes or changes any other preference. Never replace a
  baseline snapshot with temporary test values when resuming a run.
- Use the [shared runner](../_shared/README.md), with `root`, `runId`,
  `htmlFixturesDir`, `fixturesDir`, `tmpDir`, and `originalFile` supplied by
  the verification brief. The original is local and is never committed.
  The PDF control is `fixture-a.pdf`; the EPUB control is the file
  `scroll-performance/scroll-performance.epub`, not its parent directory.
- Install the brief's XPI between 01 and 02. Reinstall that same beta
  between 70 and 71. No other agent may drive Zotero during the run.
- Real reading is muted. Scripts 30/31 deliberately use a configured Azure
  voice and restore its enabled state afterward. Check the configured voice
  and baseline memory before opening a Player; never accept accidental paid
  fallback as a successful check. Script 40 uses the remembered voice; the
  recorded run used System Samantha and made no provider request.
- Restore/focus the window only for rendering or trusted input. Preserve
  owner tabs and sessions; a lifecycle check blocked by an owner session is
  reported, not silently worked around. No native dialogs.
- Run 80 then 81, including after failure. Both use the snapshots captured
  by 00/01, not manually retyped preference values. A failed/missing restore
  leaves WebDAV off and is a blocker. Do not scan/delete unrelated storage.
- Every script result must be inspected: an `ok: false` inside JSON is not
  itself a runner exception. Do not interpret completion as a PASS.

## Measurements and limits

- Build verified: Zotero 10.0.6 on macOS, OpenReader 1.16.15-beta, production
  commit `50bda29`; bundle SHA-256
  `7924d92203bde4846fe409368bf2c5ceead4665bdf19ffd728d86d35a55ba199`.
- Original: 53 blocks; `metadata.characterCount` 1,977. Summing the text
  nodes instead gives 1,975. These are different metrics, not text lost by
  normalization; raw-body-insert and normalized copies matched blockwise.
- Selector evidence is actual `toDisplayedRange(...).toString()`, not an
  `innerText` substring. A bodyless paragraph range included one trailing
  space; 30 permits only edge whitespace and still reports both raw
  strings. Words were exact matches to real Azure timestamp slices.
- Resume means trusted Shift+Space on an idle reopened Reader, with no
  selection and a new `resume item … target …` trace entry. Merely opening
  Zotero's popup bypasses the stored-row resume and proves nothing about
  this feature. The authored fixture restored sentence 3 exactly; the
  original's deeper position also restored in the first pass.
- Bridge console-actor interruptions occurred. Background runner groups
  survived; a bare eval sometimes lost its result. Follow workflow retry
  bounds and do not create duplicate fixtures blindly.
- Subjective sound and moving-highlight quality remain human checks. Real
  audio-clock progression and displayed selector geometry were measured.

## Retained revisions and safety checks

The tester executed 00–81 live across the first pass and two follow-ups.
The final 30/31 and 40 revisions replaced earlier ineffective probes.
Mechanical corrections after those runs are tested without touching Zotero
by `test/html-compatibility-kit.test.ts`: it executes the actual 00/01/80/81
scripts with mocked Gecko preference defaults, validates shared baseline
field names, fixture ownership, full-name restoration, missing evidence,
window-close ordering, and initially-on/off folder restoration.
The final 30/40 predicates were also evaluated against their captured live
outputs. No production code changed after live verification.

| Run | Accepted evidence and corrections |
| --- | --- |
| 2026-10-23 first pass | Extraction, audio-clock progression, native snapshot/PDF, cache/storage, empty notice, disable/reinstall. Initial selector substring check was insufficient; EPUB path joined incorrectly; Position probe only opened the popup; cleanup used a wrong pref prefix. Those conclusions were not accepted. |
| 2026-10-23 follow-up 1 | Actual sentence/word range evidence; real EPUB (401 text blocks); real native voice pref restored byte-identically and bogus pref removed; two character metrics distinguished. Position probe still bypassed Resume. |
| 2026-10-23 follow-up 2 | Trusted Shift+Space consumed, stored-row trace, resumed sentence 3 = saved sentence, paused within 662 ms of key; corrected cleanup executed and exact prefs/rows/folder restored. |

The [final verification table](https://github.com/xujialiu/Zotero-OpenReader/issues/228#issuecomment-6366988228) is on issue #228; the engineering record is
[NOTES_2026-10-23](../../../../notes/NOTES_2026-10-23.md).
