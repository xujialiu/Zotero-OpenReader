# Scripts: voice switching (issues #95, #108, #149, #154, #163, #194, #196, #226)

[Case](../../cases/voice-switch.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

## Issue #226 kit (added 2026-10-22)

Item 17, "The sentence after the takeover". Voices: two Fish Audio voices of the
profile's configured FREE model (`fish.model` `s2.1-pro-free`, never switched;
authorized by the owner within its free allowance) — A `fish::en/9fa4b7a1b67446b48208f2f5d4bcd8da`
("Dax"), B `fish::en/029f407da0914eab9469a0edbc23efa8` ("Aubrey"), both tagged
`en-US`. Both must be tagged like the document: the Player's Shift+. cycle filters
by language, and a generic-`en` voice is not offered for an en-US document (one
pick was a consumed no-op on a singleton cycle — the 13:05 failure).
`favoritesOnly` on with `favoriteVoices` [A, B] **before the first popup open of
every fresh fixture**: the catalog collapses to the favorites, and a memory voice
outside them is substituted by the fish Local voice (the 12:39/12:45 failures).
Fresh-prose PDFs per pick under `.tmp/zotero-dev/226-fixture/` (`226-p1a…p2c.pdf`,
12 sentences of ~23 words, each ≥ 2 s read, no text reused across picks — the
audio cache is text-keyed for the process life), passed as `params.fixture226.<key>`.

| Script | Checks | Expected | Params/state |
| --- | --- | --- | --- |
| `226-00-configure-and-snapshot.js` | Mute, sameForAllDocuments off, pane defaults (Custom on, 5 ahead, 2 at once), favoritesOnly on; folder confirmed off | volume 0; pref values with user flags in `__ztts226.prefSnapshot` | `Zotero.__ztts226` |
| `226-01-fixture-and-player-seed.js` | Fresh fixture in, favorites [A,B] written pre-popup, seed A paused, audio-device probe | 12 segments; `audio.state` running, playbackTime moves; sentence 0 ≥ 2 s | `params.fixture226.p1a` |
| `226-10-pass1-pick1-a2b.js` | Item 17 pass 1 (requests 2): trusted Shift+. half a second into the pin sentence, 25 ms polling of `voiceSwitch()`+`engine()` until three sentences past the takeover | mechanism v4; `atOnce` 2; `slowestMs` > 0; first two `audioReady` = {pin, pin+1}; `last` word\|sentence, notice `selected`; no `shown` growth after `last`; `prefetch.from` > `last.index`, `open` ≤ 2 | `params.fixture226.p1a/p1b/p1c`; `__ztts226.voiceA/voiceB` |
| `226-19-set-requests-1.js` | Requests at once 1 | pref reads back; folder false | — |
| `226-20-pass2-pick1-a2b.js` | Pass 2 at requests 1: the same rows with `atOnce` 1, still no "Preparing…" after the takeover | as above with `atOnce` 1 | `params.fixture226.p2a/p2b/p2c` |
| `226-99-cleanup-and-restore.js` | Fixtures out, prefs byte-identical (user flags honored; memory LAST), WebDAV folder switch back, debug store back, host minimized | rows at baseline; folder matches snapshot | `Zotero.__ztts226` |

Runs:

- **2026-10-22, 1.16.14-beta2** (Zotero 11.0-beta.1, macOS): build proven at
  install and again per chunk after the appearance worktree's 1.16.14-beta
  replaced it mid-run (reinstalled; startup 28 steps ok, `failed` [], mechanism
  `engine-handoff-v4`). Item 17: defaults pass A→B **PASS** on all ten rows
  (pending 11 ms, `atOnce` 2, `slowestMs` 4462, first two ready {2,3}, `last`
  sentence@5 offset 0 notice selected, `shown` 0 through three past,
  `prefetch.from` 6 > 5, `open` max 2); requests-1 repeat A→B **PASS** (`atOnce`
  1, `slowestMs` 3711, first two {2,3}, `last` sentence@4, no "Preparing…"
  after the takeover; the pre-takeover wait showed the banner, `shown` 3). B→A
  and the second/third picks per pass NOT REACHED (the run's 90-minute bound).
  A later pick is a copy of `226-10` / `226-20` with only its `SPEC` line
  changed (`key` p1b/p1c/p2b/p2c, `readVoice`/`pickVoice` swapped for B→A);
  the prepared copies never ran and were not kept. Both takeovers were
  sentence-kind: with Fish's ~3.7–4.5 s answers the gate held the cut at a
  word, `wordDecision: 'next-sentence-late'` in the saved trace at 4252 ms
  (pass 1, 0.8 s into sentence 3) and 7453 ms (pass 2, 4.5 s into sentence
  3), and the new voice took over at a sentence start. A cut at a word that
  passes the gate was not observed live; it is unit-tested in
  `test/core/engine/handoff-next-sentence.test.ts`.

Limits:

- The appearance worktree (issue #227) drove this Zotero during the run and
  left its fixture tab open (item 24933, "ztts 2026-10-22 #227", paused session
  on Samantha): left open, untouched.
- `compatible: listing voices failed: Cannot reach http://127.0.0.1:8765` on
  every voice-list rebuild — the profile's OpenAI Compatible section points at
  the #194 stub server, which is not running. Not a #226 regression.
- `226-01` as kept pairs A with B `fish::en/933563…` ("Sarah"), tagged generic
  `en`, which is not in an en-US document's cycle: the passing picks ran after
  a one-off call re-paired B to Aubrey (`fish::en/029f40…`, en-US), not in the
  script. The next run picks B in `226-01` among the voices tagged like the
  document, and records that it ran. Its voice-inventory block still says
  "System" from an earlier draft; the filter is `fish::`.
- Kokoro (`local.baseURL` https://h200-kokoro.xujialiu.top) answers 403 behind
  Cloudflare Access (the configured headers hold only a client id, no secret);
  macOS System voices list fine but are sentence-only (`wordTimestamps: false`),
  so they exercise only the sentence-start path.

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
