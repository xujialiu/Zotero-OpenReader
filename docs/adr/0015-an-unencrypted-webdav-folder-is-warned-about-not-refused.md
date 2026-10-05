---
status: accepted
date: 2026-10-05
issue: 172
---

# An unencrypted WebDAV folder is warned about, not refused

*Product decision: [0015](../design/0015-an-unencrypted-webdav-folder-is-warned-about-not-refused.md).*

The WebDAV folder gets its own switch, `webdav.enabled`, run like a
provider's (`ui/provider-rows.ts`): Enable runs the connection check
first, and while the folder is on its address, username and password are
locked. The sync and the server backup use the folder only while it is
on. An address that starts with `http://` is never refused: Enable and
Test connection add a warning to their result line, whatever the
address's host.

## Why not refuse

PR #171, an automated contribution, made `normalizeWebDAVURL`
(`core/webdav.ts`) throw `WebDAVError('config')` for `http://` unless
`isLocalAddress` (`core/settings-sync.ts`) called the host local. It was
closed for three facts:

- **The refusal stops existing syncs without a word.** The settings sync
  and the settings auto-upload do not retry a `'config'` error on their
  timer (`core/settings-sync-transport.ts`, the `arm` after the catch;
  `core/settings-autoupload.ts`, the same), so they stop for good; the
  positions transports fail at every poke. Each failure reaches only the
  log and, if the pane is opened, the status lines.
- **`isLocalAddress` answers a different question.** It says which
  provider sections the settings sync holds back, a server "other
  computers cannot be assumed to reach", and leans to *local* when in
  doubt: an unparsable address, a dotless host, `.local`, 100.64/10. Used
  as a gate on sending a password in the clear, it passes those, and
  refuses `http://` names that are encrypted underneath, such as
  Tailscale's `*.ts.net`.
- **Basic auth is not the only exposure.** `basicAuthHeader` is sent only
  with a username (`createWebDAVClient`), but the files the folder
  receives hold the API keys whether or not the folder has one: the
  settings sync's shared file and the per-machine backup, which holds the
  WebDAV password too.

So the check is the scheme alone, `isPlainHttpURL`, and the answer is a
warning. It is added on a failed check too, since a failed request has
already sent the credentials.

## The switch

- **Default `false`, per computer.** The settings sync never carries a
  `webdav.*` key (`neverSynced`, `core/settings-sync.ts`); the backup
  carries it with the rest of `DEFAULTS`.
- **The upgrade turns it on where a URL is set**, so no sync stops. A
  one-time marker, `webdav.enabledMigrated` (undeclared, outside
  `DEFAULTS`, like `globalSpeedMigrated`), records that the step ran:
  whether `webdav.enabled` was ever written cannot be read from the pref,
  because Gecko drops a user value equal to the default, so a Disable
  would look like a profile that never had the switch and be undone at
  the next start.
- **One gate.** `webdavSwitchOn(webdav, key)` (`core/settings.ts`) is
  `enabled && <the switch>`. The transports, the auto-upload, the startup
  checks in `src/index.ts` and the pane's status lines read through it.
  The pane greys the three switches and the two server-backup buttons
  while the folder is off, and leaves their prefs alone.
- **A restore never turns it on by itself.** `applyBackup` writes
  `webdav.enabled` false whatever the file says, and the pane's restore
  check turns it on once the restored address passes (issue #175), as
  Enable would; a provider's switch, by contrast, is written and then
  re-checked (issue #21). Written straight, the switch observers would
  poke the syncs at an address not yet checked. A backup written before
  the switch existed, holding a URL, counts as on (`parseBackup`), the
  same rule as the upgrade.
