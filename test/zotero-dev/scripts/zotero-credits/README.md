# Scripts: Each Zotero tier's credits in the settings, with Add more time and Log in (issue #159)

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
| `01-postinstall-startup.js` | `diagnostics.startup()` + the BUILD PROOF: the installed profile XPI read with nsIZipReader, `content/zotero-tts.js` hashed in Zotero | version `1.16.2-beta6`, 24 steps all ok, `failed: []`; js SHA-256 `f23dbde3…0f33b1` matches; `ztts-zotero-credits-row` present; `preferences.css` has `flex-shrink: 0` in `label.ztts-help[value]` (#158) AND the #159 gap rule `#ztts-zotero-section description + label[is="zotero-text-link"]` with `margin-inline-start: 6px`; `zoteroTiers()` carries `credits` (cheapest 1/10, state `left`) | — |
| `02-credits-pane-structure.js` | Item 1: opens the pane fresh (closes stale first), self-heals both tier switches ON (polled on the pref), polls the credits texts (≤20 s from pane load), then the section in document order; forces layout (scrollIntoView) before reading rects | section children `label(h2) · hbox(note+?) · caption Standard · credits-row · switch-row · caption Premium · …`; `h2Text: "Zotero"`, no link; note text exact, one line (17 px < 2×17.33); `?` on the note's row, gap 4, 16.25 × 16.25; captions weight 600; credits-row hboxes `[ztts-zotero-credits-<t>, ztts-zotero-buy-<t>]`; buy link a `zotero-text-link`, `Add more time`, `href …/settings/readaloud`, shown; switch rows' FIRST children the two buttons, no fields; Log in hidden; 21 groupboxes, `ztts-zotero-section` right after `ztts-provider-mimo`; **`gapBuyLeftMinusTextRight: 6` both tiers** | — |
| `03-credits-on-open.js` | Item 2: `zoteroTiers()` + the pane's rows | `credits.standard = { credits: S, cheapest: 1, state: { kind: "left", credits: S } }`, premium the same at cheapest 10; messages `Signed in: N Standard/Premium voices.` (format ok, no "credit" in them); rows shown, texts `<Intl S> credits left`, no `data-ztts-none`, buy shown, Log in hidden; texts stable after 1.5 s | — |
| `04-refresh-after-test-connection.js` | Item 3: blanks Standard's credits text, clicks Test connection, polls in ONE script | `sawTesting` (`Testing…` at t≈0), final `Signed in: N Standard voices.`, credits text back to item 2's (845 ms on beta6), no `data-ztts-none` | — |
| `05-tier-off-keeps-figure.js` | Item 4: requires no player whose tier matches (records active sessions + any `#ztts-notice` instead of assuming); Disable Premium, then restore with Enable, polled on the pref | pref `false` at ~100 ms, label `Enable`, credits row still shown with item 2's text, buy shown; restore `sawChecking`, pref `true`, result `Signed in: N Premium voices.` | — |
| `06-signed-out.js` | Item 5: keeps `hasCredentials`' own descriptor, replaces it with `() => false`, fires `api-key`; then clicks Standard's Log in (ONLY after verifying an API key is stored — without one the Account pane would start a real sign-in) and navigates back | credits rows hidden both tiers; Log in shown (`Log in`) on each result's row; **`gapLinkLeftMinusResultRight: 6` both, `verticalCenterDelta` 1.5 (within 2 px)**; result `Not signed in to a Zotero account.` (old string gone); `zoteroTiers()` `signedIn: false`, `credits: null`, both checks the reason; **`win.Zotero_Preferences.navigation.value === "zotero-prefpane-account"` within 2 s** (227 ms on beta6; the deck's `selectedPanel` lags and is supplementary only), back to `zotero-tts-pane` | — |
| `07-signed-in-again.js` | Item 6: restores `hasCredentials` with the exact descriptor (`Object.defineProperty`), fires `api-key`, polls ≤20 s | settled ~620 ms; rows shown with item 2's exact texts, Log in hidden, result lines empty, prefs true; `zoteroTiers()` `signedIn: true`, credits 114/260 | — |
| `08-none-and-unlimited.js` | Item 7: wraps `Zotero.Sync.Runner.getAPIClient` (instance override, Proxy fallback) so its client answers `getReadAloudCreditsRemaining()` with `{ standard: 0, premium: 200000000 }`; blanks both texts, clicks Test connection; then restores and clicks again | Standard `No credits left` + `data-ztts-none` + computed color = the pane's `--accent-red` probe, buy shown; Premium `Unlimited`, no attribute, buy hidden; after restore item 2's texts at both tiers, both buy links shown; wrapper alive only inside the script | — |
| `99-cleanup-restore.js` | Run closer, always last: typed byte-identical restore of every snapshotted pref (this INCLUDES both tier switches — their baseline here is user values `false`; `readAloud.memory` last), settings window closed first, transports settled, test WebDAV destination backed out and the three switches cleared, debug store restored after reading the run's `[zotero-tts]` lines, host left minimized; **deletes `Zotero.__zttsCredits159` only when every restore matched** | every `restored[…].matches: true`; `webdavDestinationBackToOwner`, `webdavUrlMatchesBaseline`, `transportsSettled`, `debugStoringRestored` true; `runStateRemoved: true`; status `PASS` | — |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_list`, install, then `01`
  (its first act is `diagnostics.startup()`). The xpi is proven by its bundle
  hash, never the version string; update `01`'s expected SHA-256 and the CSS
  proof per build.
