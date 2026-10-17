# Scripts: a WebDAV folder that stops answering — the shutdown's bound, the stopped build

[Case](../../cases/webdav-shutdown.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

Issues #219 and #220 on `fix/webdav-folder`. The run is ABOUT WebDAV: the
test configuration (`~/.secrets/Zotero-TTS/test_webdav.txt`) in place, every
automatic sync/upload suspended before the install, per the tester workflow.

| Script | What it checks | What it expects | Params it reads |
| --- | --- | --- | --- |
| `webdav_stub.py` | The kit's stub (host-side, not through the bridge): 127.0.0.1 ephemeral port, JSON-lines request log (method, path, epoch ms, PUT body file), modes `answer` (PROPFIND 207 empty, GET 404, PUT/MKCOL 201), `hold` (PUT held N s first, #204), `hang` (never answers); `GET /__control?mode=…[&hold=14]` switches mode without a restart; control requests are never logged | prints `{"port", "log", "bodies", "pid"}` at start | `--state-dir` |
| `10-shutdown-setup.js` | Item 1 setup: opens the pane, folder off → URL at the stub → Enable (pane click), syncPositions + syncSettings on, then waits the startup syncs out of the stub log (quiet ≥ 4 s) | `Connected to http://127.0.0.1:<port>/dav/.` + the plain-http warning; settled entries GET/PUT the three files | `stubPort`, `stubLog` |
| `11-switch-hang.js` | Puts the stub in hang mode (control request), records the log length; the reinstall is the harness's `zotero_plugin_install`, right after | `mode: "hang"` | `stubPort`, `stubLog` |
| `12-shutdown-measure.js` | Item 1: reads the log from the offset, clusters the shutdown's three GETs (within ~1.5 s of the first), times the new build's first request after the gap; reads the console for the `timed out at shutdown` errors; stub back to answer mode | spread ≤ ~1 s (8 s apart on 1.16.11); gap 8–10 s (24 s on 1.16.11); three errors: position sync, shared position sync, settings sync flush | `stubPort`, `stubLog` |
| `13-shutdown-cleanup.js` | Item 1 cleanup: ≥ 20 s since the last log entry (retries settled), the two switches off, the test URL back, confirmed | all true | `stubLog` |
| `20-stopped-setup.js` | Item 2 setup: answer mode, pane, folder off → URL at the stub → Enable, syncSettings + autoUploadSettings on (positions off), settle, reads the change-trigger pref | Connected + warning; settled log | `stubPort`, `stubLog` |
| `21-disable-while-hanging.js` | Item 2: hang mode; one settings pref changed (value computed from the pref's current value — an unchanged value notifies no observer); within 5 s the plugin disabled through AddonManager (ESM import, see limits); waits 16 s, reads the segment | the shutdown's PUT (auto-upload) and GET (settings sync) at the disable; `userDisabled` true | `stubPort`, `stubLog` |
| `22-quiet-proof.js` | Item 2, after the harness sleeps ≥ 3.5 min: the segment holds the shutdown's two entries and nothing else; the plugin still disabled | `entriesAfterShutdown` 0 | `stubPort`, `stubLog` |
| `23-reenable.js` | Item 2 close: answer mode, the plugin enabled through AddonManager, `diagnostics.startup()` all steps, the trigger pref back, switches off, test URL back | 28/28 steps ok, `failed` empty | `stubPort`, `stubLog` |

## Before you start

- Bridge up; the baseline with the test-configuration isolation first; the
  build installed before item 1 (the reinstall of item 1 is a second
  `zotero_plugin_install` of the same xpi).
- Start the stub from the host:
  `python3 test/zotero-dev/scripts/webdav-shutdown/webdav_stub.py --state-dir <dir>`;
  pass its `port` and `log` as `stubPort`/`stubLog` to every script. Stop it
  (`kill <pid>`) at the end. Keep the state dir under `.tmp/` (gitignored).
- Item 1 needs *Sync reading positions* + *Sync settings* on; item 2 needs
  *Sync settings* + *Keep a backup* on and positions off. The auto-upload
  observes every `webdav.*` write too (only the sync filters them), so every
  setup arms a PUT — settle 45 s in hold mode, ~20 s otherwise.
- The webdav.* and switch prefs, the settings window, the change-trigger
  pref (`readAloud.speedPercent`), the stub, files under `.tmp/zotero-dev/`;
  restore all of them; leave the plugin enabled.
- Scripts read/write prefs by FULL name (`extensions.zotero.zotero-tts.…`,
  second argument true) and never print username/password values.

## Limits

- **Disable/enable the plugin through the ESM import**: the bridge's bare
  `AddonManager` global is a function without `getAddonByID` — use
  `ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs').AddonManager`
  (2026-10-17: `getAddonByID is not a function` otherwise).
- **An instance created by `addon.enable()` after `addon.disable()` has
  dead debounce timers** (2026-10-17, Zotero 11.0-beta.1): after item 2's
  re-enable, `changed()` armed the auto-upload's 10 s timer and it never
  fired — `pending` stayed true for 10+ minutes with no PUT, no error, and
  immediate pokes (`poke('startup')`, a reader-open sync) still ran; after
  an in-place `zotero_plugin_install` the identical probe fired its PUT at
  10.3 s. Zotero reuses the sandbox across disable/enable
  (`plugins.js` `_loadScope`: `if (scopes.has(addon.id)) return`), so the
  re-evaluated bundle inherits a timer host that schedules nothing. Not
  observed on the install path a real upgrade takes; any later case that
  ends with an AddonManager disable must reinstall the xpi before testing
  timer-driven behavior again (the settings-backup 6.21 first attempt
  failed on exactly this).
- A first attempt of item 2 failed on that import *after* the pref change and
  the hang switch: the planted change's debounce PUT and its 60 s zombie
  retries then ran against the hanging stub while the plugin was still
  enabled (observed 22:44:39 → 22:45:54 → 22:47:10, answer mode settled the
  last) — that cycle is exactly the 1.16.11 behavior #220 kills, seen live.
  Recovery: stub back to answer, let the retries settle, re-run 21 (it
  re-arms from its own change; set a fresh log offset first).
- `Zotero.HTTP.request` throws on any non-2xx unless `successCodes: false`.
- The stub logs at receive time: a held or hung request's answer is never
  logged, so "within a second of the first one's answer" is measured as the
  gap between the two PUTs (≈ the hold time).
- The measure script (12) must switch the stub back to answer mode only
  after reading the times, and the harness must then let the new build's
  failed startup requests retry and settle (~75 s) before cleanup.
- macOS `date +%N` is not nanoseconds; time host-side waits with Python.

## Runs

| Run | Build | What it verified | Result |
| --- | --- | --- | --- |
| 2026-10-17 | 1.16.12-beta (`fix/webdav-folder` @ 0b6f4d1, xpi sha256 `4ce0983f…`), Zotero 11.0-beta.1, from 1.16.11-beta3 | Item 1: the three shutdown GETs 2 ms apart, the new build's first request 8433 ms after the first GET, the three `timed out at shutdown` errors. Item 2: disable 5 ms after the change, the PUT+GET at the disable, then nothing for 3 min 19 s; re-enable 28/28 steps | 1, 2 PASS (12 and 21 revised after first attempts, see limits) |
