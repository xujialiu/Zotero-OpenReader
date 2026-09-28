# Scripts: voice switching (issues #95, #108, #149, #154)

[Case](../../cases/voice-switch.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

## Issue #154 kit (added 2026-09-28)

| Script | Checks | Expected | Params/state |
| --- | --- | --- | --- |
| `154-00-baseline-and-isolate.js` | Private baseline and dedicated test-WebDAV isolation before install | Destination matches; transports idle; no OpenReader Position; host minimized; position rows recorded | private `Zotero.__ztts154`, `hold` config |
| `154-01-mute-import-open-seed.js` | Mute, import fixture-a.pdf, open player paused on a free voice, pick the Shift+. pair, favorites-only | Engine session voice A paused; cycle list exactly [A, B] | `fixturesDir`; private fixtures |
| `154-02-postinstall-probe.js` | Installed version, adjacency, audio device probe | 1.16.2-beta; `audio.state` `running`, playbackTime advances; iframe `notifyUserGestureActivation()` before play | private state |
| `154-03-skip-left-commits.js` | Held pick with Shift+., then trusted ←: skip commits the switch | At once: voice B, `handoff: null`, playing false, `skipPending: true`, `carriedOn` +1, started flat, `last.kind: "skip"` with from/to; B reads the previous sentence from offset 0; notice `selected`; only B sampled after the key | keys via `nsITextInputProcessor` on the reader iframe |
| `154-04-skip-variants.js` | Shift+←, →, Shift+→: each takes the pending switch | Same immediate pattern; landing = sentence rule from the position at key time; notice `selected` | per-variant reset |
| `154-05-player-skip-button.js` | The player's "Skip to Previous Sentence" button takes the pending switch | Same pattern (button click → manager skipBack shadow) | popup open |
| `154-06-prepared-reuse.js` | Prepared audio reused: paused pick (armWord stands down while paused), wait `handoff.prepared` holds position+1, →, Play | Commit at once; zero fetches after the key (wrapper log, text-matched); Play reads the prepared sentence from offset 0 with no refetch | wrapper logs request text |
| `154-07-paused-skip.js` | Paused: pick, ←: commit with `notice: "selected"` at once, no request before Play, Play from offset 0. Variant "lands-on-paused-in" pins sentence 0 mid-clip | `skipPending` then silent debounce; Play fetches the unprepared sentence and starts it fresh (pt < 1 s) | two variants |
| `154-08-speed-cancel.js` | A speed change during a pending switch still cancels | `stage: "cancelled"`, `pending: null`, notice `cancelled` (`last` keeps the previous boundary); old voice reads on; stats flat | |
| `154-09-ordinary-handoff.js` | Control: playing switch with no skip still hands over through the Handoff | `last.kind` word or sentence (`wordDecision` recorded), `carriedOn` +1, started flat, notice `selected` | no hold |
| `154-99-cleanup-and-restore.js` | Fixtures out, prefs byte-identical, WebDAV restored, host minimized | Erased rows back to baseline; memory/readAloudVoices/favorites equal baseline; switches restored last but memory | deletes `__ztts154` on success |

Before you start: bridge up; `154-00` before installing; install the xpi, `zotero_plugin_list` = manifest `-betaN`, `diagnostics.startup()` all ok; then `154-01`, `154-02`, the behavior scripts, `154-99`. State lives in `Zotero.__ztts154` (`baseline`, `fixtures`, `voiceA/voiceB`, `hold`); results under `.tmp/zotero-dev/<runId>/`.

Limits and notes (2026-09-28 run):

- The local (Kokoro) tier was disabled on this profile; the run enabled
  `local.enabled` (configured provider, restore covered by the baseline) and used
  the pair `local::af_bella` / `local::af_alloy` (the configured h200-kokoro
  server, free). Fish free voices were the fallback.
- Favorites + favoritesOnly shape the cycle list only after a popup cycle; the
  seed polls and rebuilds once. Voice entries carry their language in
  `language` (not `lang`).
- A script-started play/resume needs the reader iframe's
  `notifyUserGestureActivation()` (autoplay gate): without it the session says
  `playing` while `audio.state` stays `suspended` and playbackTime freezes.
  The seed resets pin sentence 1 (pause, `repositionTo`, play) because the
  persisted reading position resumes wherever the last run left it.
- The committed switch persists its voice into Zotero's native per-language
  map, so a later popup reopen may start on the OTHER pair member; the scripts
  therefore treat the observed session voice as the old voice X and B as the
  pair's other member.
- Playing picks with two word-timed Kokoro voices arm a word cut
  (`wordDecision: "shared-word-boundary"`) and never fill `prepared` ahead, so
  the prepared-reuse row runs paused, where `armWord()` stands down and
  `prepared` fills. Read-ahead inflates `store.requests` after Play: the reuse
  check text-matches the fetch log instead.
- On cancel, `voiceSwitch()` keeps the previous switch's `last`; only
  `pending` clears and `stage`/`notice` become `cancelled`.

## Runs

| Run | Build | Result |
| --- | --- | --- |
| 2026-09-26 | 1.15.2-beta5 | #149: startup, four UI recoveries, ordinary handoff, cleanup PASS; [table](https://github.com/xujialiu/Zotero-TTS/issues/149#issuecomment-5845582557) |
| 2026-09-28 | 1.16.2-beta (xpi `c8a1c103…`, bundle 4× `commitNow\|adoptVoice`, commit fcfa451) | #154: 00/01/02, 03 (←), 04 (Shift+←, →, Shift+→), 05 (player button), 06 (prepared reuse, paused), 07 (paused × 2), 08 (speed cancel), 09 (ordinary control), 99 cleanup all PASS; [table](https://github.com/xujialiu/Zotero-TTS/issues/154#issuecomment-5865908183). Cleanup: rows 86→86, memory/native voices/favorites byte-identical, WebDAV restored, host minimized. Human checks open: whether any old-voice sound slips out after the key; perceived voice quality. |

## Historical kits (issues #95/#108/#149, 1.12.x–1.15.x)

The `native-*`, `regional-*`, `kokoro-*`, `108-*`, `cancel-*`, `alignment-*`,
`official-*`, `providers-*`, and `149-*` scripts remain from earlier runs; the
#149 beta5 set (2026-09-26) measured the four recovery variants and the
ordinary Fish handoff — Albert/Ava/Samantha rebuilds paused at segment 2, zero
pre-Play requests, `notice: "selected"`, `recoveries` counting only UI
recoveries, cleanup with rows 85 (baseline not captured), one diagnostic-only
dead object at `zotero-tts.js:18117` before stale-wrapper pruning. Per-script
`switchOf()` helpers filtered by `itemID` while `voiceSwitch()` indexes by
array index: their `switch: null` fields are not evidence. Older run order and
preparation are in repository history; the linked issue comments hold their
tables.

The #149 set, in its run order (after `149-01`/`149-02`, the player seed was a
manual foreground step):

