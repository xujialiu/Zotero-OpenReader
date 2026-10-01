---
status: accepted
date: 2026-10-01
issue: 166
---

# One prefetch, in the Engine, for every voice

*The product argument is [design 0013](../design/0013-one-prefetch-set-in-two-numbers.md).*

## What there is

- **The Engine's read-ahead** (`src/core/engine/read-ahead.ts`):
  `READ_AHEAD_WINDOW = 3` segments past the one that just started,
  `READ_AHEAD_CONCURRENCY = 2` at a time, ordered by the risk of arriving
  late, copied from Read Aloud's `_prefetchFrom` (reader.js 40258-40301).
  `readAheadFrom` (`src/core/engine/session.ts`) runs it for every voice
  when a clip starts. No setting reaches either constant.
- **The plugin's warm chain**, `prefetchAfter`
  (`src/read-aloud/remote-interface.ts`): after every `getAudio` that
  carries no signal and is not `held` has its audio, it walks the `count`
  segments after that one (`upcomingTexts`), one request at a time and one
  chain at a time (`warming`), skipping keys pending or cached, into the
  audio cache. Plugin providers only. `getPrefetch` reads `prefetchEnabled`
  and `prefetch` (1..10, default 3, `src/core/settings.ts`) per call.
- The chain has nowhere to put its audio but the audio cache, so
  `audioCacheOn` (`src/core/settings.ts`) and `src/ui/prefetch-rows.ts`
  keep the cache on while prefetch is on.
- **The reach is `count` to `count + 3`**, measured 2026-08-29
  (`notes/NOTES_2026-08-29.md`, on Read Aloud's engine, whose window the
  Engine copies): a chain anchors at whichever `getAudio` answered while no
  chain ran, the playing segment or the far edge of the three-segment
  window. At count 2: playing #169, frontier #174.
