---
status: accepted
date: 2026-11-18
issue: 261
---

# The plugin owns the Voice catalog

*The product argument is [design 0026](../design/0026-the-plugin-owns-its-voice-catalog.md).*

This is the Voice catalog step identified in ADR 0005. The Engine and
Player already belong to the plugin, but the available choices and their
application still pass through Read Aloud. The accepted boundary below
does not prescribe how to connect the chosen voice to the manager.

## Forcing facts

- Zotero 10.0.7's `ReadAloudManager.loadVoices` waits for the remote and
  browser lists before publishing `_allVoices` and resolving the choice
  (`resource/reader/reader.js:82360–82373`, retained in
  `test/fixtures/engine/read-aloud-manager-10.0.7.js:458–471`). The
  plugin's composite interface waits for its catalog and Zotero's
  voices together (`src/read-aloud/remote-interface.ts:441`); its own
  collector waits for every enabled Provider to settle
  (`src/read-aloud/catalog.ts:116–129`). Independent timeouts cap the
  wait but do not let a ready Provider be used first.
- Zotero's `_persistCurrentVoice` sends the voice and speed together
  through `onSetVoice` (`resource/reader/reader.js:82437–82448`, same
  fixture at lines 535–546). The shared native preference is also
  rewritten when a Document voice is restored, not just when a voice
  is picked. The [2026-11-18 finding](../../notes/NOTES_2026-11-18.md)
  distinguishes that history from the plugin's saved choices.

## Decision

- The plugin owns which voices are offered and which choice is applied,
  including for Zotero Standard and Premium. Each enabled Provider's
  eligible voices can be selected and used without waiting for another
  Provider. A later result does not replace a selected voice or interrupt
  a Reading session. Zotero remains the source of its voices, audio,
  and Credits; this step does not change billing.
- Play while the selected voice is still being listed authorizes one
  bounded attempt to start with that exact voice. If the voice becomes
  available during the attempt, start without another Play. A time limit,
  Stop, or closing the Player ends the attempt; a later response cannot
  start it. This is a wait for voice availability, not audio buffering
  or permission to substitute a voice. Requiring a second press would
  give the user control of that later start at the cost of asking twice
  for the same reading.
- Switching reader tabs alone does not end a waiting Play. An explicit
  Play in another document cancels the older attempt and immediately
  pauses the current Reading session, if any, even before the new voice
  is available. A failed start neither revives the older attempt nor
  resumes the paused reading.
- When a Provider's connection failure prevents a voice from being
  offered or used, report the failure and name the Provider. A failed
  listing is not evidence that the voice was removed from the Provider.
  Keep the Document voice and favorites intact and do not substitute
  another voice.
- The favorites filter applies while the Voice catalog is loading and
  when a Provider with favorites cannot be reached. Pending or failed
  listings do not establish that no favorite is offered. A connection
  error is visible without relaxing the filter; the user can turn it
  off to see unmarked voices. Keep the existing fallback to all
  available voices only when it is confirmed that no favorite is
  offered, without relying on a pending or failed listing. The
  fallback makes choices visible but never picks a voice.
- Preserve the plugin's Global default voice, Document voice, favorites,
  and their existing backup and sync behavior. Do not import native
  Provider/Language history into the plugin. Keep the explicit voice
  pick required by ADR 0020 and the protection against automatic
  substitution in ADR 0009.
- Do not use the plugin's voice picks or restores to update Zotero's
  native voice choices, or use native picks to update the plugin's.
  Do not reconstruct native history overwritten by older versions.
  Speed is outside this decision; the native preference that also
  carries speed is not a migration source to clear.
- Document analysis, Segmentation, Highlight, and media controls keep
  their current boundaries (ADRs 0003, 0005, and 0007).

Only unblocking the two Zotero Providers would be a smaller change,
but would preserve the same wait between other Providers. Importing or
continuing to share native voice history would preserve an ambiguous
fallback value that does not represent the user's last deliberate choice
and is unnecessary to preserve the three existing plugin records.

## Implementation

- `collectCatalog` reports each result independently. The composite
  interface produces snapshots of the offered and discovered voices and
  each source's state. Zotero Standard and Premium share one source
  request, as they share the native response. The Player's load path
  adapts ready records directly in the reader realm; it no longer runs
  the manager's aggregate Browser/Remote voice load to obtain playable
  voices. Active and prepared voices retain their objects through a
  refresh. Zotero's own audio, cache, and credit requests are unchanged.
- The adapter supplies the exact saved voice privately to the manager and
  intercepts the native voice write for plugin readers. Speed persistence
  writes only the speed field. Opening, restoring, and choosing voices
  no longer read or update Zotero's last voice or Provider history.
- One bounded Play attempt admits the native initial activation for the
  selected document and voice. A delayed activation takes the target that
  the native start had already saved. Subsequent starts fence off earlier
  catalog replies and asynchronous Position pulls. Native media actions
  are left in place; a late `playing` callback from the previous tab
  cannot supersede a pending Play in another one.
- On disable or uninstall, sample the Position and close open plugin
  Players before returning the native interface. Leaving a popup open
  would let native auto-activation read its own voice without a new Play.
  Closing leaves the documents open and preserves their Position, but the
  user must reopen Zotero's player. Upgrades still preserve a paused
  session for the successor.
