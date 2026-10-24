# Scripts: 1b. Fish Audio voice sources (issue #91)

[Case](../../cases/fish-voice-sources.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `10-manual-ids-restricted.js` | Item 10 (issue #216): Fish off + Manual voices off keeps Model IDs disabled through Test connection, a failed Enable (empty key → local no-key failure, no request) and an account-only notification; Manual on permits edits only while the section is unlocked; the saved text is retained when the switch goes off. Safety: requires WebDAV folder off, reuses (never overwrites) an unfinished snapshot, refuses an ACTIVE Read Aloud session (an open reader TAB with no session is fine — the guard can only fire on a session), runs every mutation in try/finally, closes Settings BEFORE the pref restore, verifies value AND user-value presence, discards the privately stored key only after verified cleanup | `idsDisabledBefore: true`; `testFailedLocally` / `enableFailedLocally: true` (line `No API key set for this provider.`), `enableLeftOff: true`; after each failure `after*OrdinaryEditable: true` and `after*IdsStillDisabled: true`; `afterNotifyIdsStillDisabled: true`; `idsEditableWhenManualOn: true`, `prefTookProbe: true`; `idsDisabledWhenManualOff: true`, `fieldRetainedProbe` / `prefRetainedProbe: true`; `settingsClosedBeforeRestore: true`; `allRestored: true`, `restoredKeyLen` = snapshot length | — |
| `11-controls-readonly.js` | Item 4's readonly controls (added 2026-10-24): the three source switches present and locked while Fish is enabled, one horizontal row (tops ±3 px, lefts increasing) under a normal-weight (400) caption; the Voices (Model IDs) field with placeholder, caption `Voices (Model IDs)` and the `fish.audio/app/discovery/` caption link; the ? help content (live tooltip only when the window is OS-active; falls back to the icon's `help` attribute); NO Find Model IDs link, Refresh Fish list button or community search panel; the sources row before Enable/Test connection, result line after; the Fish Speech heading's `github.com/fishaudio/fish-speech` link; no horizontal overflow; a 2x screenshot of the section. Writes NOTHING: no pref, no click | `status: PASS` (`ok: true`): all three switches present; `sameTop`/`leftsIncrease`; `captionFontWeight: '400'`, `caption: 'Voice sources'`; `captionLinkHref === 'https://fish.audio/app/discovery/'`; `includesDiscovery` + `explainsModelId` on the help text; three `absentControls` true; `order` true; `hasGithubFishSpeech`; `noHorizontalOverflow`; `settingsClosed: true`, `hostMinimizedAgain: true` | `tmpDir` (screenshot) |

## Before you start

- WebDAV owner: the run-level isolation step (snapshot privately, confirm
  `diagnostics.positionSync()` `folder: false` before mutations, restore
  value + user-value presence last). The script asserts folder-off before
  mutating and never touches WebDAV itself.
- The script opens the pane fresh (closes any open settings window first)
  and needs NO working Fish key: the empty key makes both checks fail
  locally (`missingKey()` throws before any request — a paid probe is
  never sent). Fish's own switch is turned off through its button; a guard
  dialog aborts the script (no ACTIVE Read Aloud session may exist — an
  open reader tab with no session cannot fire the guard); the try/finally
  restore runs anyway.
- `11` needs no snapshot (it writes nothing); it raises a minimized host
  for the screenshot and minimizes it again. The LIVE tooltip open needs
  the OS-active window; when the host cannot be activated it falls back
  to the icon's `help` attribute (the same text the tooltip shows).
- Snapshot: `fish.enabled/apiKey/voices/includeManual` — the key's VALUE
  is stored only in `Zotero.ZoteroTTSRun.state` (inside Zotero) and the
  report carries its length and user-value flag. Restore honors
  user-value presence (`clearUserPref` where there was none); `enabled`
  is restored by a pref write so no check (and no paid request) runs on
  restore. An interrupted run leaves an unfinished snapshot, which the
  next attempt reuses instead of overwriting; the key value is discarded
  from state only after verified cleanup.

## Limits

- The retention probe writes a harmless placeholder
  (`manual-retention-probe-123`) through the field while editable and
  restores the original text afterwards; the placeholder is the retention
  subject, not the owner's saved text.
- Items 1–9 need a working key and their own fixture; see the case.
- `11`'s first execution (2026-10-24) failed its screenshot: `drawSnapshot`
  was not awaited, so the OffscreenCanvas got a NaN size; fixed in the
  same run and executed in the fixed form (56,803-byte PNG). Tooltip
  expansion was NOT TESTABLE because Settings could not become OS-active;
  only its help content was verified. The script's PASS is not a live
  tooltip-expansion PASS.
- Case item 4 now names the shipped defaults: `includeOfficial: true`,
  `includeOwn: false`, `includeManual: false`, verified against
  `src/core/settings.ts` and `addon/prefs.js` after the 2026-10-24 run.
  This corrects the old checklist, not the implementation.

## Runs

Items 1–9 of the case were verified live on 2026-09-12
(1.12.2-beta2; the run's notes hold the table). Item 10 (issue #216) has
its own script, added 2026-10-20; item 4's readonly controls have `11`,
added 2026-10-24.

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-24 | 1.16.16-beta (SHA-256 019e8406…8bf), Zotero 10.0.6 | [Verification](https://github.com/xujialiu/Zotero-OpenReader/issues/230#issuecomment-6381987700) | 10 PASS (2.7 s; every expectation above true; key restored to len 51 with its user value; enabled restored true by pref write), 11 PASS (1.9 s first form, re-run clean in `-b` after the screenshot fix; switches locked while Fish enabled, row tops 553/553/553, caption `Voice sources` weight 400, discovery link, absent controls, order, github heading, no overflow) | profile had Fish on (real key, len 51), manual off, one saved Model-ID link (54 chars, link form); the owner's paused Fish session was closed under the baseline rules before the run (noted, not reopened) |
| 2026-10-20 (follow-up) | 1.16.13-beta (SHA-256 fed53c1d…a63), Zotero 11.0-beta.1+b551fb670 | [Verification and kit follow-up](https://github.com/xujialiu/Zotero-OpenReader/issues/216#issuecomment-6288335087) | 10 revised PASS (2.6 s; same expectations, now with folder:false assert, try/finally restore, Settings closed before restore, value+presence verification, key discarded after verified cleanup) | first run clean in revised form |
| 2026-10-20 | 1.16.13-beta (SHA-256 fed53c1d…a63), Zotero 11.0-beta.1+b551fb670 | [Verification](https://github.com/xujialiu/Zotero-OpenReader/issues/216#issuecomment-6288335087) | 10 PASS (every expectation above true; key restored to len 51 with its user value; enabled restored true by pref write) | first run clean; profile had fish on (real key), manual off, one saved Model ID link |
| 2026-09-12 | 1.12.2-beta2 | issue #91 closing comment | 1–8 PASS, 9 restored | full-table run predates item 10 |