| Script | Checks | Expected | Params/state |
| --- | --- | --- | --- |
| `149-00-baseline-and-isolate.js` | Private baseline and dedicated WebDAV isolation | Destination matches; transports idle; OpenReader Position absent; host minimized | private `Zotero.__ztts149` |
| `149-01-mute-and-import-fixtures.js` | Mute, suspend writes, import PDF/EPUB | Volume 0; two disposable items; sync switches false | `fixturesDir`; private fixtures |
| `149-02-open-fixtures.js` | Open both fixture readers | Managers exist; owner session untouched | private fixture state |
| `149-06-destroy-and-clear-selection.js` | Ended-session precondition at segment 2 | Active manager, null selection, no controller, Engine `ended:true` | seeded PDF player |
| `149-07-open-provider-menu.js` | Actual provider picker | Fish Audio and System rows | seeded PDF player |
| `149-08-system-voice-recovery.js` | Albert recovery and Play | Paused controller at segment 2; zero pre-Play requests; target audio after Play | PDF player |
| `149-09b-finish-live-handoff.js` | Ordinary playing Fish handoff | `carriedOn` increases; same segment; no recovery | playing PDF session |
| `149-10-stale-unpaused-samantha.js` | Direct stale-unpaused mechanism | Samantha rebuilds paused at segment 2 with no pre-Play requests | PDF fixture; diagnostic count not graded |
| `149-11-stale-ui-ava.js` | Stale-unpaused player row | Ava rebuilds paused at segment 2; no pre-Play requests | PDF player |
| `149-12-same-voice-retained-ava.js` | Retained-ID same-voice row | Same Ava pick rebuilds paused at segment 2 | PDF player |
| `149-13-stale-ui-samantha.js` | Stale-unpaused Samantha row | Samantha rebuilds paused at segment 2; no pre-Play requests | PDF player |
| `149-99-cleanup-and-restore.js` | Fixture, records, transports, prefs, host teardown | Fixtures gone; exact named state restored; host minimized | private baseline |
