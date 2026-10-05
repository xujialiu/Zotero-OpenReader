# Scripts: the WebDAV folder's Enable / Disable, the http:// warning, the restore check

[Case](../../cases/webdav-folder-switch.md) · [Checklist index](../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

Issues #172–#175 on `feat/webdav-folder-switch`. The run is ABOUT WebDAV: it
uses the test configuration (`~/.secrets/Zotero-TTS/test_webdav.txt`, a URL
line) with every automatic sync/upload suspended, per the tester workflow.

| Script | What it checks | What it expects | Params it reads |
| --- | --- | --- | --- |
| `00-pre-install-isolation.js` | Verbatim snapshot of the whole `zotero-tts` pref branch to a private `.tmp` file; suspends the three sync/upload switches, mutes, points the folder at the test URL and confirms the destination; proves `webdav.enabled` / `webdav.enabledMigrated` hold no user value; counts the migration debug line (0) | `urlMatchesTestFile` true, both migration prefs unset, transports quiet | `tmpDir`, `secretsFile` |
| `00b-isolation-remediation.js` | One-off repair used by the 2026-10-05 run after 00's relative-pref bug (kept as the pattern for clearing stray root prefs and re-isolating through FULL pref names); clears the stray root keys, suspends, switches, mutes, confirms | `urlMatchesTestFile` true, the three switches false, folder true, `enabled` false in all three diagnostics | `tmpDir` (via state's `testUrl`) |
| `01-upgrade-migration.js` | Item 1, after the install: `startup()` all ok; the debug line `the WebDAV folder is on…` appears exactly once; both migration prefs true with user values; `folder: true` in `positionSync()`, `settingsUpload()`, `settingsSync()` | `newLines` 1, folders all true | — |
| `02a-disable-gecko.js` | Item 2a: writes the switch false; `prefHasUserValue` answers false (Gecko drops the default); records the migration-line count | value false, `hasUser` false, `enabledMigrated` true | — |
| `02b-reinstall-stays-off.js` | Item 2b, after the in-place reinstall: no new migration line, the switch stays false and unset, `folder: false` ×3 | `newLines` 0, folders all false | — |
| `03-pane-folder-off.js` | Item 3: fresh settings window; Enable before Test connection in the DOM; the three folder inputs open; the five folder-using rows `disabled`; the switches' prefs untouched by the greying; the password covered with its eye free | all as listed | — |
| `04-enable-test-folder.js` | Item 4: Enable on the test folder (click + 100 ms poll): `Checking…` then `Connected to <test url>.` with no warning; switch true; button Disable; inputs locked; password covered, eye disabled; the five rows enabled | all as listed | — |
| `05a-gate-on.js` | Item 5, on side: positions sync on (the observer pokes `switch-on`), then a fresh pane's `pane-open` poke runs the transport; records all three transports' stats in state | `lastTrigger` `switch-on` then `pane-open`, outcome `ok` | — |
| `05b-gate-off.js` | Item 5, off side: Disable (line empties, rows grey), the same pane-open poke again, field-by-field diff of the three transports | data fields frozen; the attempt counters move by design (`syncs`+1, outcome `skipped`) — see limits | — |
| `05c-gate-reenable.js` | Item 5, close: Enable again (25 ms poll catches `Checking…`), the transport runs with trigger `switch-on`; restores the positions sync to suspended | trigger `switch-on`, outcome `ok`; switches suspended after | — |
| `06-plain-http-refused.js` | Item 6: folder off, URL at `http://127.0.0.1:9/dav/`: Test connection and Enable both end in `Connection failed: …` + the exact warning; the switch stays false; the test URL returns and is confirmed | warning exact per `ztts-webdav-plain-http` | — |
| `07-plain-http-pass.js` | Item 7: a local stub on `127.0.0.1:<port>` answering PROPFIND with 207 + empty multistatus: Enable connects and adds the warning, the switch goes true; then Disable and the test URL back | `Connected to http://127.0.0.1:<port>/dav/. ` + warning | `stubPort` |

