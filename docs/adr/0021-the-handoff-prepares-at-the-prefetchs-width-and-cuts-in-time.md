---
status: accepted
date: 2026-10-22
issue: 226
---

# The handoff prepares at the prefetch's width, and cuts when the next sentence can be in time

*The product argument is [design 0021](../design/0021-a-voice-switch-keeps-the-next-sentence-ready.md).*

## What there was

- **One sentence at a time.** The Handoff (`src/core/engine/handoff.ts`)
  asked for the new voice's audio of the sentence at the position, then,
  when late, one sentence up to `HANDOFF_AHEAD` (8) ahead, one load at a
  time (`loading`).
- **A cut anywhere in the sentence.** `armWord` armed the cut at the first
  word boundary both voices time at least 40 ms ahead as soon as the new
  voice's audio for the position was in, wherever in the sentence that
  fell.
- **The new voice's prefetch starts at the takeover.** While a switch is
  pending the old voice asks for nothing and the session's prefetch does
  not run (`prefetchFrom` returns while `handoff` is set, #163). After the
  takeover, `prefetchFrom(index + 1)` starts from nothing, so the rest of
  the cut sentence was all the time the next sentence had.
- **The old voice's requests held the slots.** The `PrefetchRunner` (one
  per session, ADR 0013) counted every request it sent until it was
  answered. The old voice's requests still on their way at the takeover
  held `requests at once` while their answers went to a closed store
  (`swapVoice` closes it).

Measured on 2026-10-22 (issue #226) with Zotero 10.0.3's own manager (the
excerpt in `test/fixtures/engine/read-aloud-manager-10.0.3.js`), the
Engine and the voice pick on virtual time, every sentence of the
document read to its end:

- **A cut near the end.** At 1.5 s a request and 3 s sentences, a pick
  0.5 s into sentence 1: the new voice's sentence 1 arrived at 6620 ms,
  the cut came at 7150 ms, 0.24 s before the sentence's end. Sentence 2
  was asked for at 7150, "Preparing…" showed at 7690 and went at 8650.
- **The slots.** Old voice at 6 s a request, new at 0.8 s: the takeover
  at 14950 ms, the new voice's first prefetch request at 18000 ms, when
  the old voice's two came back, "Preparing…" at 18790.
- **How often.** 210 switches: 7 server profiles (parallel at 0.6, 1.5 and
  3 s; 3 s old and 0.8 s new; 0.8 s old and 3 s new; one worker both
  voices queue on at 0.8 and 1.5 s) × 2 documents (3 s sentences; 1.25-6 s
  mixed) × 15 moments of the pick. Both voices word-timed: 23% stalled
  after the takeover (mean 223 ms, max 2640). Neither word-timed: 5%. No
  switch at all: 0%.

## Decision

