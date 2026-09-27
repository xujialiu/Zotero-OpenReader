---
status: accepted
date: 2026-09-26
issue: 148
---

# Estimated remaining reading time

*The product argument is [design 0010](../design/0010-estimated-remaining-reading-time.md).*

Issue #148 originally displayed a text-based initial estimate and allowed
updates in either direction. Issue #152 replaces that behavior with
representative-audio readiness and nonincreasing displayed estimates during
ordinary reading. Deliberate voice/speed/position changes reset the display;
section transitions reset only the section display. The accepted design
came from the owner's September 27 interview and the experiments recorded
in that day's notes.

The Engine receives segments through `setSegments`
(`src/core/engine/session.ts`). The existing heuristic in
`src/core/engine/read-ahead.ts` serves prefetch ordering, not a calibrated
user-facing duration model. Provider responses do not expose a universal
duration; decoded audio supplies it through `DecodedClip.duration`
(`src/read-aloud/engine/audio-output.ts`). Synthesizing the entire document
to obtain exact durations would add provider usage and potentially spend
credits on unread text.

Use known audio durations where available and estimate the remaining text.
Account for current audio position, playback speed and the configured gaps;
manual pauses and buffering do not consume reading time. New audio may
revise the internal estimate in either direction, but not the displayed
estimate during ordinary forward reading. A voice change must not reuse the
previous voice's measured pace as though it belonged to the new voice.

Ordinary reading estimates to the document end and, where reliable, the
current reading section end. A selection-limited run estimates only the
selection and uses a distinct label. Run bounds and document bounds must
therefore remain distinct. Completion must also be distinguished from the
Engine's reset to the run's starting position, which would otherwise make
a finished estimate jump back to its initial value.

The Player currently has no duration fields in `PlayerSnapshot`
(`src/read-aloud/player-controller.ts`). The estimate needs an explicit
snapshot contract rather than a dependency on diagnostic output. Display
minutes in every layout, controlled by one default-on setting.

## Chapter mapping findings

Static inspection of Zotero 10.0.3's installed `omni.ja` found a shared
mapping through SDT block references. In `worker.js`, EPUB navigation or
NCX entries map to block refs (166052–166119, 166185–166226); PDF outline
processing attempts the same mapping and can also infer entries from
headings or a printed contents page (156705–156818). In `reader.js`,
`structure.catalog.outline` becomes a nested outline, with referenced
entries pointing to `#sdt-<ref>` (79896–80145). Segment start positions use
the same block references, as recorded in `notes/NOTES_2026-09-21.md`.

This makes intervals between consecutive outline entries feasible
without new document analysis. EPUB spine items alone are not chapters;
PDF page-only destinations cannot locate a chapter starting midway down a
page. Missing, unresolved or out-of-order boundaries must leave the
section estimate unavailable. A mapped reference identifies a text
boundary, not the semantic distinction between a part and a chapter.
The original design used top-level entries. On 2026-09-27, the owner
replaced that scope with consecutive headings at every depth: a parent's
introduction ends at its first child, and each later interval ends at the
next heading in document order. The last interval ends at document end.
There is no depth selector. Invalid boundaries still suppress section
time rather than silently reporting a larger parent interval. A parent and
its first descendant sharing a start use the deepest title. The original
adapter's live results are recorded in `notes/NOTES_2026-09-26.md` and
issue #148; verification of the revised behavior belongs to issue #150.

## Implementation

`RemainingTime` builds text and paragraph prefix sums once per segment
list and keeps Fenwick sums of measured durations and their replaced text
weights. A query is logarithmic in document length; it never rescans the
whole document on the Player's 250 ms refresh. Text weights use three word
tokens or five CJK characters per unit;
these weights alone never produce a displayed estimate. Three non-silent
clips with at least eight word-equivalent units and eight seconds of total
original audio enable extrapolation. Numeric-only text cannot calibrate
pace. Mixed text adds the CJK and word contributions. All known clips,
including short titles and silent skips, use their measured durations.
A fully measured range needs no calibration threshold.

