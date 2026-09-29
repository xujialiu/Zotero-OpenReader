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
| `01-postinstall-startup.js` | `diagnostics.startup()` + the BUILD PROOF: the installed profile XPI read with nsIZipReader, `content/zotero-tts.js` hashed in Zotero | version `1.16.3-beta4`, 25 steps all ok, `failed: []`; js SHA-256 `19b860a9…9503` matches; `ztts-player-time-used-up` AND `formatOverUnlimited` in the bundle (#140) plus `ztts-zotero-credits-row` (#159); `preferences.css` has `flex-shrink: 0` in `label.ztts-help[value]` (#158), the gap rule `#ztts-zotero-section description > span + label[is="zotero-text-link"]` at 6px, and the `[data-ztts-none]` red rule; `zoteroTiers()` carries `credits` with state kind `time` | — |
| `02-credits-pane-structure.js` | Item 1: opens the pane fresh (closes stale first), self-heals both tier switches ON (polled on the pref), polls the credits texts (≤20 s from pane load), then the section in document order; forces layout (scrollIntoView) before reading rects | section children `hbox(h2) · caption Standard · credits-row · switch-row · caption Premium · …`; `h2Text: "Zotero Read Aloud"`, no link, NO note line (since 7005e24); `?` on the heading's row, gap 4, 16.25 × 16.25; captions weight 600; credits-row descriptions `[ztts-zotero-credits-<t>, ztts-zotero-buy-<t>]`; buy link a `zotero-text-link`, `Add more time`, `href …/settings/readaloud`, shown; switch rows' FIRST children the two buttons; Log in hidden; 21 groupboxes, `ztts-zotero-section` right after `ztts-provider-mimo`; **`gapBuyLeftMinusTextRight: 6` both tiers** | — |
| `03-credits-on-open.js` | Item 2: `zoteroTiers()` + the pane's rows | `credits.standard = { credits: S, cheapest: 1, dearest: 1, state: { kind: "time", low: S, high: S }, text: "<Intl S> left" }`, premium `{ credits: P, cheapest: 10, dearest: 30, state: { kind: "time", low: P/30, high: P/10 }, text: "<P/30> – <P/10> left, depending on voice" }`; texts match the same Intl.DurationFormat formula computed in-script; messages `Signed in: N Standard/Premium voices.` (no "credit" in them); rows shown, texts = the diagnostic's `text`, no `data-ztts-none`, buy shown, Log in hidden; stable after 1.5 s | — |
| `04-refresh-after-test-connection.js` | Item 3: blanks Standard's credits text, clicks Test connection, polls in ONE script | `sawTesting` (`Testing…` at t≈0), final `Signed in: N Standard voices.`, credits text back to item 2's TIME text (2.0 s this run), `restoredTextIsATimeNotCredits`, no `data-ztts-none` | — |
| `05-tier-off-keeps-figure.js` | Item 4: requires no player whose tier matches (records active sessions + any `#ztts-notice` instead of assuming); Disable Premium, then restore with Enable, polled on the pref | pref `false` at ~100 ms, label `Enable`, credits row still shown with item 2's text, buy shown; restore `sawChecking`, pref `true`, result `Signed in: N Premium voices.` | — |
| `06-signed-out.js` | Item 5: keeps `hasCredentials`' own descriptor, replaces it with `() => false`, fires `api-key`; then clicks Standard's Log in (ONLY after verifying an API key is stored) and navigates back | credits rows hidden both tiers; Log in shown (`Log in`) on each result's row; **`gapLinkLeftMinusResultRight: 6` both, `verticalCenterDelta` 0**; result `Not signed in to a Zotero account.`; `zoteroTiers()` `signedIn: false`, `credits: null`, both checks the reason; **`win.Zotero_Preferences.navigation.value === "zotero-prefpane-account"` within 2 s**, back to `zotero-tts-pane` | — |
| `07-signed-in-again.js` | Item 6: restores `hasCredentials` with the exact descriptor (`Object.defineProperty`), fires `api-key`, polls ≤20 s | settled ~1.3 s; rows shown with item 2's exact TIME texts, Log in hidden, prefs true; `zoteroTiers()` `signedIn: true`, both tiers state kind `time`, text = pane text, checks have no credits word | — |
| `08-none-and-unlimited.js` | Item 7: wraps `getAPIClient` (instance override, Proxy fallback) with a mutable credits answer; blanks both texts, clicks Test connection; round 2 answers 114/1500000; then restores and clicks again | Round 1 (0 / 200000000): Standard `0m left` + `data-ztts-none` + computed color = the pane's `--accent-red` probe (`rgba(219, 44, 58, 0.898)`), buy shown; Premium `Unlimited`, no attribute, buy hidden. Round 2 (114 / 1500000): Standard `1h 54m left`; Premium `34d 17h 20m – 90d+ left, depending on voice`, buy shown. After restore item 2's texts at both tiers, both buy links shown; wrapper alive only inside the script | — |
| `99-cleanup-restore.js` | Run closer, always last: typed byte-identical restore of every snapshotted pref (tier switches and `readAloud.memory` included, memory last), settings window closed first, transports settled, test WebDAV destination backed out and the three switches cleared, debug store restored after reading the run's `[zotero-tts]` lines, host left minimized; **deletes `Zotero.__zttsCredits159` only when every restore matched** | every `restored[…].matches: true`; `webdavDestinationBackToOwner`, `webdavUrlMatchesBaseline`, `transportsSettled`, `debugStoringRestored` true; `runStateRemoved: true`; status `PASS` | — |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_list`, install, then `01`
  (its first act is `diagnostics.startup()`). The xpi is proven by its bundle
  hash, never the version string; update `01`'s expected SHA-256, the #140
  strings, and the CSS proof per build.
- No fixture: the settings pane only. A player whose session is on a Zotero
  tier blocks item 4 through the reading guard — close the owner's player
  first (noting the tab, never reopening) when its session is premium.
- State touched, all restored by `99` from `Zotero.__zttsCredits159.baseline`:
  both tier switches (02 heals them ON), `hasCredentials` (descriptor kept by
  `06`, restored by `07`), two `api-key` notifications, the settings window
  (closed by `99`), `webdav.url` + the three WebDAV switches (the 00
  isolation, backed out by `99`), `Zotero.Debug.storing`. `tts/credits` and
  `tts/voices` spend nothing; Test connection synthesizes one bounded metered
  probe per click (04, 08).
- Nothing is written to Zotero's account; a real sign-out/sign-in is never
  performed (the case's items 5–6 stand in for both).

## Limits

- **`99`'s restore records once printed the WebDAV secret prefs' VALUES**
  (2026-09-29 beta6 run). Fixed the same day: secret prefs (`password`,
  `username`, `url`, `machineId`, `syncState`, `readAloud.memory`) are
  reported by length only, mapped inside the script. Never reintroduce raw
  values in a result.
- **The pane's provider order is `… · System voices · Xiaomi MiMo · Zotero`**:
  `02`'s neighbor check compares against `ztts-provider-mimo`.
- **`06`'s Log in navigation read** is `win.Zotero_Preferences.navigation.value`
  (`#prefs-navigation`); the deck's `selectedPanel` stays stale.
- **A fresh pane's credits rows read `hidden: true` for ~0.4–1.3 s** until
  the load refresh paints — poll (as `02` does) before asserting visibility.
- **The account figure moves under you**: 260 Premium credits at 15:51, 259
  by 16:07 (2026-09-29, not ours — no Zotero audio was played). The ceil
  boundaries did not move (26m / 9m); every script derives expectations from
  the live provider figure, never a frozen 26m.
- **08's executed `premiumTopIs90dPlus` flag read false** on 2026-09-29: its
  check regex was anchored (`/90d\+$/`) against a text ending in "…voice".
  The exact-text equality (`expectedText` === the diagnostic's text, which
  contains `90d+`) is the pass evidence; the regex is un-anchored in the kit
  now (prepared, not re-run).

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-29 | 1.16.2-beta5, Zotero 10.0.3-beta.3+80bc5565e | the previous run's reply (timed out before its cleanup) | 2, 3, 4, 6, 7 PASS; 1 and 5's links measured gap **0** (the bug #159's 18de752 fixes); 5's Log in navigation read the wrong element — left unresolved | `00`–`08` ran; `99` never did; its isolation stayed active into the beta6 run |
| 2026-09-29 | 1.16.2-beta6, Zotero 10.0.3-beta.3+80bc5565e | the beta6 run's reply | 1–7 PASS then `99` PASS | Isolation inherited from beta5; `01` re-aimed at the beta6 hash, `02` gained the buy-link geometry, `06` the `navigation.value` read, `99` the secret-length fix |
| 2026-09-29 | 1.16.3-beta4 (dd5f2b8), Zotero 10.0.3-beta.3+80bc5565e | this run's reply | 1 PASS (h2 `Zotero Read Aloud`, no note, gaps 6.00/6.00, 21 groupboxes), 2 PASS (114/260 → `1h 54m left` / `9m – 26m left, depending on voice`, state kind `time`), 3 PASS (restored at 2001 ms, a time not credits), 4 PASS (pref off at 100 ms after the owner players were closed; figure kept; restore 1277 ms), 5 PASS (gaps 6.00/6.00, center delta 0, Account pane via `navigation.value`), 6 PASS (settled 1265 ms), 7 PASS (`0m left` + accent-red, `Unlimited` hides buy, `34d 17h 20m – 90d+ left, depending on voice`, restored 1246 ms) — then `99` PASS | `01`/`03`/`04`/`07`/`08` revised for #140 (time texts, new state shape, new hash + #140 strings); isolation from this run's own `00`; figures 114 / 260 (259 later, same ceil); cleanup verified byte-identical, WebDAV back to the owner, run global removed |