1. **The preparation's width is the prefetch's requests at once**
   (`EngineSession.prefetchSettings().requests`, read at every look,
   at least 1). `ask(index)` loads `index` and the sentences after it, up
   to `index + width - 1`, while fewer than `width` loads are open
   (`loads`, the set that replaces `loading`). It asks where the reading
   is, where the reading waits (`waitAt`), and further ahead when late,
   the same three places as before. A load beside the first (`beside`)
   that fails or times out goes to `debug` and does not fail the switch:
   the prefetch, or playback, asks again when the reading gets there.
   While a switch is pending the old voice asks for nothing (#163), so the
   switch still never has more than `requests at once` open.
2. **A cut at a word waits until the next sentence can be in time**
   (`nextInTime`, after `boundary-too-close` in `armWord`). It passes when
   the next sentence is ready, is past `lastIndex`, or is expected before
   the new voice's clip runs out after the cut:
   - `expected = slowest × HANDOFF_NEXT_MARGIN (1.25) + HANDOFF_NEXT_PADDING_MS (250)`,
     where `slowest` is the longest request of this preparation, from the
     ask to the answer. The padding is Read Aloud's `LATENCY_PADDING_MS`.
   - `neededIn = untilCut + (new clip duration - boundary.offset) / rate`.
   - `readyIn = expected` when the next sentence is on its way, and
     `untilCut + expected` when it is not, since the prefetch asks for it
     at the takeover.

   Otherwise no cut is armed (`wordDecision: 'next-sentence-late'`), and
   the preparation goes on: a later word, or the start of the next
   sentence. **Time on its way earns no credit.** On a server that makes
   one request at a time, the sentence asked beside the first waits
   behind it. The gate as first written, `expected - (now - askedAt)`,
   cut too early and stalled picks at 12.75-13.5 s on the 1.5 s one-worker
   profile with the mixed document. `test/core/engine/handoff-next-sentence.test.ts`
   pins it.
3. **The takeover releases the prefetch's slots**: `PrefetchRunner.release()`
   (cancel, bump an epoch, `open = 0`; an answer from an earlier epoch
   frees nothing). `swapVoice` calls it after the old store is closed.
   The order matters. Released before the close, in the prototype, the
   runner re-ran the old run's queue for the old voice: old unplayed
   requests went from 1.72 to 2.53 a switch, and stalls with the old voice
   6 s and the new 0.8 s from 2% to 22%. For a moment after a takeover the
   old voice's requests and the new voice's together can exceed the
   setting, as after a skip (ADR 0013).
4. **Paused, unchanged.** Play takes the paused word without the gate:
   the preparation goes on asking while paused, two at once from the
   start.

`diagnostics.voiceSwitch()` reports `mechanism: 'engine-handoff-v4'`, and
each reader's `handoff` gains `atOnce` (the most loads open at once) and
`slowestMs`.

## Measured, the code as committed

The same simulation, run on this code rather than the prototype:

| | Stalled after the takeover | Heard, median / mean | Unplayed new-voice requests | Requests open at once, most |
|---|---|---|---|---|
| Before, word-timed | 23% | 3900 / 5215 ms | 0.49 | 3 |
| **After, word-timed** | **0%** | **1950 / 4379 ms** | 0.90 | 4 |
| Before, not word-timed | 5% | 6750 / 7056 ms | 1.28 | 3 |
| **After, not word-timed** | **0%** | **6600 / 6211 ms** | 1.56 | 4 |

The cost is on one-worker servers, where the sentence asked beside the
first is made after it: the median from pick to the new voice heard went
from 1200 to 1950 ms at 0.8 s a request. Every parallel profile kept its
median or improved it (3 s: 8250 to 7500 ms).

The stress profiles (parallel with latency jittered 0.4-3 s; one worker
jittered 0.4-1.5 s; 1.5 s and 3 s parallel and 1.5 s one-worker, all at
1.5×), 150 switches. Word-timed: 32% before, 3% after; with no switch at
all, 1%. Not word-timed: 15% before, 9% after. By profile, word-timed:

| | Stalled, before / after / no switch | Heard, median before / after |
|---|---|---|
| Parallel, jittered 0.4-3 s | 33% / 0% / 0% | 3233 / 2459 ms |
| One worker, jittered 0.4-1.5 s | 20% / 0% / 0% | 1886 / 3301 ms |
| Parallel 1.5 s, 1.5× | 30% / 0% / 0% | 4500 / 3833 ms |
| Parallel 3 s, 1.5× | 70% / 7% / 3% | 7000 / 6750 ms |
| One worker 1.5 s, 1.5× | 7% / 7% / 0% | 9000 / 9250 ms |

What is left is where a sentence is shorter than a request: the 3 s
profile at 1.5×, and the 1.5 s one-worker profile at 1.5×, unchanged. At
three at once the prototype stalled about half as often on the first;
more at once cannot speed up a worker that makes one sentence at a time.

The old provider far slower (6 s and 4 s old, 0.8 s and 0.6 s new), 60
switches: 32% before, 0% after, word-timed.

## Rejected

On the same 210 switches, both voices word-timed:

| | Stalled | Heard, median / mean |
|---|---|---|
| Slots released only | 19% | 3.9 / 5.2 s |
| Cut only with the next sentence in, one load at a time | 5% | 6.8 / 6.4 s |
| Cut only with enough left, one load at a time | 8% | 6.8 / 6.0 s |
| Two at once, cut as before | 21% | 1.9 / 3.0 s |
| Two at once, cut only with the next sentence in | 3% | 6.2 / 5.5 s |

- **Aborting the old voice's requests at the takeover**: no difference
  measured, and whether a server stops synthesizing a request whose
  connection was dropped is unverified.
- **The full prefetch window during the preparation**: a rough version
  failed 6 of 150 switches under stress and stalled 43% on the one-worker
  1.5 s profile at 1.5×.

## Consequences

- ADR 0013's "a handoff still prepares as before" line is superseded by
  item 1.
- `requests at once` now caps the switch's preparation as well as the
  prefetch; the pane's text, which speaks of requests at once in general,
  is unchanged.