Item 9 (the zh-CN strings) was checked by the installed xpi's Fluent source
(`locale/zh-CN/zotero-tts.ftl` inside `build/zotero-tts.xpi`), not by a script.
Item 8 (the restore check) is NOT TESTABLE live — see limits.

## Before you start

- Bridge up; `zotero_plugin_list` shows the build under test; run the baseline
  (test/zotero-dev/baseline.md section 0) with the test-configuration
  isolation from script 00 BEFORE installing the build.
- Install is a bridge call between scripts (`zotero_plugin_install`, then 01;
  the item-2 reinstall between 02a and 02b).
- Items 3–7 need the settings window on the plugin pane; 03/05a/05b open or
  re-open it themselves (`openPreferences` + `navigateToPane`, closed-window
  polls between). Keep the window visible for the two screenshots (folder on,
  folder off) and the §5 rules.
- Item 7's stub: a local Python server answering PROPFIND with 207 (empty
  multistatus) on `127.0.0.1:0`; pass its port as `stubPort`; stop it after.
- State touched: the branch prefs (snapshot in 00, restore at the end — the
  brief's exception leaves `webdav.enabled` and `webdav.enabledMigrated`
  true), the settings window, the test WebDAV folder, a local 127.0.0.1 stub,
  private files under `.tmp/zotero-dev/webdav-folder-switch/` (delete at
  cleanup). Never the owner's own WebDAV address.
- Every pref read/write in these scripts goes through the FULL pref name
  (`Zotero.Prefs.get('extensions.zotero.zotero-tts.…', true)`). A relative
  name with the second argument true reads/writes a stray GLOBAL key and
  silently misses — that was the 2026-10-05 run's first failure.

## Limits

- **Item 8 (the restore check) is NOT TESTABLE live.** The pane's file
  buttons cannot be driven safely from the bridge: `FilePicker.prototype.show`
  is a non-writable accessor, so a sloppy-mode eval cannot stub it (the
  assignment fails silently), and clicking Backup/Restore/Export/Import
  opens REAL native file panels — seven stacked over the 2026-10-05 run
  before the clicks were stopped; the owner cancelled them all and no file
  was written. Do not click those four buttons through the bridge. The
  restore logic (folder written off by `applyBackup`, checked as Enable
  would, on only on a pass) is covered by `test/ui/webdav-rows.test.ts` and
  `test/ui/backup-rows.test.ts`.
- **Item 5, "a poke leaves the transport stats exactly as they were"** holds
  for the data fields (no run against the folder: outcome `skipped`, no
  error, `remoteEntries`/`adopted`/`uploaded` frozen) but not for the
  attempt counters: `poke()` always schedules a sync and `sync()` records
  `syncs`/`lastTrigger`/`lastAt` before checking the gate
  (`position-transport.ts`), so a gated poke moves those four by design.
- The Fluent strings of item 4's `Checking…` transient live well under a
  100 ms poll (the whole check ran ~116 ms); poll at 25 ms (05c, 07) to see it.
- A settings window opened fresh may need a beat before its pane is
  interactable; every script here polls for `ztts-webdav-enable` after
  navigation. Never switch Zotero's locale with the window open.
- The 2026-10-05 run also lost Zotero to a SIGSEGV while a probe poked
  `FilePicker` (`init()` on a real nsIFilePicker + a stubbed `show`); the
  crash report was `zotero-2026-10-05-225456.ips`. Do not initialize real
  pickers from the bridge.

## Runs

| Run | Build | What it verified | Result |
| --- | --- | --- | --- |
| 2026-10-05 | 1.16.7-beta (`feat/webdav-folder-switch` @ 910f8d3, xpi sha256 `9effdef6…`), Zotero 10.0.6-beta.1, from 1.16.6 | Items 1–7 and 9 of cases/webdav-folder-switch.md (the table went to the main session); item 8 NOT TESTABLE (limits above); 00/01 revised after the run (full-name pref access) — 00b is the remediation that actually ran | 1–7 PASS, 8 NOT TESTABLE, 9 PASS |
