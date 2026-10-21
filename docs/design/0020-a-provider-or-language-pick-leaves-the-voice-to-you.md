# Choosing a provider or a language leaves the voice to you

*The engineering half is [ADR 0020](../adr/0020-an-entry-or-language-pick-selects-no-voice.md).*

Choosing an entry in the player's first list, a provider or Zotero
Standard or Premium, or a language in its second, no longer chooses a
voice. The voice is left empty until the owner picks one, and a reading in
progress pauses until then.

This reverses one rule of [design 0019](0019-every-region-is-a-language-of-its-own.md),
the owner's answer of 2026-10-18: there, choosing a language picked the
voice last used for it, else the first, and the reading went on with it.

## Why

- **The voice was not the owner's choice.** Switching English (United
  States) to English (United Kingdom) while reading, the lists went on
  showing the old choice, and a moment later a British voice the owner had
  never picked was reading. The switch first looked ignored, then random.
- **That voice cost money.** Its audio for the sentence being read and up
  to eight more was fetched before the owner could react. A language is
  usually chosen on the way to a particular voice, so that voice, and its
  audio, was mostly thrown away a click later.
- **The phone already works this way.** Choosing a language there picks
  nothing until a voice is chosen.
- **The reason for picking one is gone.** Design 0019 picked a voice so
  that the reading would not stop. Now stopping is the point: the reading
  waits for the voice the owner wants.

## What happens

- **The reading pauses** where it stands, and a voice that was being
  prepared to take over is dropped. A short notice says the reading paused
  for a voice, and the voice list opens by itself.
- **Every provider and every language counts**, Zotero's own two included,
  and another language as much as another region of the same one. A voice
  last used for the language is not picked either. Choosing what is
  already chosen changes nothing.
- **A new provider keeps the language** when it has exactly that one.
  When it does not, the language is left empty too, and its list opens
  instead. No other region of the same language is put in its place.
- **Without a voice, there is no Play.** The button is grayed out, the
  play key asks for a voice, and so does starting from a selection; the
  previous and next voice keys pick the first or last voice of the list.
  Skipping still moves the place.
- **Picking a voice leaves the reading paused.** Play reads the sentence it
  paused in from its start, in the new voice. Nothing is asked of the
  provider before Play, so a voice tried and replaced costs nothing.
- **The document keeps its old voice until a new one is picked.** Closing
  the player or the tab with none chosen brings back the old provider,
  language and voice at the next open.

## What it costs

- One more click at every change of provider or language, also when the
  language has a voice last used for it.
- The reading stops at every such change, even when the owner would have
  been happy with the voice it used to pick.
- The first Play after a voice is picked waits for that sentence's audio,
  since nothing was fetched ahead.

## Turned down

- **Picking the voice last used for the language, but pausing.** One click
  less, but the voice on the screen would still be one the owner did not
  pick just then, which is what made the switch look random.
- **Another region of the same language** when a new provider lacks the
  exact one. That is the silent change of region this decision removes.
- **Reading on as soon as a voice is picked.** The owner chose to press
  Play, so that a voice can be tried in the list without anything being
  read or paid for.
