[Checklist index](../../README.md) · [All scripts](../README.md) · [Case](../../cases/zotero-tiers.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'zotero-tiers'`), with
`params: { fixtureItemID: 25290 }` on every `start` (the standing library
item `ZTTS Fixture A`). `08`/`09` bracket the tester's own
`zotero_plugin_install` reinstall call, which is not a script. `03b`/`04b`
run BEFORE `03`/`04` (reordered — see Limits): both need Standard ON at
start and leave it ON, while `03`/`04` leave it OFF for the next item's
setup — the table's order satisfies every script's precondition. `10`/`11`
(issue #130) are their own self-contained pair — opening the pane fresh
rather than reusing `01`'s, needing no fixture — and run any time after
`09`; `12` (renamed from `10`) always runs last.

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-baseline-snapshot.js` | Zotero/reader state, error ring, debug store, a typed snapshot of every pref the case touches (all 8 providers' `.enabled`, both Zotero switches, volume, `sameForAllDocuments`, `readAloud.memory`, `reader.readAloudVoices`, both WebDAV switches recorded only) | Applies the run's own state (volume 0) once the snapshot is captured | — |
| `01-pane-structure.js` | Item 1 (structure updated for #159): opens the pane fresh, reads every `groupbox` id in DOM order, the Zotero section's `h2`/note/`?`, and per tier the caption + credits row + switch row | 21 groupboxes, `ztts-zotero-section` right after `ztts-provider-mimo` and before the voice browser; `zoteroH2HasLink: false`; captions `Standard`/`Premium` weight 600; credits-row hboxes `[ztts-zotero-credits-<tier>, ztts-zotero-buy-<tier>]`; the two buttons the switch row's first children, no fields; Log in hidden while signed in | — |
| `02-headless-check.js` | Item 2 (message format updated for #159): `diagnostics.zoteroTiers()` + Test connection beside Standard, polled | `feature: "zotero-tiers"`, both switches true, `hidden: []`, `signedIn: true`, messages `Signed in: N <tier> voices.` with no credits in them (the figures live in the `credits` field, cheapest 1/10); `sawTesting`, final text equals the diagnostic's own message | — |
| `03b-language-coverage-allvoices.js` | Requires Standard ON at start (self-heals to ON on its own throw otherwise). A correction to item 3's language sub-check (see Limits): global language coverage from `_allVoices.language`, both on vs. Standard off | `lostToDisabling: []` (no language was Standard-exclusive on this profile) | `fixtureItemID` |
| `04b-lastmove-popup-only-close.js` | Requires Standard ON at start. Investigates `lastMove` staying null: same manager instance, popup-only close/reopen instead of a full tab close. Now closes the tab and WAITS for it to leave `Zotero.Reader._readers` before its own restore click (see Limits — the guard blocks that click while the reopened popup is still up) | `lastMoveAfterReopenSamePopup: null` even with `sameManagerInstance: true` — see Limits | `fixtureItemID` |
| `03-disable-standard.js` | Item 3: captures "both on" state, clicks Disable (no player open), reopens fresh to check `hidden`/`options`/`_allVoices`-by-index/voice-browser tiers. Leaves Standard OFF, for `04`'s own setup | `fixtureOptionsHasStandard: false`; `#ztts-voices-tiers` drops `Zotero Standard` entirely — fixed in beta2, was a real bug through beta (see Limits) | `fixtureItemID` |
| `04-hidden-selection-moves.js` | Item 4: setup re-enables Standard (a no-op if `04b` already left it on), picks the tier (at once) + a distinct voice (the #108 handoff), closes, disables (item 3's way), reopens. Leaves Standard OFF, for `05` | `voicePickLanded: true`; `selectedTierIsNotStandard: true`; `lastMove: null` — see Limits | `fixtureItemID` |
| `05-enable-restores-memory.js` | Item 5: Enable beside Standard, polled: pref-based break (not label-based — see Limits), then reopens and picks the tier to check the memory recall | `memoryRecallMatches: true`; `voicesTiersChildrenAfterEnable` shows `Zotero Standard (28)` again | `fixtureItemID` |
| `06-reading-guard.js` | Item 6: fixture popup open+paused, Disable beside Premium, reads the `ztts-notice` dialog, presses Stop and continue, POLLS for real settlement (dialog gone AND the pref moved, up to 10 s — a fixed 500 ms sleep raced this on one run, see Limits) before reading state, restores via Enable | `dialogNamesFixture: true`; `prefAfterStop: false`; `fixtureActiveAfterStop: false`; `strayDialogCount: 0`; restore `pref: true` | `fixtureItemID` |
| `07-everything-off.js` | Item 7: disables every enabled provider (this profile: only `fish`) + both Zotero tiers, each driven to an EXPLICIT target state (not just flipped — see Limits), checks the status line/`#ztts-voices-tiers`/`providerTiers()`, restores all through Enable | `fixtureOptions` = Zotero's 3, all `disabled: true`; status line reads `ztts-no-providers-on` — fixed in beta2, was a real bug through beta (see Limits); `restoreFailed: []` | `fixtureItemID` |
| `08-before-reload.js` | Item 9 setup: opens the fixture fresh, leaves the tab open, snapshots `providerTiers()`/`zoteroTiers()`/errors | — | `fixtureItemID` |
| `09-after-reload.js` | Item 9: after the tester's own reinstall, polls the surviving tab, re-reads a FRESH pane's switches, diffs the debug log tail for new dead-object lines | `readerSurvived: true`; `switchesMatchPrefs: true`; `deadObjectMentionsInTail: 0` | — (reads `state.fixture` from `08`) |
| `10-signed-out-greyed.js` | Item 10 (issue #130, strings updated for #159): opens the pane fresh, self-heals both switches ON, disables Standard (item 3's way, real click), shadows `Zotero.Sync.Data.Local.hasCredentials` to `() => false` (own descriptor kept) and fires `api-key`, then dispatches a raw `command` event at the greyed button | `standardAfterSignOut.disabled: true`; `premiumAfterSignOut.disabled: false`; the new reason `Not signed in to a Zotero account.` on both lines (old string gone), a shown `Log in` on each result's row, credits rows hidden; `zoteroTiers().signedIn: false` with both checks `ok: false`; every reader `signedIn: false`; `commandEventWasNoOp: true` | — |
| `11-signed-in-again.js` | Item 11 (issue #130, updated for #159): restores `hasCredentials` (the kept descriptor) and fires `api-key` again, polls the credits rows shown (see Limits), then enables Standard the item-5 way (polled on the PREF); closes the pane | `standardDisabledFalse: true`; both result lines `''`; both Log in links hidden again; `creditsRowsShownAgain: true` (~0.4 s); every reader `signedIn: true`; `standardResultMatchesExpected: true` | — |
| `12-cleanup-restore.js` | Restores every pref from `state.baseline`, in order, `readAloud.memory` last; closes the settings window; reports the error ring | Every restored pref `matches: true` | — |

## Before you start

- Build: confirm with `zotero_plugin_list` + `diagnostics.startup()` +
  `diagnostics.zoteroTiers().feature === "zotero-tiers"` +
  `diagnostics.providerTiers()` carrying a `hidden` field (done directly).
- Fixture: the **standing** item `ZTTS Fixture A`, itemID **25290** (found
  by `zotero_db_query` on the title) — never imported or erased here.
- State touched, restored by `12`: `readAloud.volume`, all 8 providers'
  `.enabled` (only `fish` was on), both Zotero switches,
  `sameForAllDocuments`, `readAloud.memory`, `reader.readAloudVoices`,
  `Zotero.Debug.storing`; the two WebDAV switches are read only. `10`/`11`
  touch `Zotero.Sync.Data.Local.hasCredentials` (own descriptor kept and
  restored inside `11`) and fire two `api-key` notifications — not
  restored by `12`, since `11` already leaves everything signed back in.
- Every `openFixturePausedFresh` helper (03–08) opens the fixture, pauses
  at once, then **settles**: polls `providerTiers()` up to 6 s until
  `tiers`/`options` stop changing, since the catalog's async fetch (Fish's
  339-voice listing) can still be running when the pause-loop exits — see
  Limits. It never refuses a metered (no `::`) `readAloud.memory` voice:
  this case is authorized to touch Zotero's own voices (A3–A7 are it).

## Limits

- **`manager.languages` is scoped to the CURRENTLY SELECTED TIER, not a
  union across tiers**: a "both on" capture read either 9 languages
  (Standard's) or ~67 (Fish's) depending on which tier the popup happened
  to open on. Item 3's check reads `manager._allVoices[i].language`
  instead (global, tier-independent — `.locale` is the plugin's own
  separate `BrowserVoice` type, not this). `03b` redoes it that way: PASS,
  `lostToDisabling: []`.
- **FIXED in 1.12.11-beta2 — the voice browser's `#ztts-voices-tiers` used
  to keep a hidden Zotero tier's column** (`ui/voice-browser-rows.ts`'s
  `listedColumns()`/`listBrowserVoices()` safety net, not yet in `known`):
  confirmed live both ways, `03`/`07` reading the stale column through
  beta and the correct one (`voicesStatusAfterAllOff: "No provider is on:
  enable one above."`) from beta2 on. The player's dropdown
  (`buildTierOptions`) was unaffected throughout, on both builds.
- **A same-instant `providerTiers()` read after opening can catch
  `buildTierOptions`' "nothing has voices yet" fallback while `tiers` in
  the SAME read is already correct** — a timing artifact of the async
  catalog fetch, not a product bug: a re-read 3 s later with no further
  action shows the correct list. Every open in this kit now settles (see
  "Before you start"); an unsettled `options` read will see this.
- **`lastMove` stays `null` through the case's own "close and reopen"
  procedure for a Zotero-tier hide, confirmed on two different closes**:
  a full tab close+reopen (`04`) and a popup-only close+reopen on the
  SAME manager instance (`04b`, `sameManagerInstance: true`) both read
  `lastMove: null`, though `selectedTier` correctly avoids `standard`
  either way. Read from `provider-tiers.ts`'s `retagAndMove`: it only
  records a move when `manager._selectedTier` is ALREADY a string at the
  moment `_resolveVoice` runs; a manager whose session was stopped (by
  either close) does not carry one into its next resolve, so
  `strandedTarget`'s `selected === null` short-circuit fires — Zotero's
  own resolve lands elsewhere directly, since `withoutTiers` already
  dropped Standard's voices before it looks. The mechanism itself is real
  (provider-tiers case B's item 5, writing `_selectedTier` directly before
  `_resolveVoice()`), but is not reachable through the reading guard's own
  mandatory stop-then-switch path (item 6). Item 4's literal expectation
  of a populated `lastMove` looks like a wrong expectation, not a bug; the
  observable behavior it cares about (lands on a real voice, never
  `standard`) held both times.
- **A poll that breaks on "the button's label is not Checking..." alone
  races the click**: the very first read, before the handler has run at
  all, can still show the pre-click label, satisfying "not Checking" and
  ending the loop before anything happened (found live: `pref:false,
  label:"Enable"` moments before a fresh read showed `pref:true,
  label:"Disable"`). `02` was never affected. `05`/`06`/`07` now break on
  the PREF reaching its target, falling back to "Checking seen, then
  cleared" only on a failed check.
- Two `one()` calls for `04b` raced once (a bridge timeout on the first did
  not mean it had not started server-side): wait for `status().busy: false`
  before retrying.
- `03b`/`04b` each require Standard ON at start (they cycle on→off→on);
  the table's order runs `03`/`04` (which leave it OFF) after them — each
  throw's catch self-heals regardless.
- **The reading guard can leave TWO `<dialog id="ztts-notice">` open at
  once if a caller's next action fires before the first settles** (found
  on `06`'s old fixed `sleep(500)`; a single, isolated click resolves
  correctly in ~110 ms, and `showModal()` traps input so a real user
  cannot reach it) — `06` now polls for real settlement (dialog gone AND
  the pref moved, up to 10 s) and throws if a stray dialog remains.
- **`07`'s old `clickAndWaitSettled` flipped whatever the pref CURRENTLY
  was, not an explicit target** (downstream of the `06` race above):
  Premium's guard-triggered disable landing a beat late meant `07` began
  with Premium already off, and its blind flip clicked it back ON
  mid-pass — caught correctly by `07`'s own checks (`["premium"]`,
  `false`), a real finding, not a false pass. Fixed with an explicit
  `desired: false`/`true` per phase, left untouched when already there
  (`skipped: true`); re-run cleanly after.
- **The #159 credits rows unhide only when their refresh paints** (~0.4–0.6 s
  after the `api-key` notification; zotero-credits' `07` measured 620 ms in the
  identical scenario). `11`'s first revision read them once, right after the
  ungrey poll, and saw them still hidden — a stale read, not a bug; `11` now
  polls up to 20 s for the rows before reading them (found live 2026-09-29).
- Item 8 (backup/restore) was not run in either zotero-tiers pass
  (optional per the brief).
- **Toggling a provider/tier `.enabled` pref while ANOTHER reader's own
  session is already active logs a caught `[zotero-tts] can't access
  property "length", list is undefined`** (`live-voice-list.ts` `load()`,
  `stage._allVoices` undefined — column 77 of the built bundle; found live
  by `10`/`11` against the owner's own open tab, `applied` staying 0 for
  its `liveVoiceList()` entry every time, reproduced once more in
  isolation): traced to an in-place reinstall leaving that reader hooked
  to the OLD plugin instance's `loadVoices` wrapper, which the NEW
  instance's `attach()` then captures as `entry.original` and calls with
  a `stage` the old wrapper never populates. Harmless — the session's own
  playback is unaffected — reported to the main session, not a limit of
  these checks; only surfaces when a reader was already active before an
  in-place reinstall, which prior runs of this kit did not have.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-29 | 1.16.2-beta6, Zotero 10.0.3-beta.3+80bc5565e | this run's reply (#159/#158 continuation verification) | 1 PASS (21 groupboxes, Zotero after `ztts-provider-mimo`), 2 PASS (#159 message format, credits in the `credits` field), 10 PASS (#159 Log in links + reason strings, greyed Enable, no-op command), 11 PASS (re-run clean after the credits-row poll fix above, rows shown at 395 ms) | `01`/`02`/`10`/`11` as revised for #159; a mini-pass (no fixture, no `00`/`12` — the zotero-credits kit owned isolation and cleanup); the owner's paused fish session was open throughout and the reading guard correctly did not fire |
| 2026-09-22 | 1.14.1-beta2, Zotero 10.0.3-beta.3+80bc5565e | the #130 closing comment | 10 PASS (`standardAfterSignOut`/`premiumAfterSignOut` exact reason text, every reader `signedIn: false`, `commandEventWasNoOp: true`), 11 PASS (ungreyed at once, every reader `signedIn: true`, Enable re-check matches `zoteroTiers()`'s own message) | First run of `10`/`11`, new for issue #130; both written and run clean first time; found live (see Limits) — toggling either switch while the owner's own OTHER open tab already had an active session logged a caught, harmless `[zotero-tts]` error unrelated to these items' own PASS/FAIL |
| 2026-09-15 | 1.12.11-beta and -beta2, Zotero 10.0.3-beta.1+cfec88e31 | issue #111 verification, first and second pass (the run replies) | First pass: 1–7, 9 PASS except the voice-browser column and the status line (both real bugs, fixed in beta2, see Limits); 8 not run (optional). Second pass on beta2: 1–7, 9 PASS clean | `01`/`05`/`06`/`07` revised mid-first-run (a label attribute, a click-poll race); `04b`/`06`/`07` revised in the second (a guard race, the settlement poll, flip-vs-target); `03b`/`04b` added; superseded per-run detail cut |
