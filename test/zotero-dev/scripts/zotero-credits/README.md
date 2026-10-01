# Scripts: Each Zotero tier's time left in the settings, with Add more time and Log in (issues #159, #140)

[Case](../../cases/zotero-credits.md) · [Checklist index](../../README.md) · [All scripts](../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

## Scripts

Run in this order through `_shared/run.js` (`kit: 'zotero-credits'`). No
params: every script reads its state from the run global
`Zotero.__zttsCredits159`, which `00` creates and `99` removes. **Never run
`00` while `Zotero.__zttsCredits159.baseline` exists** — the baseline inside
it is the owner's pre-run state; re-running would snapshot the run's own test
state as that baseline. `01` runs straight after the tester's own
`zotero_plugin_install`; `99` runs last, after every other kit, and deletes
the run global only after a fully successful restore.

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `00-isolate-and-baseline.js` | Run opener, ONCE per run, before the install: "Test WebDAV first" + baseline — typed snapshot of every pref the case may touch, transports settled, the three WebDAV switches suspended and `webdav.url` moved to `~/.secrets/Zotero-TTS/test_webdav.txt` (secret-bearing prefs mapped to lengths), OpenReader Position refused, host minimized, readers/settings window/position rows/error ring/locale recorded, debug store armed | `destinationMatched`, `switchesSuspended`, `transportsSettledBefore`, `hostMinimized` all true | — |
| `01-postinstall-startup.js` | `diagnostics.startup()` + the BUILD PROOF: the installed profile XPI read with nsIZipReader, `content/zotero-tts.js` hashed in Zotero; the new `diagnostics.zoteroRefusals()` answers `last: null` | version `1.16.3-beta8`, 25 steps all ok, `failed: []`; js SHA-256 `5360ebe0…1829ee` matches (a9f47c0, #140 rebased onto #160-#163); `ztts-reminder-used-up` + `zoteroRefusals` + `ztts-duration-hm` + `formatOverUnlimited` in the bundle, `ztts-zotero-credits-row` too (#159); the player's `ztts-player-time-used-up`/`addMoreTime` strings GONE; `preferences.css` keeps the #158 `flex-shrink: 0`, the 6px gap rule, the `[data-ztts-none]` red rule | — |
| `02-credits-pane-structure.js` | Item 1: opens the pane fresh (closes stale first), self-heals both tier switches ON (polled on the pref), polls the credits texts (≤20 s from pane load), then the section in document order; forces layout before reading rects | section children `hbox(h2) · caption · credits-row · switch-row` per tier; `h2Text: "Zotero Read Aloud"`, NO note line (since 7005e24); `?` on the heading's row; captions weight 600; credits rows `[ztts-zotero-credits-<t>, ztts-zotero-buy-<t>]`; **both buy links `hidden` at the owner's figures** (beta5 `offersMoreTime`: shown only under 3 minutes — the 6 px gap is measured in 08 when a stub shows them); switch rows' FIRST children the two buttons; Log in hidden; 21 groupboxes, `ztts-zotero-section` right after `ztts-provider-mimo` | — |
| `03-credits-on-open.js` | Item 2: `zoteroTiers()` + the pane's rows | `credits.standard = { credits: S, cheapest: 1, dearest: 1, state: { kind: "time", low: S, high: S }, text: "Remaining time: <S>" }` (114 → `Remaining time: 1h 54min`), premium `{ credits: P, cheapest: 10, dearest: 30, state: { kind: "time", low: P/30, high: P/10 }, text: "Remaining time: <P/30> – <P/10>, depending on voice" }` (259 → `Remaining time: 9min – 26min, depending on voice`) — each ceil, written by the plugin's OWN messages (`ztts-duration-*`, `26min` not Intl's `26m`); messages `Signed in: N Standard/Premium voices.` (no "credit"); rows shown, texts = the diagnostic's `text`, no `data-ztts-none`, **buy hidden matching `offersMoreTime`**, Log in hidden; stable after 1.5 s | — |
| `04-refresh-after-test-connection.js` | Item 3: blanks Standard's credits text, clicks Test connection, polls in ONE script | `sawTesting` (`Testing…` at t≈0), final `Signed in: N Standard voices.`, credits text back to item 2's text (1.2 s this run), `restoredTextIsATimeNotCredits`, no `data-ztts-none` | — |
| `05-tier-off-keeps-figure.js` | Item 4: requires no player whose tier matches (records active sessions + any `#ztts-notice` instead of assuming); Disable Premium, then restore with Enable, polled on the pref | pref `false` at ~100 ms, label `Enable`, credits row still shown with item 2's text, buy hidden; restore `sawChecking`, pref `true`, result `Signed in: N Premium voices.` | — |
| `06-signed-out.js` | Item 5: keeps `hasCredentials`' own descriptor, replaces it with `() => false`, fires `api-key`; then clicks Standard's Log in (ONLY after verifying an API key is stored) and navigates back | credits rows hidden both tiers; Log in shown (`Log in`) on each result's row; **`gapLinkLeftMinusResultRight: 6` both, `verticalCenterDelta` 0**; result `Not signed in to a Zotero account.`; `zoteroTiers()` `signedIn: false`, `credits: null`; **`win.Zotero_Preferences.navigation.value === "zotero-prefpane-account"` within 2 s**, back to `zotero-tts-pane` | — |
| `07-signed-in-again.js` | Item 6: restores `hasCredentials` with the exact descriptor (`Object.defineProperty`), fires `api-key`, polls ≤20 s | settled ~0.5 s; rows shown with item 2's exact texts, Log in hidden, prefs true; `zoteroTiers()` `signedIn: true`, both tiers state kind `time`, text = pane text | — |
| `08-none-and-unlimited.js` | Item 7: wraps `getAPIClient` (instance override, Proxy fallback) with a mutable credits answer; blanks both texts, clicks Test connection; round 2 answers 114/80; round 3 114/1500000; then restores and clicks again | Round 1 (0 / 200000000): Standard `Remaining time: 0min` + `data-ztts-none` + computed color = the pane's `--accent-red` probe, buy SHOWN, **link 6 px after the text's right edge, same baseline (Range rects top/bottom equal, deltas 0)**, result `No remaining time on Standard. Add more time first.`; Premium `Remaining time: Unlimited`, buy hidden. Round 2 (114 / 80): Premium `Remaining time: 3min – 8min, depending on voice`, link shown (2.67 min < 3), same geometry. Round 3 (114 / 1500000): Premium `Remaining time: 34d 17h 20min – 90d+, depending on voice`, buy hidden. After restore item 2's texts at both tiers, both links hidden; wrapper alive only inside the script | — |
| `09-enable-at-zero.js` | Item 8 (NEW): wraps `getAPIClient`, turns Premium OFF through its own switch, clicks Enable at credits 0, then at 20 | `Checking…`, then exactly `No remaining time on Premium. Add more time first.` (0.4 s), pref stays off, label `Enable`; the credits row reads `Remaining time: 0min` + `data-ztts-none` in accent red with its link (POLL the row — its refresh is async beside the check); Enable at 20 → pref true, `Signed in: N Premium voices.`, row `Remaining time: 1min – 2min, depending on voice`; wrapper restored in-script | — |
| `99-cleanup-restore.js` | Run closer, always last: typed byte-identical restore of every snapshotted pref (tier switches and `readAloud.memory` included, memory last), settings window closed first, transports settled, test WebDAV destination backed out and the three switches cleared, debug store restored after reading the run's `[zotero-tts]` lines, host left minimized; **deletes `Zotero.__zttsCredits159` only when every restore matched** | every `restored[…].matches: true`; `webdavDestinationBackToOwner`, `webdavUrlMatchesBaseline`, `transportsSettled`, `debugStoringRestored` true; `runStateRemoved: true`; status `PASS` | — |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_list`, install, then `01`
  (its first act is `diagnostics.startup()`). The xpi is proven by its bundle
  hash, never the version string; update `01`'s expected SHA-256 and the #140
  strings per build.
- No fixture: the settings pane only. A player whose session is on a Zotero
  tier blocks item 4 through the reading guard — close the owner's player
  first (noting the tab, never reopening) when its session is premium.
- State touched, all restored by `99` from `Zotero.__zttsCredits159.baseline`:
  both tier switches (02 heals them ON; the owner's profile reads standard
  USER false, premium default — the typed restore clears a user value it did
  not have), `hasCredentials` (descriptor kept by `06`, restored by `07`),
  two `api-key` notifications, the settings window (closed by `99`),
  `webdav.url` + the three WebDAV switches (the 00 isolation, backed out by
  `99`), `Zotero.Debug.storing`. `tts/credits` and `tts/voices` spend nothing;
  Test connection/Enable synthesize one bounded metered probe per click
  (04, 08, 09).
- Nothing is written to Zotero's account; a real sign-out/sign-in is never
  performed (the case's items 5–6 stand in for both).

## Limits

- **The pane's provider order is `… · System voices · Xiaomi MiMo · Zotero`**:
  `02`'s neighbor check compares against `ztts-provider-mimo`.
- **`06`'s Log in navigation read** is `win.Zotero_Preferences.navigation.value`
  (`#prefs-navigation`); the deck's `selectedPanel` stays stale.
- **A fresh pane's credits rows read `hidden: true` for ~0.4–1.3 s** until
  the load refresh paints — poll (as `02` does) before asserting visibility.
- **The account figure moves under you**: 260 Premium credits at 15:51, 259
  by 16:07 (2026-09-29, not ours — no Zotero audio was played); 259 again on
  2026-09-30; 120 Standard / 368 Premium on 2026-10-01. Every script derives
  expectations from the live provider figure, never a frozen 26.
- **Secret prefs are reported by length only** (the 2026-09-29 fix): the
  restore records map `password`, `username`, `url`, `machineId`,
  `syncState`, `readAloud.memory` to lengths inside the script.
- **09's credits-row refresh lands beside the check** (first run read the row
  too early and then saw a stale `0min` at the second Enable): poll the row's
  text after each Enable, as 09 does.
- The time-left kit's `90` runs before this kit's `99` when both kits run.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-29 | 1.16.2-beta5/beta6, 1.16.3-beta4 (dd5f2b8) | the previous runs' replies | #159 items + #140 beta4: settings `1h 54m left` / `9m – 26m left` (Intl then), links 0 px then 6 px, `0m left` red, `34d 17h 20m – 90d+` | superseded by the beta5 texts; see the beta4 run's reply for its table |
| 2026-09-30 | 1.16.3-beta5 (c482ff3), Zotero 10.0.3-beta.3+80bc5565e | the beta5 run's reply | 1 PASS (h2, no note, 21 groupboxes, **both buy links hidden**), 2 PASS (114/259 → `Remaining time: 1h 54min` / `Remaining time: 9min – 26min, depending on voice`; Intl narrow still `1h 54m` — the plugin's own writer proven), 3 PASS (restored 1169 ms), 4 PASS (off 103 ms, figure kept, restore 760 ms), 5 PASS (gaps 6/6, center 0, Account pane 142 ms), 6 PASS (settled 491 ms), 7 PASS (`Remaining time: 0min` red + link 6 px/baseline 0, `Unlimited` hides buy, `3min – 8min` shows it, `34d 17h 20min – 90d+`, restored 1123 ms), 8 PASS (refused 376–447 ms, exact message, pref off, row 0min red after a 455 ms poll; 20 → on at 359 ms) — then `99` PASS | `01` re-aimed at the beta5 hash + strings + `zoteroRefusals() last: null`; `02` asserts the links hidden (the gap moved to 08); `03`'s expectations use the plugin form; `08` rewritten (4 rounds, Range-baseline geometry, the 80-credit round); `09` NEW; figures 114/259; cleanup byte-identical, WebDAV back to the owner, run global removed |
| 2026-10-01 | 1.16.3-beta8 (5360ebe0, a9f47c0 — #140 rebased onto main's #160-#163), Zotero 10.0.5-beta.2+c65dcb1cd | this run's reply | 1 PASS (h2, no note, both buy links hidden at the live figures), 2 PASS (120/368 → `Remaining time: 2h 0min` / `Remaining time: 13min – 37min, depending on voice`; Intl narrow still `1h 54m`), 3 PASS (restored 1041 ms), 4 PASS (off 105 ms, figure kept, restore 829 ms), 5 PASS (gaps 6/6, center 0, Account pane 104 ms), 6 PASS (settled 1400 ms), 7 PASS (`0min` red + link 6 px/baseline 0, `Unlimited`, `3min – 8min` shows buy, `34d 17h 20min – 90d+`, restored to item 2), 8 PASS (refused 423 ms, exact message, pref off, row `0min` red at 522 ms; 20 → on at 494 ms, row `1min – 2min`) — then `99` PASS | `01` re-aimed at the beta8 hash (no other change); figures read live 120/368; no regression from the #160-#163 rebase; cleanup byte-identical, WebDAV back to the owner, both run globals removed |
