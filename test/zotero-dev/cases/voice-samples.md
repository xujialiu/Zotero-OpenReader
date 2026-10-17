[Checklist index](../README.md) · [Scripts](../scripts/voice-samples/README.md)

## Voice samples in the browser (issues #48, #61)

Items 2.6 and 2.11 of the checklist, under their original numbers.

### 2.6

6. **Samples.** ▶ on a Kokoro voice, on a System voice (on a profile
   that keeps the provider off, enable it through the pane's switch for
   the item and disable it after — the switch's own check and the Local
   tier's 787 ↔ 796 relisting prove it came and went, 2026-09-06) and on
   a Zotero voice: glyph `▶` → `…` → `■` → `▶` within ~10 s, and the
   status line
   says how it ended (issue #48): with audio, no `Sample failed:` — the
   default line stays; on a machine with no audio sink the element
   errors ~7 ms after `playing` (`MediaError.code` 3,
   `OnMediaSinkAudioError`) and the line reads `Sample failed: the audio
   arrived, but playback stopped: decoding or output failed
   (OnMediaSinkAudioError)`. A `■` that comes back with the default line
   intact and nothing heard is the swallowed error, the bug itself. A
   failure before playback starts (synthesis, a blob the element refuses)
   still reads `Sample failed: <reason>`, without the "audio arrived"
   clause. `diagnostics.sampleSpeed()` → `startingSpeed` the memory's
   speed, `playing.playbackRate` 1.5, `preservesPitch` true,
   `afterSetRate` 2, and `outcome`: `ended` with audio, `error: decoding
   or output failed (OnMediaSinkAudioError)` without a sink; `neither
   ended nor failed within 3 s` is a stall to report.
   **Switching** (issue #61, 1.11.1): the clicks and a 25 ms poll of
   every row's glyph in ONE script, with the window's
   `HTMLMediaElement.prototype.play`/`pause` timed (waive the Xrays,
   number the elements through a WeakMap, restore in `finally`). With a
   sample playing, ▶ on another voice: in the click's own task the
   playing row is `▶` and the new one `…`, and the playing element's
   `pause()` is stamped 0–2 ms after the click at a `currentTime` below
   its duration; the pair (old `■`, new `…`) is never seen; the new row's
   `■` and its element's `play()` come with its fetch (0.3–1 s for a
   Zotero sample), or at the first poll when the sample is cached
   (`pause` at 1 ms, `play` at 4 ms). ▶ on a third voice while one
   loads: the loading row `▶` and the third `…` in that click's task, no
   `play()` when the superseded fetch lands, and a later ▶ on it is `■`
   in its own task — the arrival was cached. ▶ on the loading row itself:
   `▶` at once, nothing when its fetch lands. ▶ on a cached voice while
   another loads: the loading row `▶` and this one `■` in the same task,
   on a new element. Two cached rows clicked in one task: exactly one
   `play()`, on the second's element, and the first's element has no
   `src`; 5 ms apart, the first's `play` is followed by its `pause` and
   only the second's element is unpaused at its `■`. At every snapshot
   at most one row is `…` or `■`, and the status line never reads
   `Sample failed:`. A sample arriving after the window closed is not
   observable here (the prototype wrapper dies with the window); the
   unit test covers it. That the old voice falls silent at the click is
   the user's to hear.

### 2.11

11. **A sample is made again after the setup changes** (issue #190,
    1.16.12-beta3). Open a fresh settings window (the samples live as long
    as the window, so a reused one answers from its cache) and keep it
    open throughout. Each `diagnostics.systemProvider()` read lists the
    voices once, and that `osascript` lands in the next read's
    `spawned`: a delta between two reads is later − earlier − 1, and the
    counts below are that corrected delta (1.16.12-beta3 run). ▶ on a
    System voice (free; enable System voices for the item if the profile
    keeps them off) and let it end: `diagnostics.systemProvider()`
    `backend.spawned` is up by one `say` (on macOS). ▶ the same voice
    again → `spawned` unchanged, the sample came from the window's cache.
    Change a setting that changes a voice's audio on a provider that is
    off (Azure's Region, say, to another region; the section is editable
    while Azure is off), then ▶ the same System voice → `spawned` up by
    one: the samples are kept under the whole setup
    (`core/settings.ts` `audioSetup`), so any such change makes them again.
    ▶ once more → unchanged. Put the Region back and turn System voices
    off again if the item turned them on. A Model changed through Disable,
    choose, Enable on a paid provider is the same key; it is the unit
    test's (`test/ui/voice-browser-rows.test.ts`), not spent here.
