[Checklist index](../README.md) · [Scripts](../scripts/webdav-folder-switch/README.md)

## The WebDAV folder has Enable / Disable, and an http:// folder is warned about, never refused (issues #172–#175, 1.16.7)

Since 1.16.7 the WebDAV folder has its own switch, `webdav.enabled`, run
like a provider's (`src/ui/webdav-rows.ts`). Enable runs the folder's
connection check and commits only on a pass; while the folder is on, its
three fields are locked and the password covered. While it is off, the
positions sync (both files), the settings sync and the settings
auto-upload do nothing whatever their switches say (`webdavSwitchOn` in
`src/core/settings.ts`), and the pane greys their three switches and the
server copy's two buttons. On an `http://` address Enable and Test
connection end their line with the warning `ztts-webdav-plain-http`, on a
failure too. The upgrade turns the folder on, once, where an address is
set (the marker `webdav.enabledMigrated`). A restore writes the folder's
switch off and turns it on only once the restored address passes Enable's
check. Decision: ADR 0015.

Run the baseline first, with its test WebDAV isolation: the test
configuration in place and every automatic sync and upload suspended
before the build is installed, so the upgrade runs on the test address.
Items 6 and 7 point the URL at local addresses on `127.0.0.1` that hold no
data; item 8 restores a backup file of the profile's own settings. Put
the test configuration back after each of them and confirm it, and
restore the original configuration and switches at the end as the
baseline says.

1. **The upgrade turns the folder on, once.** Before the install, the
   profile has `extensions.zotero.zotero-tts.webdav.url` set (the test
   address) and no `webdav.enabled` or `webdav.enabledMigrated` user
   value. After `zotero_plugin_install` of 1.16.7-beta: the debug output
   holds `[zotero-tts] the WebDAV folder is on: its address was already
   set` once; `webdav.enabled` is `true` and `webdav.enabledMigrated`
   `true`; `diagnostics.positionSync()`, `settingsUpload()` and
   `settingsSync()` each report `"folder": true`.
2. **Disable survives a restart of the plugin, and Gecko drops the
   default.** Set `webdav.enabled` to `false` (or press Disable).
   `Services.prefs.prefHasUserValue('extensions.zotero.zotero-tts.webdav.enabled')`
   is `false`: the value equals the default, so no user value is kept,
   which is why the marker exists. Reinstall the same xpi: the debug line
   of item 1 does not appear, `webdav.enabled` stays `false`, and the three
   diagnostics report `"folder": false`.
3. **The pane, folder off.** In Settings → OpenReader, the WebDAV group
   shows **Enable** before **Test connection**. The URL, username and
   password inputs are editable (`disabled` false). *Sync reading
   positions between computers*, *Sync settings between computers*,
   *Keep a backup of this computer's settings on the server*, *Back up to
   the server now* and *Restore settings from server…* are `disabled`;
   the three switches' prefs are unchanged by the greying.
4. **Enable on the test folder.** Press Enable: the line shows
   `Checking…`, then `Connected to <test folder URL>.` with no warning
   (an `https://` address). `webdav.enabled` is `true`, the button reads
   **Disable**, the three inputs are `disabled`, the password is covered
   and its eye `disabled`, and the five rows of item 3 are enabled.
5. **The gate.** With the folder on, the positions sync on and the test
   configuration in place, a poke (opening the pane calls one) runs the
   positions transport against the test folder: `positionSync().transport`
   changes its last trigger/outcome. Press Disable: the line empties, the
   rows of item 3 grey, and a further poke leaves
   `positionSync().transport` and `.shared.transport` exactly as they
   were. Press Enable again: within a few seconds the transport runs with
   trigger `switch-on`. Leave the switches as the isolation needs them
   afterwards.
6. **A failed Enable stays off; an http:// address is warned about.**
   With the folder off, set the URL to `http://127.0.0.1:9/dav/` (nothing
   listens there). Test connection: `Connection failed: …` followed by
   `Warning: http:// is not encrypted, so the password and the settings
   sent here, API keys included, can be read on the way. Use https:// if
   the server supports it.` Enable: the same line, and `webdav.enabled`
   stays `false`, the inputs open. Put the test URL back.
7. **A passing http:// Enable still goes on.** Serve a stub on
   `127.0.0.1` (an ephemeral port) that answers any PROPFIND with `207`
   and an empty multistatus. With the folder off and the URL at
   `http://127.0.0.1:<port>/dav/`, Enable: `Connected to
   http://127.0.0.1:<port>/dav/.` followed by the warning, and
   `webdav.enabled` is `true`. Disable, stop the stub, put the test URL
   back and confirm it.
8. **A restore re-checks the folder.** Save *Backup settings…* to a file
   (the profile's own settings, test configuration in place). In a copy,
   set `webdav.password` to a wrong value and `webdav.enabled` to `true`.
   Restore the copy (*Restore settings…*): while the line reads `Checking
   the providers and the WebDAV folder it turns on…`, `webdav.enabled` is
   `false` and no positions or settings sync starts; then the Backup line
   ends with `The WebDAV folder failed its check here, so it is off.`, the
   WebDAV line shows the server's refusal, `webdav.enabled` is `false` and
   the button reads **Enable**. Restore the untouched file: the folder is
   checked, passes, goes on, and the WebDAV line says connected. The test
   configuration and the password are then as they were.
9. **The zh-CN strings** (when the run can switch Zotero's locale, or by
   `diagnostics.l10n()`): the warning reads `注意：http:// 不加密，密码和发到这里的设置（含 API 密钥）在传输途中可能被他人看到。服务器支持的话，请改用 https://。`
   and the restore's sentence `WebDAV 文件夹在这台电脑上没通过检查，已关闭。`

What only a human can judge: how the Enable button sits beside Test
connection, and whether the warning reads well where it wraps.
