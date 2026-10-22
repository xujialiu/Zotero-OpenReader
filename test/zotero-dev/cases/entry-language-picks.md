[Checklist index](../README.md) · [Scripts](../scripts/entry-language-picks/README.md)

## An entry or language picked in the Player picks no voice (issue #224)

An entry (the Player's first dropdown) or a language picked in the Player
picks no voice. A reading pauses, and a voice switch being prepared is
called off. The Player shows the pick with no voice, opens the voice list
(the language list when the language is empty too), and grays Play out.
The manager keeps its old voice, paused, until a voice of the pick is
chosen; nothing is asked of the provider before Play, and Play reads the
paused sentence from its start. The mechanism is a draft beside Zotero's
manager (`read-aloud/engine/voice-pick.ts` `choose`, ADR 0020). Expected
values are derived from `src/` and the unit tests unless a run is cited.

Run the baseline first; WebDAV off as `MEMORY/testing.md` says. Fixture:
`fixture-a.pdf` as a standalone attachment, its Player opened **muted**
(`readAloud.volume` 0 for the run). Never touch the owner's readers. Save
`extensions.zotero.reader.readAloudVoices`, `readAloud.defaultVoice` and
the fixture's document voice record, with their user-value flags, and
restore them at the end. Use the **System** entry (macOS: English (United
States) and English (United Kingdom) voices; free) and a second free entry
that lists English (United Kingdom) but not every English the System entry
has — Kokoro or Fish Speech where on. Never switch a provider on, and never
pick a Zotero voice: Play on one spends credits.

Drive the picks through the Player's own page, as a click would: in the
Player frame's window, the option rows of the open menu (`.option`, its
`title` the label), or `zttsCommand('provider' | 'locale' | 'voice', value)`
for the one item that names it. The evidence is
`diagnostics.voiceSwitch()` for the fixture's reader: `selected` (the
manager's voice), `paused`, `player` (`provider`, `locale`, `voice`,
`chooseVoice`) and `handoff.draft`.

### 1. The build

1. `diagnostics.startup()`: the beta's version, every step successful.
   `diagnostics.voiceSwitch().mechanism` is `engine-handoff-v3`, or
   `engine-handoff-v4` on a build with issue #226's switch.

### 2. A language pick while reading

1. Reading (playing) on a System English (United States) voice V, pick
   English (United Kingdom) in the Player's language menu. Within one
   second: `paused: true`, `selected` V, `player` `{ provider: 'system',
   locale: 'en-GB', voice: '', chooseVoice: true }`, `handoff.draft`
   `{ tier: 'system', locale: 'en-GB' }`. `#ztts-voice-notice` reads
   "Paused. Choose a voice to continue." and is gone after five seconds.
2. In the Player frame: the voice menu is open by itself (the `.popover`
   with `aria-label` the Player's word for Voice), listing only `en-GB`
   voices, none marked chosen; `.play` is `disabled`.
3. No request for any `en-GB` voice: `diagnostics.engine()` for the
   fixture shows the session's voice V and no new clip asked since the pick.

### 3. An entry pick

1. From item 2's draft, pick the second entry (it has English (United
   Kingdom)): `player.provider` that entry, `locale` `en-GB`, `voice` `''`;
   the voice menu opens again, listing that entry's `en-GB` voices only.
2. Pick an entry with no English (United Kingdom) — the System entry from a
   reading on a voice of a locale only the second entry has, or any pair
   the profile offers: `locale` `''`, the voice list empty, and the
   **language** menu opens by itself.
3. Picking the entry or language the Player shows changes nothing: no
   notice, `handoff.draft` as it was, no menu opens.

### 4. Nothing reads in the old voice meanwhile

1. `Shift+Space`: the notice "Choose a voice in the player first.",
   `paused` stays `true`, `selected` V.
2. The next-sentence key: the reading position moves one sentence
   (`diagnostics.engine()` `session.position` + 1), still paused, nothing
   heard.

### 5. Choosing the voice

1. Pick a voice W of the draft: `selected` W, `paused: true`,
   `handoff.draft` null, `player.voice` W, `chooseVoice: false`; the
   document voice record (`diagnostics.documentVoices()`) names W with
   `manual: true`. No request for W until Play (`diagnostics.engine()`).
2. Play: the first clip is W's, of the sentence the reading paused in,
   from offset 0.
3. The voice keys under a draft: make one again (item 2.1), press the
   next-voice key → the first voice of the draft's list is selected,
   still paused; again with the previous-voice key → the last.

### 6. Closing before choosing

1. Make a draft (item 2.1) and close the Player. Reopen it: provider,
   language and voice are the ones before the pick, and the document voice
   record is unchanged.

### 7. Paused, nothing pauses

1. Paused on V, pick English (United Kingdom): `chooseVoice: true`, no
   "Paused" notice, the voice menu opens.

### 8. Cleanup

Restore every saved preference and user-value flag, the volume and the
fixture's document voice record; close and erase the fixture.

**What only a human judges**: that the menu opening by itself after the
pick feels right in each layout (Top bar, Bottom bar, Floating panel).
