# Scripts: voice switching (issues #95, #108, #149, #154, #163)

[Case](../../cases/voice-switch.md) · [Checklist index](../../README.md) · [Runner](../_shared/README.md)

## Issue #163 kit (added 2026-10-01)

State: private `Zotero.__ztts163` (`baseline`, `fixtures`, `voiceA/voiceB`,
`voiceX`, `hold {armed, ms, mode, voice}`, `holdVoice`, `fixtureItemID`).
Fixtures: fresh-prose PDFs under `.tmp/zotero-dev/163-fixture/`
(`fixture-163c.pdf` … `163k.pdf`, every sentence carries a unique marker so no
text is shared between variants), passed per run via
`params.fixture163` / `params.fixture163Alt`.

| Script | Checks | Expected | Params/state |
| --- | --- | --- | --- |
| `163-00-baseline-and-isolate.js` | Private baseline and dedicated test-WebDAV isolation before install | Destination matches; transports idle; no OpenReader Position; host minimized; position rows recorded | private `__ztts163` |
| `163-01-mute-import-open-seed.js` | Mute, prefetch 8, import the run fixture, open player paused on a free local pair, favorites-only | Engine session paused on a `local::af_` voice; cycle list [af_alloy, af_bella]; 27 segments | `params.fixture163`; erases the previous attempt's fixture first |
| `163-02-identity-and-audio-probe.js` | Item 1 identity + audio device probe | `mechanism engine-handoff-v2`; previous `Shift+,`, next `Shift+.`; `controlsAttached` true per reader; startup has the Engine + voice switching, failed []; audio running, playbackTime advances | — |
| `163-03-reading-on-waits.js` | Item 14 reading-on: pick B held 20 s while A reads on | `pending` B, `oldRequests` 0; `store.requests` flat; at the first dry sentence `stage waiting`, `waitedAt`, `lookups` up, Preparing…; commit `last {kind sentence, index waitedAt, offset 0}`, notice `selected`, `oldRequests` 0, zero A fetches after the pick | fresh fixture per attempt (the cache warms both voices) |
| `163-04-skip-past-readahead.js` | Item 14 skip to a sentence A lacks: Shift+→ presses; the player's "Skip to Next Sentence" button | Landing dry: `stage waiting`, `waitedAt` = landing, no A request, switch neither taken nor cancelled; commit `sentence` at the landing from 0; notice `selected`; `xFetches` 0 | `fixture163` + `fixture163Alt` (one cold fixture per variant) |
| `163-05-jump-keeps-switch.js` | Item 14 jump: `repositionTo` on the active session past the stock | `stats.started` +1, no `cancelled`, `pending` kept, landing rule (word or sentence commit, notice `selected`), `oldRequests` 0, `fallbacks` 0 | fresh fixture; NO selection target (it clearSegments-cancels) |
| `163-06-skip-to-held-sentence.js` | Item 14 skip to a sentence A has: `←` once, B held 3.5 s | A reads the landing from 0, player shows X, switch kept; B takes over within it (`last.kind word`) or later; notice `selected`; `oldRequests` 0; no A fetch | warm fixture OK (A must HAVE the landing) |
| `163-07-failure-while-waiting.js` | Item 14 failure while waiting: the wrapper flips to fail at the wait | `stage failed`, notice `failed`, pending null; A asks once for the waited sentence (`requests` +1 at the failure, before read-ahead resumes) and reads it; `fallbacks` 0; the report's `oldRequests` freezes at 0 (finish time) | fresh fixture |
| `163-08-speed-while-waiting.js` | Item 14 speed change while waiting | `stage cancelled`, notice `cancelled`, pending null, speed applied; A asks once and reads the waited sentence at the new speed; `fallbacks` 0 | fresh fixture |
| `163-09-prepared-reuse-paused.js` | Item 14 both-have-it (paused prepared reuse) | Paused pick at a STARTED sentence; `prepared` holds position+1; ArrowRight does not commit (player shows X, notice `ready`); Play reads it in B from 0, no second request, `oldRequests` 0 | warm fixture; pause only after `currentIndex === position` |
| `163-10-paused-skip-ready.js` | Item 14 paused skip: pause, pick, `←` | Nothing selected at the key (player shows X); notice `ready` once B holds the landing; Play reads it in B from offset 0; `oldRequests` 0 | warm fixture OK |
| `163-99-cleanup-and-restore.js` | Fixtures out, prefs byte-identical, WebDAV restored, host minimized | Erased rows back to baseline; memory/native voices/favorites equal baseline; volume restored; deletes `__ztts163` on success | private baseline |

Before you start: bridge up; `163-00` before installing; install the xpi,
`zotero_plugin_list` = manifest `-betaN`, `diagnostics.startup()` all ok; then
`163-01`, `163-02`, the behavior rows (one fresh fixture per attempt that needs
a dry sentence or a genuinely-held request), `163-99`. Trusted keys via
`nsITextInputProcessor` on `reader._iframeWindow`; the hold wrapper wraps
`Components.utils.getGlobalForObject(Zotero.ZoteroTTS.startup).fetch` and must
match the provider body's voice WITHOUT the `local::` prefix; its `mode` is read
at fire time so a flip hits in-flight requests.

