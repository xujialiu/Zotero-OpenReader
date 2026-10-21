---
status: accepted
date: 2026-10-21
issue: 224
---

# An entry or language pick selects no voice

*The product argument is [design 0020](../design/0020-a-provider-or-language-pick-leaves-the-voice-to-you.md).*

## What there is

- `voice-pick.ts` shadows the manager's `selectVoice`, `selectTier` and
  `setLanguage` (152-210). While the manager is active and not paused
  (166), an entry pick (`selectTier`) or a language pick (`setLanguage`
  with `persist`) is resolved as a dry run of Zotero's own resolution:
  `_applyVoice`, `_persistCurrentVoice` and `_stateChanged` held back, the
  choice fields put back after it (170-186). The voice it lands on goes
  through the Handoff (`begin`, 207), and the pick is replayed on the
  manager only in the Handoff's `commit` (304-306). While paused, the pick
  runs natively and Zotero lands on a voice at once (issue #110).
- memory-sync stages the voice that resolution lands on:
  `stageLanguagePick`, the remembered voice of the locale, else its first
  (#49, #223), and `stageTierPick`, the new entry's voice of the current
  voice's locale (#223), against Zotero's region carry (`currentVoiceRegion`,
  reader.js 84782).
- The Player's three fields are read from the manager
  (`player-controller.ts` 115, 121), so on the Handoff path they show the
  old choice until the commit.
- ADR 0019 kept "a language pick still lands on a voice" because the
  manager needs a voice to keep reading.

## Decision

The owner's answers of 2026-10-21, on issue #224:

- **No entry or language pick selects a voice**, in any state: every tier,
  `standard` and `premium` included, and every locale, `mul` included. A
  remembered voice of the locale is not selected. A pick of the tier or
  locale the Player shows is a no-op.
- **While playing, the pick pauses first** and calls a pending Handoff off.
  Entry and language picks no longer go through the Handoff at all.
- **An entry pick keeps the shown locale** when the new tier lists a voice
  of exactly that locale; otherwise the locale is none too. Zotero's
  fallbacks (`_findFallbackVoice`, the region carry) never choose a locale
  or a voice for a Player pick.
- **A voice picked from none is a fresh selection, not a Handoff.** No
  audio is requested before Play; Play starts the paused Segment from its
  start in the new voice.
- **The document voice record (ADR 0009) is written only at a voice
  pick.** Closing with no voice leaves the record and the manager as they
  were.
- The forced pause shows a voice notice for 5 s; the Player then opens its
  voice picker, or its language picker when the locale is none.

## How it is built

- **The pick is a draft beside the manager, not in it.** The Player's
  `provider` and `locale` commands (`player-controller.ts`) call
  `voicePick.choose(reader, { tier, locale })` instead of `selectTier` /
  `setLanguage`. The draft lives in `read-aloud/engine/voice-pick.ts`, per
  reader, with the manager it was made on. The manager keeps its voice,
  tier and language, paused (`pause()`), and the pending Handoff is
  cancelled. The snapshot overlays the draft: its tier, that tier's
  locales (`entryVoices`, `core/voice-switch.ts`), its locale or none, the
  voices of exactly that locale, voice `''`, `chooseVoice: true`.
- **What would read in the old voice is refused while the draft stands**:
  own-property shadows of `play`, `retry`, `jumpTo` and `repositionTo` on
  the manager answer with the `choose` notice. Zotero's `togglePaused`
  (the media keys, `toggleReadAloudPaused`) reaches `this.play()` and so
  the shadow. The Player's `play` / `open` and the play key
  (`read-aloud-shortcuts.ts smartPlay`) ask `needsVoice` first, which also
  covers an idle manager. Skips are left alone: they move the position
  paused. Each shadow asks `draftOf` before refusing, so a draft that has
  ended passes the call through.
- **A draft ends** at the voice pick, at `detach`, when its manager is gone
  or dead, when its tier has no voice left in `allVoices`, and when a
  manager that was active is no longer (Stop, the Player closed, the
  reading guard's close). `deactivate` is not shadowed for it: the memory
  sync and the live voice list keep their own own-property hooks there.
- **The commit** (`commitDraft`): the voice's `tier` into `_selectedTier`,
  its locale's base into `_lang` and the rest into `_region`, then the
  manager's own `selectVoice` under `select` (propagating), the manager
  paused. `_applyVoice` (reader.js 82507-82537 in 10.0.3) finds the voice
  in `voicesForLanguage` — `currentVoiceRegion` is none for a region
  `normalizeLanguage` drops, and `_region` then names it — and rebuilds the
  controller at the active Segment; the Engine binds it `started`, paused,
  and asks nothing before Play. The memory sync's pick shadow writes the
  document record as for any Player pick. An ended session goes through
  #149's recovery in `begin`; an idle manager takes Zotero's own idle path
  (`_setReadAloudVoice` activates, #183). The voice keys' `step` commits
  the first or last of `playerVoices(entryVoices(...))`.
- **The `selectTier` and `setLanguage` shadows of `voice-pick.ts` are
  gone.** With no Player pick calling them they would only have turned
  Zotero's own calls into dry runs. memory-sync's `stageLanguagePick` and
  `stageTierPick` stay: the Player still calls `selectTier` / `setLanguage`
  when the Engine did not start, and no voice pick is made then.
- `diagnostics.voiceSwitch()` reports `engine-handoff-v3`, and per reader
  the manager's `paused`, the Player's `provider`, `locale`, `voice` and
  `chooseVoice`, and `handoff.draft`.

## Consequences

- Supersedes ADR 0019's "a language pick still lands on a voice". The
  staging of ADR 0019 (`stageLanguagePick`, `stageTierPick`) no longer runs
  for a Player pick while the Engine is running.
- The paused native path of #110 for entry and language picks is gone, and
  so is the Handoff for them while playing (#95, #108).
- A voice pick while reading still goes through the Handoff; the Player
  shows its target at once and its notice names both voices (issue #225).
- A jump while a draft stands — Shift+Space on a selection, Read Aloud
  from Here, a newer position from another computer — is refused, not
  remembered: the reading starts from where it paused once a voice is
  chosen.

## Rejected

- **Selecting the remembered voice but pausing.** It keeps the voice the
  owner did not pick in that moment on the Player.
- **Another locale of the same base language** when the new tier lacks the
  exact one: the silent region change #224 removes.
- **Resuming on the voice pick.** The owner chose Play, so a voice can be
  picked and replaced without audio being requested.
- **Emptying the manager's voice (`_voiceID = null`).** Zotero re-resolves
  a voice whenever the voice list lands (`loadVoices` → `_resolveVoice`),
  at every `applyPersistedVoices`, and the memory sync's restores refill
  it, so the empty voice would not hold.
- **Committing through `selectTier`, `setLanguage` and `selectVoice` in a
  row.** Each of the first two resolves and persists a voice of its own,
  into Zotero's pref and the document record, before the third lands.