- The chain is gated on the absence of a signal, which keeps a Handoff's
  preparation from warming. The Handoff's `ClipStore` carries the
  preparation's signal and `swapVoice` makes it the session's store, so
  after a takeover no request of the new voice warms anything (#162).
- ADR 0005 kept Zotero's Standard and Premium at Read Aloud's three ahead
  and two at once with no plugin read-ahead. The Engine's 32 decoded clips
  (`CLIP_CACHE_CAPACITY`, `src/core/engine/clips.ts`) are all that stops a
  replayed `noStore` answer from being billed twice.

## Decision

- **One prefetch, the Engine's.** Its window and its concurrency come from
  the settings, for every voice, Zotero's included: sentences ahead 3..20,
  default 5; requests at once 1..5, default 2. This reverses ADR 0005's
  read-ahead line for the Zotero voices. The warm chain goes, and with it
  the signal gate that #162 tripped over.
- *Custom prefetch* on uses the two numbers; off uses the defaults.
- **Requests at once caps the prefetch, not playback.** The segment
  playback waits for is fetched at once and never queued behind the
  prefetch, and the prefetch's requests for the place a skip left are not
  aborted, so for a moment after a skip `requests + 1` can be open. One
  cap over both was rejected: a request waiting in a serial server's queue
  spends its 60 s bound there and fails as `network` while its audio is
  still on the way (Fish Speech, measured 2026-09-10,
  `notes/NOTES_2026-09-10.md`, issue #89).
- **20 is the ceiling** because the window has to fit in the 32 clips the
  `ClipStore` keeps, beside the playing clip and those just behind it: a
  Premium clip evicted before it plays would be fetched, and billed, again.
- **The cache lock goes.** Prefetched clips live in the session's
  `ClipStore` for the reading; the audio cache only serves hearing a
  segment again and reopening a document.
- **No migration.** New prefs start at their defaults; `prefetch` and
  `prefetchEnabled` are not read again: a restored backup reports them as
  skipped, and the settings sync passes them through untouched. The reset is the new names,
  not a step: nothing runs at an update and no marker records one, so a
  number set after this update survives every later one. `applyBackup`
  writes only the keys a backup holds, and `mergeSharedSettings` adopts
  only the keys the file holds and passes a newer build's keys through,
  so an older backup or an older computer leaves the new prefs alone. A
  later change of meaning gets new names again, never a reset of these.
- A change applies from the next `readAheadFrom` of a running session.

## How

- **Prefs** (`src/core/settings.ts`, `addon/prefs.js`):
  `readAloud.prefetchCustom` (bool, true), `readAloud.prefetchSentences`
  (int, 3..20, 5), `readAloud.prefetchRequests` (int, 1..5, 2), clamped by
  `loadSettings` to `PREFETCH_SENTENCES_*` / `PREFETCH_REQUESTS_*`.
  `prefetchOf(readAloud)` is the pair in effect. `audioCacheOn` is gone:
  the interface gets the audio cache while `cacheAudio` is on, and only
  then. `PLAYBACK_SETTINGS` (`src/read-aloud/settings-impact.ts`) holds the
  three new keys, so a restore or the sync still waits for the players to
  close (#121).
- **The Engine** (`src/core/engine/prefetch.ts`, was `read-ahead.ts`):
  `prefetchOrder` takes the window; `PrefetchRunner` is one per session.
  Its open requests hold their slots across starts, so a new start opens
  only what the setting leaves free; `needed` skips a segment that is
  decoded or on its way without spending a slot; it asks in priority
  order, where Read Aloud's `keepFetching` recursion asked the second of a
  pair first, which at five at once would have asked the next sentence
  last. `SessionDeps.prefetch()` is read at every `prefetchFrom` (was
  `readAheadFrom`), as `pauses()` is at every boundary; without it, the
  session uses `READ_ALOUD_PREFETCH`, Read Aloud's 3 and 2 (the unit
  tests). `src/index.ts` passes `prefetchOf(loadSettings(prefs).readAloud)`
  through `EngineDeps.prefetch`, for every voice.
- **A skip** cancels what the runner has left to ask for the place it
  left (`skipTo`); Read Aloud's run went on fetching there until the new
  sentence started. What is open finishes and keeps its slot.
- **A closed tab** ends its session (`detach`), which drops what the
  runner had left. A window gone without Zotero's close (issue #143) ends
  nothing, so `fetchFor` asks no provider for a dead window: a queue of
  up to 20 would otherwise go on synthesizing for a document nobody is
  listening to, which the warm chain's `isReaderLive` used to stop
  (issue #116).
- **The handoff's signal**: `swapVoice` calls `ClipStore.dropSignal()`,
  so after a takeover the new voice's requests carry no signal and are
  deduplicated in the interface's `pending` map with every other caller's,
  visible to a later switch's `held` lookups (#163). A handoff still
  prepares as before: the sentence being read, then up to `HANDOFF_AHEAD`
  (8) ahead when late.
- **The interface** (`src/read-aloud/remote-interface.ts`):
  `prefetchAfter`, `warming`, `getPrefetch`, `getUpcomingTexts`,
  `mayPrefetch` and `isReaderLive` are deleted, with the session's and the
  Engine's `upcomingTexts` and the Engine's `mayPrefetch`.
- **Backups**: `prefetch` and `prefetchEnabled` are reported as skipped,
  as `readAloud.usePluginPlayer` is since #134. The plan on #166 had them
  dropped silently; the precedent won, and the line tells the user which
  of their settings did not come back.
- **The pane** (`src/ui/prefetch-rows.ts`): the switch is bound; the two
  number fields are not. They show the user's numbers while the switch is
  on and the defaults, disabled, while it is off; an entry is written
  rounded and clamped. An observer on the three prefs repaints them after
  a restore or a sync. The cache checkbox is no longer locked.
- **Diagnostics**: `diagnostics.engine()` gives each reader's
  `session.prefetch` (`from`, `sentences`, `requests`, `order` of the last
  start; `open` now; `peak`, the most open at once) and
  `session.store.signal`, whether the reading's store still carries a
  preparation's signal.
