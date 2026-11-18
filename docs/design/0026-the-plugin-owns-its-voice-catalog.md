# The plugin owns its voice catalog

*The engineering half is [ADR 0026](../adr/0026-the-plugin-owns-its-voice-catalog.md).*

The plugin already has its own player and plays every voice itself. But
when you open the player, the voices still arrive together through
Zotero's Read Aloud. If one provider is slow, you can end up waiting
before you can choose a voice from a provider that is already ready.

## What changes

- **Use a voice as soon as its provider is ready.** If System voices are
  ready and Zotero's or your own server's voices are still loading, you
  can choose a System voice that your settings offer and start reading.
  More voices may appear as their providers answer, but they do not
  change what you picked or interrupt a reading.
- **One press of Play is enough.** If your document's chosen voice is
  still loading, the player waits for that voice. If it becomes available
  in time, reading starts with it without another press. No other voice
  is used. If the wait times out, you press Stop, or you close the player,
  reading does not start later.
- **Play in another document takes over.** Just looking at another tab
  does not cancel the wait. Pressing Play in another document cancels the
  old wait and pauses any document that is already reading. If the new
  reading fails to start, the old one does not start again on its own.
- **A connection failure is reported.** If the player cannot reach the
  provider for the voice you are trying to use, it names the provider
  and says what went wrong. It keeps your saved choice and favorites.
  No other voice takes its place.
- **Only favorites keeps filtering while voices load or a provider
  cannot be reached.** If the only favorite you marked is in Azure and Azure
  cannot be reached, the player says so instead of showing unmarked
  System voices in its place. You can turn off the filter yourself to
  choose one. Only when the player can confirm that no favorite is
  offered does it show all available voices as before. It does not
  choose one for you.
- **Keep the choices you saved.** The global default, each document's
  voice, and favorites carry across the update. An absent voice is not
  replaced automatically. Changing the provider or language in the
  player still leaves the voice for you to pick.
- **The plugin and Zotero remember their own choices.** If you choose one
  voice in Zotero's Read Aloud and a different one in the plugin, neither
  choice changes the other. Turning the plugin off closes its player and
  keeps your place; reopen Zotero's own player to use its choices. The
  update does not recover choices
  already overwritten by an older version.

Zotero Standard and Premium remain available as before and use the same
credits. What gets read, the highlighting, and the system media keys stay
as they are.

## What it costs

The voice list can fill in a provider at a time instead of appearing
all at once. If you listen in both the plugin and Zotero's Read Aloud,
you may have to pick a voice twice to use it in both. Requiring another
press of Play after a slow voice loads would avoid starting after a wait,
but it would also make you ask twice to hear the same voice.

Letting only Zotero's voices arrive on their own would be less work,
but a slow server of your own could still keep other voices out of
reach. Keeping one shared voice history would save a pick for people
using both, but reading a document in one could change what the other
reads with. Old voice history is not copied into the plugin:
it can reflect a document's restored voice, not a voice you picked
yourself.