- No fixture: the settings pane only. A player whose session is on a Zotero
  tier would be refused by the reading guard in `05`; this run's only session
  was the owner's paused fish tab — `05` records the sessions and any
  `#ztts-notice` rather than assuming.
- State touched, all restored by `99` from `Zotero.__zttsCredits159.baseline`:
  both tier switches (on for the run, back to the baseline's `false`),
  `hasCredentials` (descriptor kept by `06`, restored by `07`), two `api-key`
  notifications, the settings window (closed by `99`), `webdav.url` + the
  three WebDAV switches (the 00 isolation, backed out by `99`),
  `Zotero.Debug.storing`. `tts/credits` and `tts/voices` spend nothing; Test
  connection synthesizes one bounded metered probe per click (04, 08, and
  zotero-tiers' `02`).
- Nothing is written to Zotero's account; a real sign-out/sign-in is never
  performed (the case's items 5–6 stand in for both).

## Limits

- **`99`'s restore records once printed the WebDAV secret prefs' VALUES**
  (`was`/`now` carried the raw strings into a tool result, 2026-09-29 beta6
  run — the script had never executed before: the beta5 run timed out before
  its cleanup). Fixed the same day: secret prefs (`password`, `username`,
  `url`, `machineId`, `syncState`, `readAloud.memory`) are now reported by
  length only, mapped inside the script, and the on-disk results were
  scrubbed. Never reintroduce raw values in a result.
- **The pane's provider order is `… · System voices · Xiaomi MiMo · Zotero`**:
  `02`'s neighbor check originally compared against `ztts-provider-system`
  (pre-#159 pane) and read `false` on beta6; it now checks
  `ztts-provider-mimo` (corrected and re-run 2026-09-29).
- **`06`'s Log in navigation read**: the deck's `selectedPanel` stays stale
  and `#zotero-prefpane-account` may not even exist yet when the click's
  navigation is judged — the right read is
  `win.Zotero_Preferences.navigation.value` (`#prefs-navigation`, what
  Zotero's own `navigateToPane` sets, preferences.js 125-130). Found live on
  beta5 (its run read the wrong element and left the check unresolved);
  fixed in the beta6 revision, `onAccountPane: true` at 227 ms.
- **A fresh pane's credits rows read `hidden: true` for ~0.4–1.3 s** until
  the load refresh paints (zotero-tiers' `01` reads structure at t≈0 and
  sees exactly that) — poll (as `02` does) before asserting visibility.
- The beta5 run's figures (114 Standard / 260 Premium, 28 / 1,452 voices)
  are this profile's standing values; read the current ones from `03`'s
  diagnostic, never from here.

- **Revise `02` and `06` at the next run**: since e86555c (beta7) each
  link is the next sibling of a `span` inside one `description`
  (`ztts-zotero-credits-row-<t>` is that description; the result text is a
  span), and the case asks for Range-rect `top`/`bottom` deltas of 0 between
  text and link, not box centers within 2 px. The beta7 check ran as a
  research probe (`.tmp/zotero-dev/credits-baseline/probe.js`): deltas 0,
  gaps 6.00.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-29 | 1.16.2-beta5, Zotero 10.0.3-beta.3+80bc5565e | the previous run's reply (timed out before its cleanup) | 2, 3, 4, 6, 7 PASS; 1 and 5's links measured gap **0** (the bug #159's 18de752 fixes); 5's Log in navigation read the wrong element — left unresolved | `00`–`08` ran; `99` never did; its isolation stayed active into the beta6 run |
| 2026-09-29 | 1.16.2-beta6, Zotero 10.0.3-beta.3+80bc5565e | this run's reply | 1 PASS (gaps 6.00/6.00, `?` gap 4, 21 groupboxes after MiMo), 2 PASS (114/260, cheapest 1/10), 3 PASS (restored at 845 ms), 4 PASS (pref off at 103 ms, figure kept; no guard dialog), 5 PASS (gaps 6.00/6.00, centered 1.5, Account pane at 227 ms via `navigation.value`, back), 6 PASS (settled 620 ms), 7 PASS (accent-red + `data-ztts-none`, Unlimited hides buy; restored at 936 ms) — then `99` PASS | Isolation inherited from the beta5 run (00 NOT re-run); `01` re-aimed at the beta6 hash + #159 CSS proof, `02` gained the buy-link geometry and the MiMo neighbor, `06` the `navigation.value` read + 6 px assertions, `99` the baseline-true tier restore and the secret-length fix; cleanup verified: every pref back to baseline, WebDAV destination back to the owner's, run global removed |