The last 16 eligible clips supply text-weighted pace, with per-clip ratios
winsorized at the sample's 10th and 90th percentiles. The first measurement
initializes pace; subsequent measurements move it 20 percent toward the
weighted sample ratio. There is no assumed voice pace or absolute pace
clamp. Calibration and known-range count are independent, so measured
silence never trains the voice to speak infinitely fast. These are listening
estimates,
never word timestamps. Measurements survive eviction from the 32-clip
cache but are discarded with the voice's store. Reading-time computation
is lazy, and switching the display off bypasses it in the Player.

The Session exposes `remainingTime`, including completion independent of
its reset position, selection scope, current audio offset and the actual
outstanding gap. Future gaps use `computeGap`; a manual pause drops the
outstanding gap because that is the Engine's existing behavior. The
Zotero adapter reads `_internalReader._sdt.structure.catalog.outline` and
uses validated refs and ordered segment positions; entries without a
matching start or boundaries crossed by a segment suppress section time.
The section cache follows outline and segment identity. An outline access
failure is logged once per reader and leaves document estimation usable.

The setting `readAloud.remainingTime` uses the ordinary backup/sync path.
The Player shows one compact localized line with generic document and
section labels, omitting the section title. Minute bounds use the next
integer above the estimate, never less than one. Bars retain their height;
the floating layout adds a 20 px time row above its controls, included in
menu placement and drag bounds. Bar time follows volume in DOM order.
Engine diagnostics expose the same numerical snapshot.

## Selection starts and bounded runs

The installed Zotero 10.0.3 reader has one call to `manager.setSegments`
(`resource/reader/reader.js` 84070), always with `forwardStopIndex: null`.
`_captureReadAloudStart` (84073 onward) consumes a selection as the starting
position; `startReadAloudAtPosition` (84239 onward) likewise starts or jumps
there and continues through the document. Shift+Space therefore correctly
retains document scope. The first live kit's expectation of selection
scope from that shortcut was invalid.

The Engine's bounded-run contract still accepts a non-null forward stop,
and the estimate covers that range as agreed. Its live check supplies an
explicit bounded run through the manager and is reported as a controlled
contract check, not a user-facing selection-only action. Adding such an
action would be a separate playback feature, outside this time display.

## Stable display and listening clock

`RemainingTimeDisplay` holds the last display value and cumulative listening
at its previous query. Each ordinary update is
`max(previous - 1.5 * listeningDelta, min(previous, raw))`.
The update consumes its elapsed allowance even when the number holds: it
cannot save credit for a later correction. Document and section state are
separate; a new section end resets only the section state. Section output
is capped by the displayed document remainder.

`EngineSession` accumulates listening at source stops, natural source ends,
and gap ends/cancellations. While playing it reads unconsumed audio-clock
progress divided by the source's playback rate, never wall time. Gaps add
only their elapsed configured duration. Thus a missing display refresh
across a pause, buffer wait, or device-clock stall cannot bank that waiting
time. Repeated snapshots at the same audio position are idempotent. Pausing
may drop an actual pending gap, but its display correction still obeys the
bound instead of jumping immediately.

A fresh bind, intentional skip, changed speed, voice handoff, or replay
after completion resets the appropriate display state. Ordinary pause and
resume, same-speed writes, and carried-on controllers preserve it. Voice
stores still keep their own calibration. Diagnostics expose
`remainingCalibration` next to the displayed `remainingTime` for readiness
evidence without generating speech.

The experiment's English thresholds were extended through the existing
mixed-script weights for CJK. Generated steady-prose traces had no display
increases; an adversarial faster-then-slower trace had almost six minutes
of unchanged display. These findings justify stability behavior, not a
claim of full-book accuracy. Live integration results are recorded on
issue #152 after verification.
