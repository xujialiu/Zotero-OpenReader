# Scripts: A Zotero voice's time left in the player, and its used-up and daily-limit alerts (issue #140)

[Case](../../cases/zotero-time-left.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'zotero-time-left'`), on a
build the zotero-credits kit has already isolated (its `00` WebDAV run
opener) and turned both Zotero tier switches ON for; this kit's `90` runs
BEFORE the credits kit's `99` (the run closer). No params beyond the opener's
`fixtureTitle`. State: the run global `Zotero.__zttsTimeLeft140`, which `t0`
creates and `90` removes only after a fully successful restore. **Never run
`t0` while `Zotero.__zttsTimeLeft140.baseline` exists.** No real Zotero audio
anywhere: items 4-6 play only through the wrapped `getAPIClient`, items 1-3
open the player without playing Zotero audio (the session itself starts on
the memory's plugin voice, muted, and is paused at once).

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `t0-open-and-snapshot.js` | Run opener, ONCE per run: the brief's Intl.DurationFormat probe (zh-CN `1小时54分钟`, en-US `1h 54m` for 1 h 54 min), typed snapshot of EVERY `zotero-tts.readAloud.*` pref + `reader.readAloudVoices` + both tier switches (memory/readAloudVoices by length in the report), volume 0, Premium ON, fixture-a imported+opened in the selected tab, host restored (bounds recorded), the plugin player opened and PAUSED AT ONCE, then driven to Zotero Premium / en-US / `Premium Voice 1` while paused | probe exact; `premiumOn`; `openedAndPaused`; session voice `::`-bearing; after the picks `provider: "premium"`, `locale: "en-US"`, alert null, manager active+paused | `fixtureTitle` |
| `01-voice-button-time.js` | Item 1: the snapshot (pluginPlayer inspect) + the voice button | every Zotero row (no `::`) carries `time`+`low`, plugin rows neither; alert null; the selected voice's `time` = its own `minutesRemaining` ceil'd via Intl (e.g. `26m` for 260 credits at 10/min, `low: false`); `Premium Voice 5` (30/min) reads the dearest figure (e.g. `9m`); in the frame `.time-left` shown, text equal, AFTER `.value`, right edge 6 px (±0.5) left of `.chevron`, title `Voice: Premium Voice 1 · <time>`; account figure cross-checked with `zoteroTiers()` | — |
| `02-voice-list-rows.js` | Item 2: the voice picker's rows | the picker opens on the voice button's click; every Zotero row `.option.has-time` with `.option-label` + `.time-left`; `.time-left` right edges equal within 0.5 px; every row's time text = the snapshot's; no-time rows (a plugin voice, if listed) have no `.time-left`; the picker closes on the second click | — |
| `03-low-time.js` | Item 3: low | keeps the voice's provider `premiumCreditsRemaining`, sets 25 → within ~1 s `Premium Voice 1` `3m` low (2.5 ceil), `Premium Voice 5` `1m` low, frame `.time-left` `3m` + `.low` + `rgb(216, 68, 68)`; figure back → item 1's times and gray return | — |
| `04-used-up.js` | Item 4: used up | installs the `getAPIClient` wrap (mutable answer in state) + the `launchURL` recorder; play → within 2 s the status popover opens BY ITSELF: message `The time left on Zotero Premium is used up.`, `.buy-time` `Add more time`, no `.retry`, voice `0m` low, alert `{ kind: 'time-used-up', buy: true }`; Add more time closes it and records ONE `launchURL` call with `https://www.zotero.org/settings/readaloud`; play again → it opens by itself again | — |
| `05-daily-limit.js` | Item 5: daily limit | the same wrap answering `daily-limit-exceeded`; play → the popover opens by itself with `You have reached today's limit for the Zotero voices. Try again tomorrow, or choose another voice.`, no `.buy-time`, no `.retry`; voice time unchanged (item 1's); no launchURL call | — |
| `06-other-error.js` | Item 6: every other error | answer `network`; play → NO popover; the `!` shows (alert null, error the playback message); clicking it → `Playback failed. Check your provider connection and try again.` + `Retry`, no `.buy-time` | — |
| `90-cleanup.js` | Run closer (before the credits kit's `99`): getAPIClient + launchURL restored (identity), the kept provider figure back, the player closed (`toggleReadAloudPopup(false)` only), the fixture tab closed, the item erased, position rows back to the opener's count, `reader.readAloudVoices` restored FIRST (tabs idle), then every snapshotted pref typed byte-identical with `readAloud.memory` LAST, transports settled (the WebDAV isolation stays for the credits `99`), host left minimized | every `restored[…].matches: true`; `getAPIClientRestored`, `launchURLRestored`, `transportsSettled`, `runStateRemoved` all true; status `PASS` | — |

## Before you start

- The credits kit's `00` (Test WebDAV first) must already have run in this
  Zotero process, and its `02` must have turned both tier switches ON; the
  owner players on Zotero's Premium tier are closed BEFORE this kit if the
  reading guard needs it (noted per tab, never reopened).
- The owner players are never pressed; the fixture's session starts on the
  memory voice (checked `::`-bearing before anything opens) and is muted.
- State touched, all restored by `90` from `Zotero.__zttsTimeLeft140.baseline`:
  every `readAloud.*` pref, `reader.readAloudVoices`, the voice's provider
  figure, `getAPIClient`, `launchURL`, the fixture item/tab/player and the
  position rows. The tier switches go back to THIS kit's snapshot; the
  credits kit's `99` does the run's final restore. Nothing is written to
  Zotero's account; no audio is fetched from Zotero.
- The expected figures (26m/9m/3m/1m/34d 17h 20m) are the owner's 260 Premium
  credits of 2026-09-29; every script computes them from the live provider
  figure, so a moved account figure cannot fail a row.

## Limits

- **The engine replays a failed segment's error without refetching**
  (`src/core/engine/session.ts` speak(): `failed.has(index)` → handleError),
  so a plain play on a failed sentence never reaches the client again. Each
  case's fetch is reached by clearing the manager's stored error
  (`waiveXrays(m)._error = null` + `_stateChanged()`, the fixture reset that
  stands for the error's cause going away) and stepping to the NEXT sentence
  (the player's own `navigate nextSentence`), whose audio is not cached.
- **The stub answers after 400 ms** — the spacing of a real 402 round trip.
  With an INSTANT answer the manager's error-free window (measured 35 ms)
  is shorter than the player's 250 ms tick, and a popover closed between two
  errors never reopens; measured live before the delay was added.
- **A session's first play after opening can lag several seconds**
  (measured 4.6 s: the session was started minimized, its AudioContext
  blocked — 'the new voice audio output is blocked' — and the surfacing
  delayed once by >5 s on item 6's first attempt). The window is restored
  for the player work; every measured popover latency below is from the
  settled session.
- **The first two `04` attempts failed and left the state behind twice**;
  both were fully cleaned ad hoc (player closed, tab closed, item erased,
  position rows 69 → 69, prefs byte-identical) before the passing third
  run. Cause 1: the pause after opening was not confirmed before the
  provider pick (fixed: `t0` retries the pause and re-pauses around every
  pick). Cause 2: the pick was sent before the Zotero tiers reached the
  manager's tier list — the fresh fish session's `m.tiers` held only
  `['fish']` until the activation voice load finished, and the command threw
  unavailable-choice (fixed: `t0` waits for each choice to be listed before
  sending it).
- **The opening session's voice is the memory's** (`::`-bearing, checked
  before anything opens); its audio was blocked (muted, minimized) and the
  fixture session was paused before any Zotero voice was picked, so no
  Zotero audio ever played and no Zotero credits were spent.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-29 | 1.16.3-beta4 (dd5f2b8), Zotero 10.0.3-beta.3+80bc5565e | this run's reply | Intl probe PASS (`zh-CN` `1小时54分钟`, `en-US` `1h 54m` in chrome); t0 PASS (26 prefs snapshotted, Premium ON, player opened+paused on the fish memory voice, picks → Zotero Premium / en-US / `Premium Voice 1`, alert null); 1 PASS (13 Zotero rows all `time`+`low`, plugin rows none, alert null; `26m`/`9m` at 259 credits; order value<time<chevron, gap exactly 6 px, title `Voice: Premium Voice 1 · 26m`); 2 PASS (13/13 has-time, right edges spread 0 px, texts = snapshot, picker closes); 3 PASS (25 → `3m`/`1m` low at 235 ms, red `rgb(216, 68, 68)`, figure back → 26m/9m gray at 344 ms); 4 PASS (popover by itself at 653 ms, message/buy/no-retry/0m low/alert exact, launchURL once with the readaloud URL, reopen by itself at 65 ms); 5 PASS (by itself at 571 ms, message exact, no buy, no retry, time 26m unchanged, no launchURL); 6 PASS (no popover, `!` shows, click → playback message + Retry, no buy) — then `90` PASS | Ran under the credits kit's isolation; the owner's two premium players were closed before the credits kit's item 4 (the reading guard) and stayed closed; figure 259 premium / 114 standard; cleanup byte-identical (the `itemErased: false` flag in `90`'s output was a stale cache read — the search finds no fixture item and the position rows are back at 69) |