Limits and notes (2026-10-01 run):

- The plugin's in-memory audio cache is text-keyed and process-lifetime: every
  sentence both pair voices touch is held forever and `held` lookups answer from
  it. Any row needing a dry sentence or a holdable request therefore imports a
  fixture whose sentences no variant shares; within a fixture, one attempt only.
- A fresh reader may open on Zotero's native per-language map voice (here a Fish
  voice) and never auto-activate (reader.js 83876 needs `selectedVoiceID`); the
  seed selects a local voice explicitly. The segment store is lazy: open the
  popup once to materialize segments. `repositionTo` unpauses; a paused pick
  before the landed sentence STARTED (currentIndex null) never prepares ahead.
- The case's Shift+Space jump driver is, on an active session, the plugin's
  play/pause toggle (read-aloud-shortcuts.ts `smartPlay`); the jump is
  `manager.repositionTo` (engine jump path). A registered selection target makes
  the unpausing restart call `clearSegments` (reader.js 83882-83887), a
  cancelling call — the switch is then cancelled by design.
- `voiceSwitch().oldRequests` freezes at `finish()`: on failure/cancel it reads 0
  forever; A's one new request shows in `engine().store.requests` (+1 before the
  read-ahead's +3). The case's `oldRequests: 1` on those rows should read 0
  (report) / +1 (store) — for the main session to correct.
- One transient `Cannot reach Kokoro at https://h200-kokoro.xujialiu.top`
  network error at 04:20:38 during the run; the affected row recovered and
  passed. No `[zotero-tts]` error spam, no dead objects.

## Issue #154 kit (2026-09-28; superseded for item 14 by the #163 kit, kept as the record)

Scripts `154-00` … `154-99` verified the #154 behavior (every skip takes the
pending switch): 00/01/02, 03 (←), 04 (Shift+←, →, Shift+→), 05 (player button),
06 (prepared reuse, paused), 07 (paused × 2), 08 (speed cancel), 09 (ordinary
control), 99 cleanup — all PASS on 1.16.2-beta; [table](https://github.com/xujialiu/Zotero-TTS/issues/154#issuecomment-5865908183).
Notes that still apply: favorites + favoritesOnly shape the cycle list only
after a popup cycle; a script-started play needs the reader iframe's
`notifyUserGestureActivation()`; a committed switch persists its voice into the
native per-language map, so a later popup reopen may start on the other pair
member (scripts treat the observed voice as X and pick the other); on cancel,
`voiceSwitch()` keeps the previous `last`, only `pending` clears.

## Runs

| Run | Build | Result |
| --- | --- | --- |
| 2026-09-26 | 1.15.2-beta5 | #149: startup, four UI recoveries, ordinary handoff, cleanup PASS; [table](https://github.com/xujialiu/Zotero-TTS/issues/149#issuecomment-5845582557) |
| 2026-09-28 | 1.16.2-beta (xpi `c8a1c103…`, commit fcfa451) | #154: all rows PASS; [table](https://github.com/xujialiu/Zotero-TTS/issues/154#issuecomment-5865908183). Cleanup rows 86→86, WebDAV restored, host minimized. Human checks open: whether any old-voice sound slips out after the key; perceived quality |
| 2026-10-01 | 1.16.3-beta6 (xpi/bundle sha256 `564d6e82…` verified, commit 05b4a15) | #163: 00, 01 (seed), 02 identity PASS; item 14: reading-on (163-03, PASS ×2, waitedAt 17/16, commit sentence offset 0, oldRequests 0, store flat, zero A fetches), skip-past-readahead (163-04 PASS both variants, waitedAt 22/14), jump (163-05, switch kept, started +1, word commit at the landing), skip-to-held (163-06 PASS, word commit in the landing at 5.16 s), failure (163-07 PASS, +1 request then A reads), speed (163-08 PASS, cancelled + A reads at 1.95×), prepared reuse (163-09 PASS), paused skip (163-10 PASS); prefetch stop line `prefetch: local: stopped, the voice is switching` in the debug output; 99 cleanup PASS (rows 71→71, prefs byte-identical, WebDAV restored, host minimized). Human checks open: whether any old-voice sound slips out after the pick; perceived handoff quality |

## Historical kits (issues #95/#108/#149, 1.12.x–1.15.x)

The `native-*`, `regional-*`, `kokoro-*`, `108-*`, `cancel-*`, `alignment-*`,
`official-*`, `providers-*`, and `149-*` scripts remain from earlier runs; the
#149 beta5 set (2026-09-26) measured the four recovery variants and the ordinary
Fish handoff. Per-script `switchOf()` helpers in those kits filtered by `itemID`
while `voiceSwitch()` indexes by array index: their `switch: null` fields are
not evidence. Older run order and preparation are in repository history; the
linked issue comments hold their tables.
