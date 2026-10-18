# Scripts: voice switching (issues #95, #108, #149, #154, #163, #194, #196)

[Case](../../cases/voice-switch.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

## Issues #194/#196 kit (added 2026-10-18)

A local stub (`127.0.0.1:8765`, `.tmp/zotero-dev/provider-replies/stub-server.py`, state in
`stub-state.json`, log in `stub-log.jsonl`) stands in for OpenAI Compatible with two voices
(`stub-echo`, `stub-fox`). The section points at it (`194-00`). Hold/fail cues are stub modes
(`speech_mode` ok/fail/delay, `speech_match_voice`+`speech_match_text` for a voice-and-text match);
a flip during a held delay hits the in-flight request (the state is re-read after the sleep).
Fixtures are fresh-prose PDFs per attempt (`.tmp/zotero-dev/provider-replies/194a…196g.pdf`) —
the audio cache is text-keyed for the process life.

| Script | Checks | Expected |
| --- | --- | --- |
| `194-00-compatible-stub.js` | The section pointed at the stub; the stub's voices reachable | pass true |
| `194-01-end-then-pick.js` | Item 15a: voice A read to the end (manager paused, session halted), pick B of the same provider → `ready` ≤ ~3 s; Play reads in B from the start | pass true; pickAt in state |
| `194-02-wait-130.js` | The 130 s window: no `Could not switch` notice, no `no prepared handoff boundary was reached` anywhere (console ring, getErrors) | pass true |
| `194-03-failed-sentence.js` | Item 15b setup: the stub refuses A's second sentence; the error shows (playback notice, manager paused, session error) | pass true |
| `194-03b-pick-after-error.js` | The pick on the error-halted session → `ready` ≤ ~3 s | pass true |
| `194-04-wait-130.js` | The 130 s window for variant (b) | pass true |
| `196-01-held-released.js` | Item 16a: A's next-sentence request held 45 s; pick B, Pause/Play so B takes the sentence; the stale answer lands afterwards — no `Playback failed`, `session.error` null | pass true |
| `196-02-held-arm-fail.js` / `196-03-held-failed-check.js` | Item 16b: same, and the tester flips the stub to fail while the request is in flight | pass true |

Run notes (2026-10-18, 1.16.12-beta6, Zotero 11.0-beta.1):

- 15a PASS: `ready` in 202 ms (pending B), Play read in B at +613 ms; 130 s clean (console and
  ring empty, handoff committed `last {kind sentence, from→to}`, notice selected, oldRequests 0).
- 15b PASS: ready in 211 ms after the error; 130 s clean.
- **Zotero 11 shape**: at the document end the manager pauses the controller too, so
  `session.paused` reads true (10.0.3 read false — the #194 note); `waitsForPlay` holds either way.
  The case's end-state oracle should accept both.
- **Residue**: the "Preparing voice: Stub Fox" element can outlive a committed switch (observed
  after both 15 variants; the report's `notice` field says `selected`). Reported, not fixed here.
- **Unanticipated**: after a failed sentence, the session's latched error blocked every replay
  path (manager.play, retry(), toggleReadAloudPaused) — the Player said "Try playing again" but
  Play did not run. Outside #194/#196's scope; reported for the main session.
- 16a PASS: B took the sentence at Pause/Play (+308 ms), read on; the stale echo answer landed at
  +45 s with no `Playback failed`, `error` null. Variant (b) NOT COMPLETED: the takeover does not
  commit while the current sentence's audio is missing (the handoff stays `waiting`, and the
  in-flight failure then lands on A's own store — a legitimate pre-takeover failure). The
  shared drop handler is unit-covered (`test/core/engine`).
- Pick races: a `selectTier`/`selectVoice` during the popup's first catalog listing can be dropped;
  wait for a `compatible::` voice in `m.allVoices` first. While playing, a pick arms the Handoff —
  assert the SESSION's voice, not `selectedVoiceID`. AudioContexts rebuilt by controller swaps
  start suspended here; pause+gesture+play resumes them.

## Issue #163 kit (added 2026-10-01)

State: private `Zotero.__ztts163` (`baseline`, `fixtures`, `voiceA/voiceB`, `voiceX`, `hold {armed,
ms, mode, voice}`, `holdVoice`, `fixtureItemID`). Fixtures: fresh-prose PDFs under
`.tmp/zotero-dev/163-fixture/` (`fixture-163c.pdf` … `163k.pdf`, every sentence carries a unique
marker), passed per run via `params.fixture163` / `params.fixture163Alt`.

| Script | Checks | Expected | Params/state |
| --- | --- | --- | --- |
| `163-00-baseline-and-isolate.js` | Private baseline and dedicated test-WebDAV isolation before install | Destination matches; transports idle; host minimized; position rows recorded | private `__ztts163` |
| `163-01-mute-import-open-seed.js` | Mute, prefetch 8, import the run fixture, open player paused on a free local pair, favorites-only | Engine session paused on a `local::af_` voice; cycle list [af_alloy, af_bella]; 27 segments | `params.fixture163`; erases the previous attempt's fixture first |
| `163-02-identity-and-audio-probe.js` | Item 1 identity + audio device probe | `mechanism engine-handoff-v2`; previous `Shift+,`, next `Shift+.`; `controlsAttached` true per reader; startup has the Engine + voice switching, failed []; audio running, playbackTime advances | — |
| `163-03-reading-on-waits.js` | Item 14 reading-on: pick B held 20 s while A reads on | `pending` B, `oldRequests` 0; `store.requests` flat; at the first dry sentence `stage waiting`, `waitedAt`, `lookups` up, Preparing…; commit `last {kind sentence, index waitedAt, offset 0}`, notice `selected`, `oldRequests` 0, zero A fetches after the pick | fresh fixture per attempt (the cache warms both voices) |
| `163-04-skip-past-readahead.js` | Item 14 skip to a sentence A lacks | Landing dry: `stage waiting`, `waitedAt` = landing, no A request; commit `sentence` at the landing from 0; `xFetches` 0 | `fixture163` + `fixture163Alt` |
| `163-05-jump-keeps-switch.js` | Item 14 jump: `repositionTo` past the stock | `stats.started` +1, no `cancelled`, `pending` kept, commit at the landing, `fallbacks` 0 | fresh fixture |
| `163-06-skip-to-held-sentence.js` | Item 14 skip to a sentence A has | A reads the landing from 0; B takes over within it or later; `oldRequests` 0; no A fetch | warm fixture OK |
| `163-07-failure-while-waiting.js` | Item 14 failure while waiting | `stage failed`, notice `failed`; A asks once and reads it; `fallbacks` 0 | fresh fixture |
| `163-08-speed-while-waiting.js` | Item 14 speed change while waiting | `stage cancelled`, pending null; A reads at the new speed | fresh fixture |
| `163-09-prepared-reuse-paused.js` | Item 14 both-have-it (paused prepared reuse) | `prepared` holds position+1; Play reads it in B from 0, no second request | warm fixture |
| `163-10-paused-skip-ready.js` | Item 14 paused skip: pause, pick, `←` | notice `ready` once B holds the landing; Play reads it in B from 0 | warm fixture OK |
| `163-11-selection-start.js` | Item 14 jump via a selection start | Restart at the selection, `ended`/`started` +1, switch kept | `selection163Variant` dry/warm |
| `163-99-cleanup-and-restore.js` | Fixtures out, prefs byte-identical, WebDAV restored, host minimized | Erased rows back to baseline | private baseline |

2026-10-01 runs (1.16.3-beta6/beta7): 00-02, item 14 (163-03…163-10 PASS), 163-11 dry+warm PASS,
99 cleanup PASS. Selection-start mechanics and limits are in the git history of this file.

## Historical kits (issues #95/#108/#149/#154, 1.12.x–1.16.2)

The `native-*`, `regional-*`, `kokoro-*`, `108-*`, `cancel-*`, `alignment-*`, `official-*`,
`providers-*`, `149-*` and `154-*` scripts remain from earlier runs; their tables are on the
issues. Per-script `switchOf()` helpers in the oldest kits filtered by `itemID` while
`voiceSwitch()` indexes by array index — their `switch: null` fields are not evidence.
