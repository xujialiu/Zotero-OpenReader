---
status: accepted
date: 2026-09-29
issue: 82
---

# The global speed is an ordinary setting

*The product argument is [design 0012](../design/0012-the-global-speed-follows-you.md).*

The global speed lives in `readAloud.speedPercent`, an int pref declared in
`DEFAULTS` and `addon/prefs.js`: hundredths of the speed, default 100,
clamped to 50..300. Being in `DEFAULTS` puts it in the backup set
(`flattenSettings`), the server backup and `SYNCABLE_KEYS` with no code of
its own in any of them, and makes it travel exactly like
`readAloud.volume`. Hundredths, because `Zotero.Prefs.set` writes through
the declared type and an int pref cannot hold 1.5 (why the old Speed
setting never worked); `clampSpeed` already rounds every speed to two
decimals, so hundredths lose nothing.

Until now the speed was the `speed` field of `readAloud.memory`, an
undeclared JSON pref beside the legacy voice choice, kept outside
`DEFAULTS` since issue #41 and therefore carried by neither backup nor
sync. `readMemory` now reads the speed from the new pref and the voice from
the JSON; `writeMemory` writes the speed to the new pref and only the voice
to the JSON. A speed is never absent any more: an unset pref reads as the
default 1.0×, which is what Zotero itself starts a language at.

## Migration without a stamp

A one-time step, marked by the undeclared `globalSpeedMigrated`, copies the
old JSON speed, or failing that the first speed in Zotero's
`reader.readAloudVoices` (`memoryFromVoices`), into the new pref. It runs
first in startup, before the OpenAI split (whose `writeMemory` would
otherwise drop the old JSON speed) and long before the `settings sync`
step registers its per-key observers. The write therefore gets no stamp in
`webdav.syncState`: `mergeSharedSettings` pushes only stamped keys, so no
computer's speed goes up at the update and none is adopted. A seeded
profile keeps its own speed until the next change anywhere, which is
stamped and wins by recency (design 0012). A profile that turns the sync
on later seeds the key like any other non-default setting.

## Applying an incoming speed

`readAloud.speedPercent` joins `PLAYBACK_SETTINGS`
(`src/read-aloud/settings-impact.ts`), beside the volume. The reading
impact therefore reports every open player, paused included, for a change
of it: the settings sync defers the item until every player is closed and
applies it on the next trigger after that (issue #121), and a restore
that would change it is refused as a whole while a player is open. The
player's own speed control, the shortcuts and the voice browser's slider
are direct controls and still apply at once.

When the pref changes and memory-sync did not write it, memory-sync's
observer on it spreads the speed as a local change is spread: every open
reader's manager and Zotero's entry for every language, through
`setDefaultSpeed`, while *Use one speed everywhere* is on. memory-sync
remembers the last speed it wrote itself, so its own writes, and the
spread's, come back through the observer as nothing new.

## Not carried

Zotero's own speeds per document language, used while *Use one speed
everywhere* is off, stay in `reader.readAloudVoices` on each computer. That
pref is Zotero's, keyed by the languages it detected, and holds Zotero's
voice and tier choices beside each speed.
