# perpare-zotero

Prepare one disposable Zotero for the named test. The main session assigns
functional checks to `zotero-tester` and owns the session until disposal.

## Prepare

1. Get the case, candidate XPI (or the starting XPI for an upgrade),
   and any additional add-ons, settings or fixtures the case requires.
   For a normal verification use the main session's built XPI. For
   research on a particular version, use that exact artifact. If the
   question depends on an existing personal profile, report that
   dependency to the main session before proceeding.
2. Locate the installed Zotero executable, the installed
   `@introfini/mcp-server-zotero-dev` package directory (including its
   SDK dependency), and the MCP Bridge for Zotero XPI. The desktop app,
   bridge add-on and external MCP server are three separate inputs.
   On macOS the executable inside the app is
   `Zotero.app/Contents/MacOS/zotero`. On other platforms use the
   installed executable that owns the Zotero process. Resolve the server
   from the configured zotero-dev installation or the npm exec cache.
   A profile's `extensions/mcp-rdp@zotero.org.xpi` can supply the bridge
   package. Read just the add-on artifact. Leave library files, personal
   preferences, login data and the installed application in place.
3. From the repository root run the helper with absolute input paths.
   Append the paths of any additional XPIs named by the case.

   ```sh
   node scripts/test-zotero.mjs start "$binary" "$server_package" "$bridge_xpi" "$candidate_xpi"
   ```

   Keep the returned `root` as the session handle. The helper creates fresh
   profile and data directories, starts the installed binary with a dedicated
   loopback port, installs the add-ons, and checks their active versions and
   OpenReader startup. Zotero sync and WebDAV start off, playback is muted,
   and System voices are enabled. The two metered Zotero voice tiers start
   off. An upgrade case starts at its baseline build so the tester can
   observe the upgrade itself.
4. Apply only the brief's extra setup using the verified session command
   below. For a declared OpenReader preference, use `set-pref` with its
   key from `addon/prefs.js`, omitting the `extensions.zotero.zotero-tts.`
   prefix. For example, to configure volume, supply `readAloud.volume`
   and a JSON integer. The helper validates the declared type and checks
   the effective value in a separate bridge call. Include the verified
   full key in the handoff. Use the feature’s own setup route for
   dynamically stored records or for settings that require an Enable check.

   Import the named fixture from `test/fixtures/` if
   setup owns that import, or enable a requested test provider and check
   its effective configuration. Leave actions whose effects the case
   measures for the tester. Use the dedicated test WebDAV configuration
   for a WebDAV case. Obtain credentials from the named test source at
   runtime and report only whether the configuration matched. If a required
   input is missing, report the specific missing input. Never substitute
   a personal profile or settings export.

## Handoff and disposal

Return **READY** to the main session with the session root, profile and
data paths, PID and port, add-on IDs/versions, XPI and OpenReader bundle
hashes, startup result, and case-specific setup/fixtures. Include the
case, outstanding test actions and the following commands with the actual
session path. Return **BLOCKED** with the failed check and cleanup status
if setup fails. Before READY the preparer owns cleanup; afterward the main
session forwards the record to the tester and owns final disposal. A resumed
run uses its existing record. If another preparer takes over before READY,
give it the current session root, remaining setup and cleanup status.

```sh
node scripts/test-zotero.mjs call "$session" zotero_ping
node scripts/test-zotero.mjs call "$session" zotero_plugin_list
node scripts/test-zotero.mjs set-pref "$session" readAloud.volume volume.json
node scripts/test-zotero.mjs call "$session" zotero_execute_js arguments.json
node scripts/test-zotero.mjs close "$session"
```

`call` accepts MCP arguments as JSON from a file or from stdin (`-`).
Each invocation checks the complete data path, port, profile and PID before
issuing the requested tool call. Use it for every operation, including
installs, fixture imports and cleanup. The default MCP connection can
belong to another instance. A failed identity check ends the operation.

Keep the instance running through the tester's report. After the tester
releases it, or after a canceled run has stopped driving it, the main
session runs `close`. The helper asks only that verified instance to
quit, waits for exit and removes its temporary directories. On Windows,
Zotero can outlive the launcher PID in an early or older session record.
If cleanup reports a surviving process or cannot verify its identity,
retain the directory. Verify the OS process's executable **and** exact
profile/data arguments against the launch inputs before stopping it.
Retry `close` after exit.
Report any retained directory. Keep test reports outside the session root.
