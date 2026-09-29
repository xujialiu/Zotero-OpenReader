# The global speed follows you

*The engineering half is [ADR 0012](../adr/0012-the-global-speed-is-an-ordinary-setting.md).*

The global speed now travels with the other settings: in a settings backup
restored by hand, in the backup kept on the server, and in the settings
sync between computers. Set 1.6× on one computer, and the others read at
1.6× too, the way the volume already follows you.

Before this, every provider, key, shortcut, favorite and color came across
to a second computer, and reading there still started at 1.0×. The speed
had to be set again by hand on every computer, and with the sync on it was
the one thing you hear that still disagreed between them.

## What travels

Only the global speed: the one speed used while *Use one speed
everywhere* is on, which is how the plugin starts. With that switch off,
Zotero keeps a speed for each document language, and those speeds stay on
the computer they were set on. The switch itself already travels, so the
computers agree on which of the two ways they read.

The default voice and each document's voice already travel since design
0009; nothing about them changes here.

## When a new speed arrives

A speed changed on another computer is treated like the volume and the
other settings that change how reading sounds: while a player is open on
this computer, paused included, the new speed waits, and it takes effect
once every player is closed. Until then every tab keeps the speed it had,
so the tabs still agree with each other. Restoring a backup by hand with a
different speed is refused while a player is open, as a backup with a
different volume already is. Nothing that arrives in the background, or
from a restore, changes the pace of reading you are listening to. In
practice you read on one computer at a time, so the wait is rare.

When two computers change the speed in the same stretch of time, the later
change wins, as with every other synced setting.

## The update itself

Updating the plugin changes no computer's speed. Each computer keeps the
speed it had, even with the sync already on. The next time the speed is
changed on any computer, that change reaches the others.

## What this gives up

- **Making the computers agree at the update.** The update could have
  picked one computer's speed and given it to all. Which one would depend
  on which computer updated first, so a speed you had not touched could
  change under you. Keeping each computer's own speed until you next
  change it costs one change on any computer.
- **The speed per document language.** Carrying those speeds too would
  mean carrying a record Zotero keeps for itself, mixed with Zotero's own
  voice choices for each language. The switch that uses them is off only
  for someone who turned it off.
- **Changing the pace at once.** A speed from another computer could have
  reached a document that is playing or paused straight away. It would
  have been the one setting that the sync or a restore may change under
  reading you are listening to, which the plugin otherwise never allows.
  The cost of waiting is that a speed set elsewhere arrives only when the
  players here are closed.
- **Waiting per document.** A new voice waits only for its own document's
  reading session to end (design 0009). The global speed is one speed for
  every tab, so applying it to some tabs and not others would break the
  very thing it promises; it waits for all of them.
