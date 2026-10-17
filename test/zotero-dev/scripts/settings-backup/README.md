# Scripts: Settings backup: the file, this computer's copy on the server, the pane's groups

[Case](../../cases/settings-backup.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

Items 3.21 and 6.6–6.9 of the checklist, under their original numbers.
Against the user's real WebDAV folder; every test file deleted from the
server at the end, every switch restored. Items that need the local stub
use the [webdav-shutdown kit](../webdav-shutdown/)'s `webdav_stub.py` in
hold mode.

| Script | What it checks | What it expects | Params it reads |
| --- | --- | --- | --- |
| `21-slow-upload-second-change.js` | Item 6.21 (#204): stub in hold mode (hold=14); the pane always closed and reopened (never reuse one across an install); folder off → URL at the stub → Enable; autoUploadSettings on, the other two off; 45 s settle (the webdav.* writes arm the auto-upload too — one held PUT); t=0 change `readAloud.speedPercent` (+1 from its current value), t≈13 s change `readAloud.sentenceDelayMs` (+500); waits for the second PUT; reads both PUT bodies from the stub's files; stats; then 2 quiet minutes | PUT1 at t0+~10 s, PUT2 at PUT1+≈14 s (the hold — within a second of PUT1's answer); body1 holds change 1 only, body2 both; `uploads` +2, `pending` false, `lastOutcome` ok; nothing after PUT2 | `stubPort`, `stubLog` |
| `22-slow-upload-cleanup.js` | The case's cleanup: the two trigger prefs back, the switch off, the test URL back, confirmed | all true | — |

## Limits

- The stub logs a request at receive time, so a held PUT's answer is never
  logged: "within a second of the first one's answer" is measured as the gap
  between the two PUTs (≈ the hold). A stats read before PUT2's answer shows
  `pending` false but `uploads` short by one — read the stats after the hold.
- The webdav.* writes arm the auto-upload (only the sync filters them), so
  every setup fires one PUT ~10 s later; the settle must outlast
  debounce+hold (45 s at hold=14).
- **Run this item on an install-path instance.** On 2026-10-17 the first
  attempt ran on the instance an `addon.enable()` had created after the
  webdav-shutdown item 2's `addon.disable()`: its debounce timers never
  fired (pending armed, no PUT for 10+ minutes, no error, pokes still ran)
  and the attempt failed on the upload counters, not on #204. After an
  in-place `zotero_plugin_install` the identical flow passed. See the
  webdav-shutdown kit's limits.

## Runs

| Run | Build | What it verified | Result |
| --- | --- | --- | --- |
| 2026-10-17 | 1.16.12-beta (`fix/webdav-folder` @ 0b6f4d1, xpi sha256 `4ce0983f…`), Zotero 11.0-beta.1 | Item 6.21: PUT1 at t0+10.2 s (held 14 s), PUT2 at t0+24.2 s (PUT1+14.03 s); body1 149/700, body2 149/1200; uploads +2 (4=2+2), pending false, lastOutcome ok; quiet 3.9 min after PUT2 | PASS (first attempt failed on a dead-timer instance, see limits) |
