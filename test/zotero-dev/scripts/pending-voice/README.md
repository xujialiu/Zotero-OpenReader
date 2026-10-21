# Kit: pending-voice (issue #225)

Case: `test/zotero-dev/cases/pending-voice.md`. A voice picked while reading is
prepared while the old one reads on; the Player shows the new voice at once and
the notice names both voices (two lines); a call-off by anything but a pick
puts the old voice back with a notice of its own.

| script | what it checks | what it expects | params |
| --- | --- | --- | --- |
| `225-01-resume.js` | Baseline on the live #224 fixture: any standing draft committed (next-voice key), reading resumed and advancing, one sentence back, A recorded | `audio.advancing` true, A a `system::` voice, `state.pv225` = {A, speed} | — (reads `state.ep224`) |
| `225-02-pending.js` | Items 1.1 + 2.1 + 1.2: pick B in the voice menu while reading on A | pending: `selected` A, `player.voice` B, `handoff.pending` B, the field reads B, B's row `chosen`; the notice opacity 1 while pending, past five seconds when the sentence lasts; takeover: `selected` B, pending null, notice gone (kind `selected`) | — |
| `225-03-repick.js` | Item 3.1: pick C, then D before C takes over | `player.voice` D at once, `handoff.pending` D, no called-off notice; D takes over | — |
| `225-04-callsoff.js` | Items 3.2 + 3.3: pending called off by the reading voice's own pick, and by a speed change | 3.2: `player.voice` A at once, pending null, no called-off notice; 3.3: "The switch to B was called off." opacity 1 for five seconds, then 0; the recorded session speed is restored | — |

Item 3.4 (a switch that fails: "Could not switch to B. The previous voice is
kept.") is unit-only, `test/read-aloud/engine/voice-pick.test.ts` — a System
voice is too fast to time out live: NOT TESTABLE live.

## Before you start

- Runs AFTER the entry-language-picks kit on the same fixture: it reuses the
  live reader through `state.ep224` (item key, reader index) and records its
  own baseline in `state.pv225`. Cleanup is that kit's `224-99-cleanup.js` and
  `test/zotero-dev/cleanup.md`.
- The AudioContext gate: `notifyUserGestureActivation()` on the reader iframe's
  document before every scripted Play (see the entry-language-picks README).
- The Player frame lives on `frame.contentWindow` (`contentDocument` is null).
- A voice-menu popover left open on the voice button toggles closed on a click:
  use an open popover as it is, click only when none is anchored there.
- The picks need a full sentence ahead: `manager.skipBack('sentence')` first
  (a forward skip from the document's last sentence cannot move).
- State touched: the fixture's session (voice picks, speed 2 in 3.3, restored
  to the recorded session speed inside 225-04; the pref is 224-99's), volume 0
  for the whole run. System voices only.

## Limits

- 2026-10-22, build 1.16.13-beta4 (the notice-wiring fix `notice: (...args) =>
  voiceNotices?.notice(...args)` in `src/index.ts`, proven in the installed
  bundle): the two-line notice RENDERS — items 2.1 and 3.1 PASS. On beta3 the
  toast read only "Preparing voice: B" because the wiring dropped voice-pick's
  fourth `reading` argument (the unit test passes the arguments directly to the
  notices object, so it cannot catch the wiring).
- A pending switch survives ~5 s only when the sentence is long enough: the
  "past five seconds" leg needs `stillPending` true at t+5 s (225-02 records
  it). 2026-10-22 beta4 at the recorded speed 1.45: takeover at 2.91 s, the leg
  vacuous. A supplementary probe (`.tmp/zotero-dev/run-224/pending-past-5s.js`,
  speed 0.5 before the pick, restored after) held the switch pending 6.75 s:
  opacity 1 with the two-line text at t+5 s, gone at the takeover.
- Audio-dependent legs need the machine's output device: on 2026-10-22 it died
  mid-run (~18:22) — fresh sessions come up `audio.state` `suspended` at 0
  (minimized or restored alike, no MEDIASINK error). Every audio-driven check
  of this kit ran BEFORE that with `advancing` true; a later run must re-probe
  first (224-00's probe or 225-01's `audio` step).

## Runs

- 2026-10-22, build 1.16.13-beta3, run `2026-10-22-1.16.13-beta3-pending-voice-2`
  (225-04 PASS; 225-03 evidence) and `-3` (225-01 PASS, 225-02 evidence): the
  table is in the run report of 2026-10-22 (issues #224/#225 verification).
  225-02's menu-toggle fix and 225-01's resume retry are the revisions in this
  kit; both executed in run `-3`. Items 2.1 and 3.1's notice clause FAILED on
  beta3 (one-line notice).
- 2026-10-22, build 1.16.13-beta4, run `2026-10-22-1.16.13-beta4-pending-voice`:
  225-01, 225-02, 225-03, 225-04 all PASS. Item 2.1: `Reading voice: Daniel
  (English (UK))\nPreparing voice: Eddy (English (UK))`, opacity 1, `pre-line`,
  at 38 ms pending, field reads B, B's row the chosen one; takeover 2.91 s,
  notice gone (kind `selected`). Item 3.1: `Reading voice: Eddy…\nPreparing
  voice: Grandma…`, no called-off notice (`calledOffSeen` false), D took over.
  3.2/3.3: `player.voice` A at once, pending null, no called-off notice; the
  speed call-off notice 5 s then opacity 0; session speed restored (1.45).
