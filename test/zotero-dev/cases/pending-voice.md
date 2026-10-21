[Checklist index](../README.md) · [Scripts](../scripts/pending-voice/README.md)

## The Player shows the voice being switched to (issue #225)

A voice picked while reading is prepared while the old one reads on (the
Handoff, [voice-switch](voice-switch.md)). Since issue #225 the Player's
voice field shows the new voice at once, marked chosen in its list, and
the voice notice names both voices on two lines until the new voice takes
over. A switch that fails, or is called off by something other than a pick
(a speed change, Stop), puts the old voice back on the Player with a notice
of its own. Expected values are derived from `src/` and the unit tests
unless a run is cited.

Run the baseline first; WebDAV off as `MEMORY/testing.md` says. Fixture:
`fixture-a.pdf`, its Player opened **muted** (`readAloud.volume` 0). System
voices only; never a Zotero voice. Save and restore the fixture's document
voice record and `extensions.zotero.reader.readAloudVoices`. The evidence is
`diagnostics.voiceSwitch()` for the fixture: `selected` (the manager's
voice), `player.voice` (the Player's), `handoff.pending`, `handoff.notice`;
and `#ztts-voice-notice`'s text and opacity in the document the notice is
drawn in.

### 1. The Player's voice while a switch is pending

1. Reading on A, pick B through the Player's voice menu. Before the
   takeover: `selected` A, `player.voice` B, `handoff.pending` B. In the
   Player frame the voice field reads B, and B's row is the chosen one.
2. After the takeover: `selected` B, `player.voice` B, `handoff.pending`
   null.

### 2. The notice names both voices

1. While item 1.1 is pending: `#ztts-voice-notice` reads
   `Reading voice: A` and `Preparing voice: B` on two lines (its
   `textContent` holds one newline; `white-space: pre-line`), opacity 1,
   for as long as the switch is pending, past five seconds. It is gone
   once B is heard (`handoff.notice` `selected`).

### 3. Calls off

1. Pick B, then C before B takes over: `player.voice` C, the notice reads
   `Reading voice: A` / `Preparing voice: C`, with no called-off notice in
   between.
2. Pick B, then A (the voice reading): `player.voice` A at once, the notice
   gone, nothing else said.
3. Pick B, then change the speed: `player.voice` A, `handoff.pending` null,
   the notice "The switch to B was called off." for five seconds.
4. A failure (a voice whose audio does not come: a System voice is too fast
   to time out, so this is unit-only, `test/read-aloud/engine/voice-pick.test.ts`):
   the existing "Could not switch to B. The previous voice is kept." and
   `player.voice` A.

### 4. Cleanup

Restore the speed, the volume, the saved preferences and the document voice
record; close and erase the fixture.
