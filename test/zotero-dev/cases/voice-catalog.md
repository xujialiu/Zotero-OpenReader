[Checklist index](../README.md) · [Script kit](../scripts/voice-catalog/README.md)

## The Player can use a ready voice while another Provider is loading (issue #261)

Run [baseline 0](../baseline.md) first and restore all state in
[cleanup](../cleanup.md). Use standalone copies of `fixture-a.pdf` and
`fixture-b.pdf`; do not play or change a user's document. With WebDAV
isolated, use System voices and a credential-free loopback Kokoro fixture
whose `/v1/audio/voices` answer can be held, released with a voice or an
empty list, or refused. Check the effective destination before Play. Use
one local fixture voice such as `af_sample`, with valid local audio. Do not
send metered synthesis, sign out, open native dialogs, or change the user's
server or account outside the isolated test configuration.

Before repointing the fixture Provider, keep it off and make sure no real
key or gateway header can reach the loopback server. Preserve any affected
original values and user flags in Zotero's live runner memory only; never
return or write credentials to disk. Restore the original address and
headers while the Provider is still off, then restore its switch. Refuse
this setup if exact restoration cannot be guaranteed.

Snapshot the affected provider switches and the fixture Provider's address,
Global default voice, favorites, favorites-only, speed, volume, native
`reader.readAloudVoices`, and any other pref readied for the run; restore
values and user flags verbatim. Snapshot the native voice choices privately
and compare without printing them. The fixtures may have test Document
voices; erase the fixture attachments and records in cleanup. Only perform
a disable/re-enable check if that operation can be confined to the test
tabs; otherwise report the live limit and rely on the native-manager test.

**Before any Play:** use IDs from the plugin's own System catalog, not
Zotero's browser voice URIs. Prove the fixture's saved Document voice
through `diagnostics.documentVoices()`; planting `readAloud.memory` does
not change it. No Play is allowed if the saved voice or a proposed
explicit pick is outside the System/loopback allowlist. Do not treat an
idle Player or an unmatched voice ID as a playback observation. A
script-started suspended audio clock does not establish a device fault;
follow the baseline's trusted-key probe before classifying audio.

Read the fixture's Player from `diagnostics.pluginPlayer()`, its list from
`diagnostics.liveVoiceList()` (reader order), and its audio and selected
voice from `diagnostics.engine()`. Use title to identify the fixtures.
`liveVoiceList.sources` being non-null and showing independent outcomes
proves this is the plugin's list rather than a finished native load.
Expected values below are derived from the implementation, not a live PASS.

### 1. A ready Provider can already read

With the Kokoro listing held, select a System voice in the Player and play
it. Before releasing Kokoro, `liveVoiceList.sources.system` is `ready` and
`.local` is `loading`. The Player offers System, `engine.controller.ours`
is true, `engine.session.voice` is the selected System ID, and audio time
advances if the audio baseline passed. Release the list: `.local` becomes
`ready`, and the existing voice, controller count, and playback continue;
there is no new start or re-read caused by the list. The same condition
with a delayed Zotero response is covered by the native-manager fixture.

### 2. One Play waits for the requested voice and place

Select the local test voice for the document, close its Player, and hold
its next listing. Make a selection and press `Shift+Space` once; there is
no active controller while `.local` is `loading`, and the Player reports
that it is waiting for Kokoro's voices. Move the selection or look at the
other fixture tab without pressing Play there. Release the listing. The
first segment is at the place selected for the original Play, in the
saved local voice, with no additional press. A trusted key is preferred
for the keyboard check; a direct start is only a mechanism check.

### 3. A late answer cannot start after Stop, close, or an expired wait

Repeat the held listing and cancel it with Stop or the Player close. After
the released answer, no controller or playing session may appear for that
request. Also let the listing fail its bound once; it must report the
Provider, preserve the Document voice, and not start on a subsequent
successful listing without a new Play. The virtual-clock test covers a
reply arriving after the Play deadline itself, independently of the I/O
bound.

### 4. Another document's Play supersedes the old one

While A waits on its voice, play B in System. Releasing A's list must not
start it or interrupt B. Then reverse the order: while B is speaking,
press Play on A with the slow list held. B is paused immediately, before
there is an A controller. Refuse A's list; A reports Kokoro could not be
reached and B is still paused. No provider is silently substituted.

### 5. A failed listing does not relax favorites

With only the local voice marked and *Offer only favorite voices* on,
System is not offered while Kokoro is loading. Refuse the listing:
`liveVoiceList.sources.local` is `failed`, the Player reports Kokoro by
name, System is still not offered, and neither the favorite nor the saved
voice was changed. In a separate discovery, return a successful empty
Kokoro list; System may now appear but must not start by itself. The
filter switch itself remains on.

### 6. The two sets of choices are separate

Restore and explicitly pick a plugin voice in a fixture. Verify the native
voice/tier preference is unchanged, and the Document voice has the chosen
ID. If safe to disable for the hand-back check, an open plugin Player
closes without starting native audio, its previous Position is retained,
and native Read Aloud no longer lists plugin voices after reopening. Do
not play a metered voice to prove native selection. The offline fixture
starts with Zotero B saved, chooses the plugin's System voice, hands the
reader back and proves Zotero still chooses B, not the first native voice.

Finish with [playback item 3.26](playback.md) and the restoration report.
No perceptual timing or paid-provider validation is claimed by this case.
