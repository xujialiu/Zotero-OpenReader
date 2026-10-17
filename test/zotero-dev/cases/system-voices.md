[Checklist index](../README.md) · [Scripts](../scripts/system-voices/README.md)

## System voices

Items 1.8 and 1.17 of the checklist, under their original numbers.

### 1.8

8. **System voices.** `diagnostics.systemProvider()` → `enabled`,
   `platform` (`"win"` / `"mac"`), `unsupported: null`, `backend` with
   its `platform`, `wordTimestamps` and state, voices with
   `id`/`name`/`lang`/`zoteroId`; then with the first voice id →
   `synthesis.bytes` > 0, `type` audio, `backendAfter`. **On Windows**:
   `backend.running`, ids `sapi5/…` / `onecore/…`, `zoteroId`
   `local-urn:moz-tts:sapi:<desc>?<lang>`, `synthesis.words` > 0 (or
   `words: 0` with the SAPI-rate `note`); Test connection → `Connected.
   N voices available. Word timestamps available.`; the note beside the
   `?` reads `Your Windows voices, with word highlighting.` **On macOS**
   (issue #23, 1.11.0): `backend.wordTimestamps: false` and
   `backend.spawned` counting up (one `osascript` per listing, one `say`
   per sentence); every id `osx/<identifier>` with `zoteroId`
   `local-urn:moz-tts:osx:<identifier>`, the id set identical to
   `speechSynthesis.getVoices()` in the main window (191 = 191 on
   2026-09-06); `synthesis.words: 0` with `note: "macOS voices come
   without word timings"`; `diagnostics.systemProvider('osx/com.apple.voice.nosuch')`
   → `synthesisError` naming the voice and no `synthesis` — `say` alone
   would have spoken Samantha, exit 0; Test connection → `Connected. N
   voices available. Synthesis works. No word timestamps: macOS voices
   have none, so the sentence is highlighted.`; Enable turns
   `system.enabled` on and locks the section, and a planted
   `reader.readAloudVoices` entry naming `local-urn:moz-tts:osx:<id>` is
   rewritten to `system::osx/<id>` in `voice` and `tierVoices.local`
   about 0.5 s *after* the button reads Disable (the adoption is not
   awaited — poll the pref; and reset `readAloud.memory` after planting,
   since a chrome-scope write of that pref is a pick to memory-sync),
   with `adopted 1 remembered voice(s)` in the log; Disable off; the note
   reads `Your Mac's voices, highlighted by sentence.` with the Windows
   and Linux notes `hidden`. **On Linux** instead: `unsupported` is the
   platform sentence (`System voices are available on Windows and macOS
   only; this build has no speech helper for Linux.`), the note reads
   `Not available on Linux.`, and Test connection **and** Enable on the
   System voices section write that same sentence, word for word, to
   `#ztts-test-result-system` — never a sentence about an address, which
   that section does not have (issue #47); Enable leaves the pref false.

### 1.17

17. **One row per voice when macOS lists a voice twice** (issue #185,
    1.16.12-beta3; macOS 27.0.1, build 26A434, where the system's list has
    235 entries for 193 identifiers). With System voices enabled (on a
    profile that keeps them off, through the pane's switch, and off again
    after): `diagnostics.systemProvider()` → `platform: "mac"`, `voices`
    193 long with no repeated `id`, and the ids of Daniel, Moira, Rishi,
    Samantha and Tessa (the five English voices the system repeats) once
    each; Zotero's debug output reads `macOS lists 193 voices` for the
    listing (235 before the fix). With Offer only favorite voices off, in
    an open reader whose Player has listed its voices, the manager's `_allVoices` holds 193 ids starting
    `system::`, none twice. The voice browser's System column reads
    `(193)`. In the Player on the System entry and English, with the voice
    listed just before Samantha selected and the reading idle, `Shift+.`
    three times → `manager.selectedVoiceID` takes three different ids in
    the list's order, Samantha's among them, and never the same id twice
    in a row (before the fix it stayed on Samantha). The voice selected at
    the start is restored after.
