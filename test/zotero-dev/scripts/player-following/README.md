# Scripts: player following (#153, and §7 web snapshots / Reading Mode — #188)

[Case](../../cases/player-following.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

## Issue #188 kit (added 2026-10-18)

The DOM follower's `kind` per view: `snapshot` and `reading-mode` rows in `diagnostics.autoScroll()`.
Fixtures: the return-key HTML snapshot imported as a real snapshot (`importSnapshotFromFile` under a
parent item + `Zotero.SDT.ensure`, limitations §9) and fixture-a/fixture-c PDFs. The run holds
`state.fix4Prefs` (the pref snapshot), `state.fix4Items`, `state.fix4RowsBaseline`.

| Script | Checks | Expected | Params |
| --- | --- | --- | --- |
| `188-00-baseline-isolate.js` | Private pref snapshot (18 names + documentVoices.*), mute, memory seed (System voice), WebDAV folder off | folder false; the owner reader untouched | — |
| `188-01-import-fixtures.js` | Snapshot import + `SDT.ensure` true; fixture-a import | rows at baseline | `snapshotHtml`, `fixtureA` |
| `188-02-open-snapshot-player.js` | Item 1a: row `kind: "snapshot"`, `patched: true`, `following` = the Player's A; audio-device probe | pass true | — |
| `188-03-reading-mode-attach.js` | Item 1b: Reading Mode on via the Appearance popup; the row flips within one sentence; no Player reopen | kind "reading-mode", patched true | — |
| `188-04-shiftR-once-m.js` | Item 2: M (fresh tab on default false), wheel+scroll away, trusted Shift+R returns once (`last.reason "return"`), three sentences scrollY stable, still M | pass true | — |
| `188-05-stop-play-pause-resume.js` | Item 3: stop/play and pause/resume in M — no page movement, still M | pass true | — |
| `188-06-wheel-turns-m.js` | Item 4: in A, a trusted wheel disengages at once (row reason "wheel", Player M) | pass true | — |
| `188-07-a-scroll-styles.js` | Item 5: each scroll style places at the reading line (`last` reason sentence/cut, scrollY == `last.top`); Top bar (layout top) covers 34 px, the 30% line sits below | stylesPass true | — |
| `188-08-reading-mode-steps.js` | Item 6: steps 2-4 in Reading Mode on fixture-c (element scroller; PageDown is the manual input — a synthesized wheel is not delivered into the SDT document) | all steps pass | `fixtureC` |
| `188-99-cleanup.js` | Item 7: readers closed, items erased, rows back, doc-voice records back, defaultAutoScroll restored | pass true | — |

Before you start: bridge up; WebDAV folder off (`188-00`); install the xpi, `zotero_plugin_list` =
manifest `-betaN`, `diagnostics.startup()` all ok. **The host window must be RESTORED for
188-04…188-08**: `visible()` in dom-follow.ts refuses placement at `windowState === 2`, and a
synthesized wheel does not reach the view document while minimized. Minimize again afterwards.

Environment facts this run paid for (macOS, Zotero 11.0-beta.1):

- DOM views scroll the view's own window (`view.iframeWindow`), not the shell; scrollY reads and
  `windowUtils` must target it. A trusted wheel delivered from the SHELL disengages following
  (reason "wheel") but a synthesized wheel does not drive the scroller — pair the wheel with a
  `scrollTo` for the distance.
- Reading Mode (`SDTView`): its root does not scroll — placements carry `last.reason "element"`
  (the #188 element path, observed live); the trusted keyboard (TIP PageDown) disengages with
  reason "keyboard"; no synthesized wheel delivery at all.
- `KeyboardEvent` init objects need `Cu.cloneInto(init, win)`; a paused pick before the first audio
  has no segment to return to (`_resolveSegmentSelector` null) — wait for it.
- macOS System voices have no word timings: `line` style falls back to sentence placement
  (`last.reason "sentence"`).

## 2026-10-18 run (1.16.12-beta6, xpi sha256 781ccd7b…, commits a5edad5…d9343a5)

All of §7's items PASS: snapshot/reading-mode attach (202/276 ms flips), Shift+R once
(208-259 ms, three stable sentences), stop/play + pause/resume zero movement, wheel→M, all three
scroll styles placed at target (delta ≤ 1 px), Reading Mode steps 2-4. Cleanup: 4 fixture items
erased, rows 75→75, documentVoices back to the baseline 58. Two attempts of each script that
failed on the environment (minimized window, Xray windows, the catalog race) were revised above;
their results are in `.tmp/zotero-dev/2026-10-18-1.16.12-beta6-player-following-*`.

## Isolation incident and unresolved restoration (2026-09-27 — historical, still open with the owner)

The first fixture import of the #153 run ran with Zotero core auto-sync enabled; disposable
fixture metadata reached the owner API/test WebDAV and the original-state restoration of that run
could not be established (see the git history of this file for the full record). Later runs,
including this one, take exact typed private snapshots and restore them; the open decision about
re-enabling sync is still the owner's.

## Historical runs (superseded behavior)

| Date/build | Coverage and result | Run |
|---|---|---|
| 2026-09-27 / 1.16.1-beta | #153: A/M per tab, defaults, keys, paginated return observed; PDF/scrolled-EPUB physical return NOT TESTABLE (native smooth scroll inert) | see the git history of this README |
| 2026-09-16/17 / 1.12.12-beta | #153 baseline, ui4, shortcuts2, return-compare2, boundary2 — all PASS | `2026-09-16-1.12.12-beta-player-following-*` |
