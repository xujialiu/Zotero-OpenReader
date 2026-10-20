[Checklist index](../README.md) · [Scripts](../scripts/provider-controls/README.md)

## A provider section: locked fields, Test connection and Enable

What every provider section shares.

Items 1.3, 1.5 and 1.6 of the checklist, under their original numbers.

### 1.3

3. **Locked sections.** Every enabled provider: inputs `disabled`,
   button `Disable`; report `disabled` and `value.length`, never a value.
   The fields whose value is a secret, and the eye that uncovers them,
   are [secret-fields](secret-fields.md).

### 1.5

5. **Test connection, once per provider.** Click-then-poll trace, 100 ms.
   Expected the success line derived from `src/ui/prefs-pane.ts`
   (`Connected. N voices available. …`), within 15 s — measured 211–674
   ms. A failure is acceptable only as a clear message; a status stuck
   at `Testing…` or cleared with no message is a FAIL.

### 1.6

6. **Enable is a commit point** (Local engine, free): Disable → Base URL
   `http://127.0.0.1:9` (the input has no id: select it by its
   `preference` attribute, set `value`, dispatch `input` and `change`)
   → Test connection says `Cannot reach Kokoro at
   http://127.0.0.1:9. Is the server running? (TypeError: NetworkError
   when attempting to fetch resource.)` — the address it tried, never
   the old `not running at that address` (issue #47) → Enable with that
   address leaves the provider **off** with the same sentence beside it,
   the pref false (issue #21) → the real address back → Enable passes,
   the pref true, the section locked. Restore the address verbatim.

### 1.6.1 — Checked fields stay locked (issue #214)

Use a local, credential-free OpenAI-compatible stub with a held synthesis
reply, not a paid provider. Privately snapshot the Compatible section and
turn WebDAV off under the baseline rules. With Compatible off, point it at
the stub and clear its key and Extra headers for the test.

- Click Enable. While its synthesis reply is held, both buttons and every
  input are disabled, including a secret's reveal button. Another disabled
  provider remains editable. An account notification must not unlock the
  checking section.
- Release the passing reply without changing settings: Compatible becomes
  enabled, shows the success line and keeps its fields locked.
- Repeat with Test connection on the disabled section. While held, the
  fields are locked; once it finishes they unlock, the switch stays off.
- Release a failed reply: the switch stays off, the failure remains visible,
  the buttons and ordinary inputs unlock.

Report only disabled flags, switch values, safe stub URLs and messages;
never credentials. Restore the original section and confirm the baseline.

### 1.6.2 — A changed configuration invalidates the result (issue #214)

Use the same isolated stub. Start Enable and hold its synthesis reply.
Write a different safe stub address directly to `compatible.baseURL` (the
path a restore or sync can take), then release the original passing reply.
Expected: `compatible.enabled` remains false, the changed address is kept,
and the line reads `Settings changed during the check. Check again.`
Repeat with Test connection: no stale success line and no switch change.
A subsequent fresh check of the current address can pass normally.

Close the settings window while another Enable reply is held, then release
it. Expected: no late enable and no new plugin error. Reopen Settings and
confirm its switch and fields reflect the prefs, not the abandoned check.

Unit-only: deterministic ordering between the final promise continuation
and its commit; every configurable field; stale restore success and failure
without native dialogs; unrelated settings not invalidating the check.
`test/ui/prefs-pane-state.test.ts` drives the real pane and connection
check; `test/ui/provider-rows.test.ts` covers the controlled interleavings.
Do not open Restore settings' native file dialog to simulate this race.

Verified on 2026-10-20 with 1.16.13-beta, Zotero 11.0-beta.1: all listed
checks passed against the local stub. Fields and secret eyes were locked
at the held reply (105 ms); stale checks showed the exact check-again
message; closing Settings before release left the switch off. The kit's
cleanup also restored a nonempty synthetic credential and a deliberately
abandoned pending check, including user-value presence. This run does not
establish live coverage on Zotero 10.
