[Checklist index](../README.md) · [Scripts](../scripts/webdav-shutdown/README.md)

## A WebDAV folder that stops answering: the shutdown waits one bound, and the stopped build stays stopped (issues #219, #220, 1.16.12)

When the plugin is updated, reloaded, disabled or uninstalled, its last
pushes to the WebDAV folder (the settings auto-upload's pending change,
the settings sync's push, the positions file and the Positions File) run
side by side, each bounded at 8 s (`SYNC_SHUTDOWN_TIMEOUT_MS`,
`src/index.ts`). A folder that accepts connections and never answers
holds the shutdown for about 8 s, not 8 s per file. A run still in flight
when the shutdown gives up arms no retry when it later fails (`stopped` in
`src/core/settings-autoupload.ts` and
`src/core/settings-sync-transport.ts`), so the stopped build makes no
further request.

**The stub.** A local HTTP server the kit owns, on `127.0.0.1` at an
ephemeral port, that logs every request (method, path, time) to a file.
In *answer* mode it answers PROPFIND with 207 and an empty multistatus,
GET with 404, and PUT and MKCOL with 201; it can hold each PUT for a set
time first (item 6.21 of the [settings backup case](settings-backup.md)).
In *hang* mode it accepts a connection, reads the request and never
answers. A control request switches the mode without a restart. The items
point the WebDAV URL at `http://127.0.0.1:<port>/dav/`, where Enable
passes with the http:// warning.

Run the baseline first, with its test WebDAV isolation. Put the test
configuration back after each item and confirm it, stop the stub at the
end, and leave the plugin enabled.

1. **The shutdown holds for one bound** (issue #219). Stub in answer
   mode; the folder Enabled on the stub; *Sync reading positions between
   computers* and *Sync settings between computers* on; let the startup
   syncs settle in the stub's log. Switch the stub to hang mode, then
   reinstall the same xpi in place (`zotero_plugin_install`). Expected:
   the stub logs the shutdown's three GETs, of
   `zotero-tts-shared-settings.json`, `zotero-tts-positions.json` and
   `xujialiu-positions.json`, within about a second of each other (8 s
   apart on 1.16.11). The new build's first request, which cannot come
   before the old build's shutdown has finished (`addon/bootstrap.js`
   awaits it), arrives 8 to 10 s after the first of those GETs (24 s on
   1.16.11). The error console holds the three `timed out at shutdown`
   errors.
2. **The stopped build stays stopped** (issue #220). Stub in answer mode,
   the folder Enabled on it, *Sync settings between computers* and
   *Keep a backup of this computer's settings on the server* on. Switch
   the stub to hang mode, change one settings pref (the auto-upload's
   quiet period starts), and within 5 s disable the plugin through
   `AddonManager` (no new build starts, so every later request is the
   old one's). Expected: the stub logs the shutdown's requests (the
   settings sync's GET and the auto-upload's PUT) at the disable, then
   nothing at all for the next 3 minutes. On 1.16.11 each half retries
   about 75 s after the disable and every 75 s after that. Then enable
   the plugin again, switch the stub to answer mode and confirm
   `diagnostics.startup()` reports every step started.

Only unit tests cover the rest: a run in flight at `stop()` that then
succeeds starting nothing (`test/core/settings-autoupload.test.ts`), and
a run the settings sync had queued behind the shutdown's push never
starting (`test/core/settings-sync-transport.test.ts`).
