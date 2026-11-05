# Scripts: system-voice-selection — exact Windows System voice despite overlapping names

[Checklist index](../../README.md) · [Case](../../cases/system-voice-selection.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

Issue #243. Runs with [baseline 0](../../baseline.md); a Windows host with the
NaturalVoiceSAPIAdapter and the three Andrew voices is required. Player and
voice ids are `system::<raw token>`; `diagnostics.systemProvider()` reports
raw Windows names, never the UI labels.

| Script | Checks | Expects (measured 2026-11-05, 1.17.1-beta3) | Params read |
| --- | --- | --- | --- |
| `01-baseline-isolate.js` | Snapshot named prefs + `documentVoices.*` (effective values AND user flags) before any mutation; settle all four transports idle+stable (bounded) — no pref write before that; folder off only if effective on, confirm `folder:false`, then mute; refuses to replace a retained snapshot | `folder:false` confirmed before the mute; busy transports abort with zero writes | — |
| `02-build-identity.js` | After the install: raw System catalog via `systemProvider()`, saved identities byte-identical to 01 (no rewriting), folder recheck | catalog records with the three raw tokens; `prefDiffs` only the run's own writes; `folder:false` | — |
| `03-browser-labels.js` | Settings voice browser rows (System tier × English) | exactly `Andrew (Natural HD)`, `Andrew Online (Natural)`, `AndrewMultilingual Online (Natural)`; no `Microsoft`, no language suffix | — |
| `04-synthesis.js` | `systemProvider(<raw token>)` in order HD → Online → Multilingual → HD; catalog re-listed | no `synthesisError`, `bytes>0`, `audio/wav`, 12 real word marks each; daemon `starts` flat (same helper); catalog identical | — |
| `05-fixture-open.js` | Import fixture-a, plant the fixture's own `documentVoices.user/<key>` (listed free System voice), open Player, pause in the same script | session `selectedVoiceID` = planted token, tier `system`, paused, popup mounted; fail closed otherwise | `fixturesDir`, `fixtureTitle` |
| `06-player-choices.js` | Fixture Player's System/English voice choices (the plugin player inside `#ztts-player-frame`) | picker labels `System`/`English`; the three ids listed with exact labels; rendered rows without vendor/language | — |
| `07-paused-prep.js` | Paused picks: Multilingual, then Andrew HD | each lands the exact token (committed, or the paused handoff's parked `pending` target — case item 4 permits either), exact trigger label, still paused, no failure notice | — |
| `08-playing-handoff.js` | Playing local Andrew → Online pick while playing; audio probe first (boundary-aware progress: position × 10000 + clip time) | OS-focused (measured); audio `running` and advancing; `landed` = session AND manager on `system::sapi5/Edge-en-US-AndrewNeural`, handoff cleared, rising after the cut, `failed:0`; `takeoverProven` true; pause in finally | — |
| `09-cleanup-restore.js` | Teardown and full restoration | rows + `documentVoices` keys AND CONTENTS at baseline (mismatch → folder left OFF + blocker); reading prefs first, memory last, WebDAV excluded and restored EXACTLY (value AND flag) as the final pref write; post-write audit of every pref/branch/four transports; closes only run-opened windows; owner tab selected; minimized | — |
| `10-final-audit.js` | Read-only final audit after the folder-on debounce drains | all four transports idle + stable, folder at snapshot value, all prefs user-flag + effective equal, documentVoices contents equal, rows at baseline | — |

Before you start:

- Build `Zotero-OpenReader.xpi` installed and proved by `startup()` (all steps ok,
  `failed` empty) plus the XPI/inner-bundle SHA-256 and the
  `SAPI selected a different voice than` guard — never the version string.
- WebDAV off and confirmed before muting or any functional step; restored last
  with a settled recheck. Mute `readAloud.volume` before any playback; fixtures
  only for playback (`fixture-a.pdf`); never play or reopen a user session.
- This profile's autoplay gate needs the OS-focused window: a restored but
  unfocused window (or a bare iframe gesture) leaves the AudioContext
  `suspended` at time 0 (measured 2026-11-05); focus before playback steps.

Limits / superseded attempts:

- 2026-11-05, first `05-fixture-player.js` attempt FAILED as a test method:
  the popup was opened before the reader iframe was ready and without a
  planted document choice, so the session died on the azure tier with no
  voice (`selectedVoiceID` null). Not a product failure; the file is replaced
  by `05-fixture-open.js`.
- Earlier method gaps, all fixed in the retained revisions: the first `01`
  computed the folder confirmation before writing and never enforced
  transport idleness; the first `08` compared an undefined `t2` (advancing
  was always false) and crossed a sentence boundary in the post-cut probe
  (progress is now position-aware); the first `09` restored the folder inside
  the reading-pref loop (now last, exact value AND flag) and compared
  document records by key set only (now contents too). The first `10`
  execution raced the folder-on upload debounce; the retained revision
  compares a canonical subset excluding volatile counters.
- The last mini-pass `07` file is a guarded refusal after the fixture had
  moved off paused HD; paused-preparation evidence is the successful first
  pass `07` revision. Per-file scratch outputs are overwritten by later
  attempts, so they are not an archive of every attempt. The issue table
  below states which observations are accepted.

Runs:

| Date | Build | Result table | Items |
| --- | --- | --- | --- |
| 2026-11-05 (first pass) | 1.17.1-beta3 (XPI `0f7577…855d5`, inner `0585e0…89236`) | [Rejected evidence review](https://github.com/xujialiu/Zotero-OpenReader/issues/243#issuecomment-6655959284) | isolation/restoration claims rejected; build identity, browser labels, synthesis and successful paused-preparation observations retained |
| 2026-11-05 (corrected mini-pass) | same beta3, no reinstall | [Accepted results and limitations](https://github.com/xujialiu/Zotero-OpenReader/issues/243#issuecomment-6656515553) | corrected 01 NORMAL (enabled folder → off → mute), 05/06, repaired 08 `takeoverProven:true`, 09 NORMAL folder-last, 10 audit all-green; guard test 5/5 |
