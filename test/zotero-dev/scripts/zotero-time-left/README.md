# Scripts: A Zotero voice's time left in the player, and a tier switched off when it runs out (issue #140)

[Case](../../cases/zotero-time-left.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'zotero-time-left'`), on a
build the zotero-credits kit has already isolated (its `00` WebDAV run
opener); this kit's `90` runs BEFORE the credits kit's `99` (the run closer).
No params beyond the opener's `fixtureTitle`. State: the run global
`Zotero.__zttsTimeLeft140`, which `t0` creates and `90` removes only after a
fully successful restore. **Never run `t0` while
`Zotero.__zttsTimeLeft140.baseline` exists.** No real Zotero audio anywhere:
item 4's no-request path is proved by counting `getReadAloudAudio()` (0),
items 5-7 answer through the wrapped `getAPIClient`, item 8's switch fetch is
short-circuited by the voice's own 0 figure; the third tab (and item 8's
session) reads with a FREE plugin voice (System voices — 04 enables
`system.enabled`, 90 restores it), never a paid provider.

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `t0-open-and-snapshot.js` | Run opener, ONCE per run: the two time forms measured in chrome (Intl narrow `zh-CN` `1小时54分钟`, `en-US` `1h 54m` — what the plugin stopped using; the plugin's OWN form `1h 54min`, the expectations' formatter), typed snapshot of EVERY `zotero-tts.readAloud.*` pref + `reader.readAloudVoices` + both tier switches + `system.enabled`, volume 0, Premium ON, fixture-a imported+opened in the selected tab, host restored (bounds recorded), the plugin player opened and PAUSED AT ONCE (the memory voice must be `::`-bearing), then driven to Zotero Premium / en-US / `Premium Voice 1` while paused; the player's `alert` field is GONE (beta5) | probe exact; `premiumOn`; `openedAndPaused`; picks → provider `premium`, locale `en-US`, `Premium Voice 1`, `time: '26min'`, `alertFieldPresent: false`; manager active+paused | `fixtureTitle` |
| `01-voice-button-time.js` | Item 1: the snapshot + the voice button | every Zotero row (no `::`) carries `time`+`low` (13/13), plugin rows neither; the selected voice `26min` = its own `minutesRemaining` ceil'd via the plugin form, `low: false`; `Premium Voice 5` (30/min) `9min`; in the frame `.time-left` shown, same text, AFTER `.value`, right edge 6 px (±0.5) left of `.chevron`, title `Voice: Premium Voice 1 · 26min`; account figure cross-checked with `zoteroTiers()` | — |
| `02-voice-list-rows.js` | Item 2: the voice picker's rows | every Zotero row `.option.has-time` with `.option-label` + `.time-left`; right edges equal (spread 0 px); each text the snapshot's; the picker closes on the second click | — |
| `03-low-time.js` | Item 3: low | the provider figure set to 25 → within ~1 s `Premium Voice 1` `3min` low, `Premium Voice 5` `1min` low, red `rgb(216, 68, 68)`; figure back → `26min`/`9min` gray (the item 1 color) at ~240 ms | — |
| `04-used-up.js` | Item 4 (replaced): sets up fixture B (second tab, paused on Premium Voice 1) and a third tab (fixtureTitle + ' C') whose player is paused on a System voice (`system.enabled` on), zeroes A's provider figure (the voice's own `minutesRemaining` follows, verified 0), installs the `getAPIClient` wrap (credits `{114, 0}` mutable via `S.creditsAnswer`; `getReadAloudAudio` answers after 400 ms and COUNTS), stubs `launchURL`; PLAY → reminder ≤3 s | `getReadAloudAudio` called **0** times (the usedUp short-circuit never asks); A's and B's players CLOSED, C's open (poll — the closes land one tick after the reminder); `zotero-premium.enabled` false; `#ztts-zotero-reminder` in A with the used-up text + `Reading also stopped in 1 other tab.`, `Add more time` + ✕ (`aria-label` `Close`); `zoteroRefusals()` → `last { code: 'quota-exceeded', tier: 'premium', credits: 0, minutes: 0, action: 'used-up', closed: 2 }`; Add more time → ONE `launchURL` with `https://www.zotero.org/settings/readaloud`, the reminder stays; ✕ → gone; Settings → Premium: `Enable`, `Remaining time: 0min` red with link | — |
| `05-short.js` | Item 5 (new): REINSTALLS the wrap with the live-reading closures (04's installed wrap predates the `S.creditsAnswer` patch), Premium on, the provider figure back (a 0 figure would short-circuit — the stub must be ASKED), A's player closed and REOPENED (settle 800 ms → activate → click, again if it folds — the reopen folds without fresh document activation), paused, next sentence, play | the fetch made (calls ≥ 1); NOTHING closed or switched off; the reminder with the short text + link, NO other-tabs line; the ! shown (poll — it paints on the 250 ms tick), CLICKED: `Not enough remaining time on Zotero Premium for this voice.` + Retry, no `.buy-time`; `last { code: 'quota-exceeded', credits: 20, minutes: 25.9, action: 'short', closed: 0 }`; player open, pref true | — |
| `06-daily-limit.js` | Item 6 (replaced): closes the reminder + player, reopens (05's sequence), the wrap answering `daily-limit-exceeded` with credits above 0, rewinds to sentence 0 and picks `Premium Voice 2` (a voice never fetched here — Zotero's own side caches sentence audio per voice+text, so cached sentences play through and a read-ahead failure never reaches playback). The wrap answers `network` + credits above 0 BEFORE the reopen (2026-10-01: error answers are not cached — a stale account-code answer acts as a second refusal at the reopen itself); `daily-limit-exceeded` is set only after the pause gate | the SWITCH fails at the pick (a voice being switched to counts at once — no play needed): the player closes, Premium off, the daily-limit reminder `Zotero Premium has reached today's limit and has been switched off. Enable it again in Zotero-TTS settings tomorrow.` with NO link, ✕ closes it; `last { code: 'daily-limit-exceeded', credits: null, action: 'daily-limit', closed: 1 }` (credits not read); Standard's pref untouched | — |
| `07-other-error.js` | Item 7 (new): Premium on, A reopened (05's sequence), the wrap answering `network` — SET BEFORE THE REOPEN (same reason as 06); play walked forward sentence by sentence until the first uncached one fails playback | NO reminder at any point, pref stays true, the player open with the ! (title = the playback message); clicked: `Playback failed. Check your provider connection and try again.` + Retry, no buy; `last` UNCHANGED from item 6; session left paused | — |
| `08-switch-to.js` | Item 8 (new): A's session driven to the System voice (paused), the premium figure 0 (through `m.allVoices` — `voicesForLanguage` is tier-filtered after the switch), the wrap answering credits `{114, 0}`; PLAY (muted — the engine's own output, `audio.state suspended` gain 0, `speechSynthesis` never speaks), then pick provider `Zotero Premium` | the refusal at the pick (~0.2 s): the switch fails with the voice notice `#ztts-voice-notice` ('Could not switch to Premium Voice 1. The previous voice is kept.'), the system voice reads on, A's player STAYS OPEN (the handoff leaves `selectedTier`/voice alone until commit), `getReadAloudAudio` 0 calls, Premium off, the used-up reminder in A with NO other-tabs line, `last { code: 'quota-exceeded', credits: 0, minutes: 0, action: 'used-up', closed: 0 }`; paused, figure restored, reminder closed at the end | — |
| `90-cleanup.js` | Run closer (before the credits kit's `99`): getAPIClient + launchURL restored (identity), the kept provider figure back, EVERY fixture player closed (only `toggleReadAloudPopup(false)`), every fixture tab closed, every fixture item erased, position rows back to the opener's count, NO `#ztts-zotero-reminder` left in any document, every snapshotted pref byte-identical (`system.enabled` included; `reader.readAloudVoices` FIRST, `readAloud.memory` LAST), transports settled, host left minimized (the erase check is truthiness: `Zotero.Items.get` returns `false`, not null, for an erased id on Zotero 10.0.5) | every `restored[…].matches: true`; `getAPIClientRestored`, `launchURLRestored`, `transportsSettled`, `itemsErased`, `remindersLeft: 0`, `runStateRemoved` all true; status `PASS` | — |

## Before you start

- The credits kit's `00` (Test WebDAV first) must already have run in this
  Zotero process; its items leave Premium ON for this kit. Owner players on
  Zotero's Premium tier are closed BEFORE item 4 if the reading guard needs
  it (noted per tab, never reopened).
- The owner players are never pressed; the fixture session starts on the
  memory voice and is muted (`readAloud.volume` 0) before anything opens.
- State touched, all restored by `90` from `Zotero.__zttsTimeLeft140.baseline`:
  every `readAloud.*` pref, `reader.readAloudVoices`, `system.enabled`, the
  tier switches, the voice's provider figure, `getAPIClient`, `launchURL`,
  the three fixture items/tabs/players and the position rows. The credits
  kit's `99` does the run's final restore. Nothing is written to Zotero's
  account; no audio is fetched from Zotero (the HTTP log has no `tts/audio`
  line — proved this run).
- The expected figures (26min/9min/3min/1min/34d 17h 20min) come from the
  live provider figure via `S.fmtMinutes` (the plugin's own form), never a
  frozen number.

## Limits

- **The engine replays a failed segment's stored error without refetching**
  (`core/engine/session.ts` speak(): `failed.has(index)` → handleError). A
  case's fetch is reached by a FRESH session (close + reopen the player) and
  an uncached sentence — or by the voice's own figure short-circuiting, which
  is item 4's point.
- **Zotero's own side caches sentence audio per voice+text** (found live
  2026-09-30): a reopened session plays through a run of cached sentences and
  read-ahead failures never reach playback — the fetch must be forced with a
  never-fetched voice (06, 07) or the voice's own 0 figure (04, 08). No
  `tts/audio` HTTP line appears — the cache is local.
- **The player reopen needs fresh document activation** (`notifyUserGestureActivation()`
  BEFORE the toggle click) and a settle beat after the close; without them the
  popup folds again within seconds ('A player did not reopen', twice this run).
- **`pluginPlayer()` rows are positional over `Zotero.Reader._readers`** —
  with several players open, identify a row by reader itemID, never "first
  open row" (found live: C's pick was tested against A's state).
- **Error answers are NOT cached** (found live 2026-10-01): Zotero's side
  caches fetched audio only, so a sentence 0 whose fetches only ever failed
  is REFETCHED at the next reopen and meets whatever the wrap then answers —
  a stale account-code answer acts as a second refusal there (closing the
  player, switching the tier off). 06/07 set their answers before the reopen
  for this reason; rerunning an item out of order leaves exactly this trap
  (four stray stub refusals that day, all on stub answers, no real request).
- **A tier switch left OFF makes the reopen silently not bind**: the
  per-document memory voice is then "not offered by this reader's list; no
  plugin voice is either, so Zotero's own choice stands" — the frame mounts
  with `.player` while `active` stays false, and the reopen reads as "A
  player did not reopen" (2026-10-01). Turn the tier on and settle before
  rerunning.
- **`Zotero.Items.get` returns `false`, not null, for an erased id on
  Zotero 10.0.5** — an `== null` erase check never passes once the items are
  gone; 90 tests truthiness (2026-10-01).
- **A fixture tab's transient first voice is the profile default**
  (2026-10-01): opening B plays the global default plugin voice (here
  `fish::…`) until the script pauses it and drives it to the Zotero voice —
  one bounded fish request; that day fish was unreachable (60 s timeout,
  retry NetworkError, no audio fetched, no spend observed).
- **A session's first play after opening can lag seconds** (the carried
  `audio output is blocked` note); the window is restored for the player work.
- **The status button paints on the player's 250 ms tick** — poll before
  asserting the ! (05).
- **The provider figure leaks through the manager's 60 s credits poll**: the
  poll reads the WRAP's credits answer and rewrites `premiumCreditsRemaining`
  (found live: 20 landed mid-item). 90 restores the kept figure.
- **`m.selectedTier`/`selectedVoiceID` move only at handoff commit** — that
  is why item 8's player stays open while the switch fails.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-29 | 1.16.3-beta4 (dd5f2b8) | the beta4 run's reply | Intl probe, t0, 1-6 PASS (the player's auto-opened alert, `.buy-time`, `26m` forms — all superseded) | kits committed in b1504a3 |
| 2026-09-30 | 1.16.3-beta5 (c482ff3), Zotero 10.0.3-beta.3+80bc5565e | the beta5 run's reply | t0 PASS (`26min` in the snapshot, `alertFieldPresent: false`, 27 prefs + `system.enabled`); 1 PASS (`26min`/`9min`, title exact, gap 6.00, alert gone); 2 PASS (13/13, spread 0); 3 PASS (`3min`/`1min` red at 233 ms, gray back at 239 ms); 4 PASS (B+C set up, C on System Albert; 0 audio calls, `last` used-up/0/0/closed 2 at 109 ms, reminder + others line + link + ✕ exact, launchURL once, settings Premium `Enable` + `0min` red + link; players A+B closed / C open confirmed settled); 5 PASS (wrap reinstalled with live closures, figure back, fetch made, `last` short/20/25.9/closed 0, ! + popover + Retry exact, no buy); 6 PASS (the refusal at the pick: closed 1, credits null, daily-limit reminder no link, Standard untouched, ✕ closed); 7 PASS (no reminder, pref true, ! → playback message + Retry, `last` unchanged); 8 PASS (System Albert playing muted, pick → refusal at 223 ms, voice notice exact, player open, system reads on, 0 calls, premium off, used-up reminder no others line, closed 0) — then `90` PASS (items/tabs/players cleared, rows 70, no reminder left, prefs byte-identical) | 04 replaced (B + free-voice C + never-asked), 05/06/07/08 new (05-short, 06-daily-limit, 07-other-error, 08-switch-to; the old alert-popover 04/05/06 deleted); `S.fmtMinutes` = the plugin form; the first 05 run's wrap answered a hard-coded credits 0 (predating the `S.creditsAnswer` patch) — 05 now reinstalls the wrap |
| 2026-10-01 | 1.16.3-beta8 (5360ebe0, a9f47c0 — #140 rebased onto main's #160-#163), Zotero 10.0.5-beta.2+c65dcb1cd | this run's reply | t0 PASS (`37min` at 368 credits, `alertFieldPresent: false`), 1 PASS (`37min`/`13min`, gap 6), 2 PASS (13/13, spread 0), 3 PASS (`3min`/`1min` red at 229 ms, gray back at 220 ms), 4 PASS (0 audio calls — the stubbed source was never asked; `last` used-up/0/0/closed 2 at 112 ms; reminder + `Reading also stopped in 1 other tab.` + link + ✕; launchURL once with the readaloud URL, reminder stayed; ✕ closed it; settings Premium `Enable` + `0min` red + link; **no reading-guard dialog, no `[zotero-tts]` error beyond the stub's own ClipErrors**), 5 PASS (fetch made, `last` short/20/36.8/closed 0, ! + popover + Retry exact), 6 PASS (refusal at the pick 569 ms, `last` daily-limit/credits null/closed 1, reminder no link, Standard untouched), 7 PASS (no reminder, pref true, ! title = the playback message, popover + Retry, `last` unchanged, 3 stub fetches), 8 PASS (**#163's handoff carried it unchanged**: refusal at the pick 211 ms, voice notice `Could not switch to Premium Voice 1. The previous voice is kept. Please try again.`, player OPEN and the System voice still `playing: true` with `error: null`, 0 audio calls, premium off, used-up reminder no others line, `closed: 0`) — then `90` PASS (rows 71, no reminder, prefs byte-identical) | 06/07 revised (stub answers set BEFORE the reopen — see Limits), 90's erase check made truthiness; 06/07/08 verified on a clean rerun after out-of-order attempts; credits 368 → 368 (nothing spent, `tts/audio` HTTP lines 0) |
