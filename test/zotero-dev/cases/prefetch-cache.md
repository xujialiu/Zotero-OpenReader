[Checklist index](../README.md) · [Scripts](../scripts/prefetch-cache/README.md)

## Prefetch and cache (issue #166)

Item 3.8 of the checklist under its original number, rewritten for issue
#166; items 1–8 are #166's. Since #166 the only prefetch is the Engine's
(ADR 0013): for every voice, the sentences after the one that started, as
many as *Prefetch … sentences ahead* says, with at most *Send … requests
at once* open. `JSON.parse(Zotero.ZoteroTTS.diagnostics.engine())`, per
reader: `session.prefetch` — `from`, `sentences`, `requests` and `order`
of the last start, `open` now, `peak` the most open at once since the
tab's session began — and `session.store.signal`. The plugin's warm chain
is gone, and with it every `prefetch: <provider>: …` debug line: a build
that still logs one is not this build.

**State**: `readAloud.prefetchCustom`, `readAloud.prefetchSentences`,
`readAloud.prefetchRequests`, `cacheAudio`, and for item 8 the old
`prefetch` and `prefetchEnabled` (snapshot with user-value status,
restore); the fixture items. **Budget**: Kokoro (local, unmetered) for
everything but item 6; item 6 reads a few sentences on Zotero Standard
only if the account has time to spare, else NOT TESTABLE.

### 3.8

8. **Prefetch and cache.** At the defaults (Custom prefetch on, 5 ahead,
   2 at once) on a fixture not cached yet: after a sentence starts,
   `session.prefetch` reads `sentences: 5, requests: 2`, `order` holds
   exactly the 5 indices `from` … `from + 4` (fewer only at the
   document's end), and `peak` ≤ 2. After the first pass, a replayed
   segment logs `(cached)`. A skip back is answered by the Engine's
   decoded clips (`store.clips`) before the plugin's cache — not a check.

### 1

1. **The reach is the number.** Custom prefetch at 8 ahead, 3 at once:
   play a few sentences. At each start `order` has 8 indices from `from`,
   `peak` ≤ 3, and no provider request reaches past `position + 8` (the
   synthesis lines in the debug store against `session.position`).

### 2

2. **A change applies from the next sentence.** While reading at 5 and 2,
   set *Prefetch … sentences ahead* to 10 in the pane. At the next
   sentence's start `session.prefetch.sentences` is 10 and `order` has 10
   indices, with no stop and no restart (`stats.started` unchanged).

### 3

3. **Custom prefetch off uses the defaults.** With 12 and 4 set, turn the
   switch off: the two fields show 5 and 2, disabled, and the next start
   reads `sentences: 5, requests: 2`; the prefs still hold 12 and 4. On
   again: the fields show 12 and 4, enabled, and the next start uses them.
   An entry of 50 in the sentences field is kept as 20, and 0 in the
   requests field as 1, the field showing what was kept.

### 4

4. **One request at once.** At 6 ahead and 1 at once on a fixture not
   cached: `peak` stays 1 through several sentences, and the provider
   never has two prefetch requests open (beside the one playback waits
   for after a skip, which is allowed).

### 5

5. **The new voice keeps the reach (issue #162).** Reading at 6 and 2,
   switch the voice with *Next voice* (`Shift+.`). Once the new voice
   plays (`diagnostics.voiceSwitch()` `stage: committed`),
   `session.store.signal` is `false`, `session.voice` is the new id, and
   the next start's `order` has 6 indices, asked for in the new voice.

### 6

6. **A Zotero voice follows the numbers.** On a Zotero Standard voice at
   4 ahead and 1 at once: the next start reads `sentences: 4,
   requests: 1`, `order` has 4 indices, `peak` 1.

### 7

7. **The cache stands on its own.** *Cache synthesized audio* is enabled
   whatever Custom prefetch is. Turned off, reading on still fills
   `order` at each start, and on Kokoro the reading does not wait at the
   sentences prefetched (`notices.shown` flat after the first sentence).

### 8

8. **The old pair is never read.** Set by hand `zotero-tts.prefetch` to 9
   and `zotero-tts.prefetchEnabled` to false, and clear the three new
   prefs: the pane shows Custom prefetch on with 5 and 2, and the next
   start reads `sentences: 5, requests: 2`. Clear the two old prefs after.

**Only a human can judge** whether the two rows sit under the switch,
aligned with its label, in both locales.
