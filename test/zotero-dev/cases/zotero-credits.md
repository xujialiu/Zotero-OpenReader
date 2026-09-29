[Checklist index](../README.md)

## Each Zotero tier's credits in the settings, with Add more time and Log in (issue #159)

Under each tier's name in the settings pane's **Zotero** section, a line
with the credits left on the account for it and an **Add more time** link
to `https://www.zotero.org/settings/readaloud`; signed out, no such line,
and a **Log in** link after the switch row's result, which opens Zotero's
Account settings with the sign-in started. Credits, never minutes. Nothing
left reads `No credits left` in red with the link; more than 90 days of
minutes at the tier's cheapest voice reads `Unlimited`, no link (Zotero's
own line). Read when the pane opens, after each Test connection or Enable
of a Zotero tier, and at every sign-in or sign-out; a tier switched off
still shows its figure. Test connection's result no longer carries the
credits. Mechanism: `src/ui/zotero-credit-rows.ts` over the pane's
`zoteroVoiceService()` — `tts/credits` for the figures, the `tts/voices`
listing for the prices (`creditsPerMinute`, kept by `parseZoteroVoices`);
wired in `src/ui/prefs-pane.ts` (load, `onChecked`, the `api-key`
notification). `diagnostics.zoteroTiers()` reports `credits` from the
same `readZoteroCredits`.

Run the baseline first. No fixture: the settings pane only. **No player
may be open** for item 4 (the reading guard refuses the switch). The
owner's profile is signed in; items 5-6 sign out by the same stand-in as
`cases/zotero-tiers.md` items 10-11. Figures below are the owner's on
2026-09-15 (115 Standard, 283 Premium); read the current ones from item 2's
diagnostic, not from here.

1. **The section's shape.** Settings → Zotero-TTS, `#ztts-zotero-section`,
   in document order: the `h2` `Zotero`; a row with
   `description[data-l10n-id="ztts-zotero-note"]` reading `Zotero's own
   voices; they need a Zotero account signed in.` (zh-CN `Zotero
   自带的语音，需要登录 Zotero 账户。`) on **one line** (its rect's height
   under two line heights) and its `?` right after it (gap 4 px, as after
   any description); then per tier, Standard first: a
   `label.ztts-caption` reading `Standard` / `Premium` (computed
   `font-weight` 600); `description#ztts-zotero-credits-row-<tier>`
   holding `span#ztts-zotero-credits-<tier>` and, as its next sibling,
   `label#ztts-zotero-buy-<tier>` (a `zotero-text-link`, text `Add more
   time`, zh-CN `添加更多时长`, `href`
   `https://www.zotero.org/settings/readaloud`), starting 6 px after the
   credits text's right edge **on the same baseline**: a Range over each
   one's text node gives equal `top` and `bottom` (0 px; as two siblings in
   a centered hbox the link sat 1.5 px low on 1.16.2-beta6); then
   `hbox#ztts-provider-zotero-<tier>` holding Enable, Test connection and
   a `description` holding `span#ztts-test-result-zotero-<tier>` and
   `label#ztts-zotero-log-in-<tier>` (`hidden` while signed in). The two
   buttons are the first children of their row: no label before them.
2. **The credits on open.** Within 20 s of the pane's load:
   `diagnostics.zoteroTiers()` (async) → `credits.standard` =
   `{ credits: S, cheapest: 1, state: { kind: "left", credits: S } }`,
   `credits.premium` = `{ credits: P, cheapest: 10, state: { kind:
   "left", credits: P } }` (Premium's voices cost 10 and 30 a minute; 1
   and 10 are the lowest); `checks[…].message` `Signed in: N Standard
   voices.` / `Signed in: N Premium voices.`, no credits in it. The pane:
   both credits rows shown, `#ztts-zotero-credits-standard` reads `S
   credits left` with the locale's grouping (zh-CN `剩余 S 额度`), the
   same for Premium; both buy links shown; no `data-ztts-none` on either
   text; both Log in links hidden.
3. **Read again after Test connection.** Blank
   `#ztts-zotero-credits-standard`'s `textContent` by hand, then click
   **Test connection** beside Standard → the result line `Testing…`, then
   `Signed in: N Standard voices.`; within 20 s the credits text is item
   2's again (the refresh ran; nothing else writes it).
4. **A tier switched off keeps its figure.** No player open. **Disable**
   beside Premium → the switch row reads `Enable`, the credits row stays
   shown with item 2's text. Restore with **Enable** (`Checking…`, then
   `Signed in: …`, `Disable`).
5. **Signed out.** As `cases/zotero-tiers.md` item 10: keep
   `Zotero.Sync.Data.Local.hasCredentials`, replace it with `() => false`,
   fire `Zotero.Notifier.trigger('modify', 'api-key', [])` → both credits
   rows `hidden`; both Log in links shown, text `Log in` (zh-CN `登录`);
   both result lines `Not signed in to a Zotero account.` (zh-CN `未登录
   Zotero 账户。`), each Log in link starting 6 px after the result text's
   right edge (0 px on 1.16.2-beta5: the text touched the link), on the
   same baseline: Range rects of the two text nodes with equal `top` and
   `bottom` (0 px; 1.5 px apart on 1.16.2-beta6). `diagnostics.zoteroTiers()` → `signedIn: false`,
   `credits: null`. Click Standard's **Log in** → within 2 s the
   settings window's selected pane is `zotero-prefpane-account` — read
   `win.Zotero_Preferences.navigation.value`, the `#prefs-navigation`
   richlistbox `navigateToPane` sets (`preferences.js` 125-130)
   (Zotero's own navigation; the owner's API key is still stored, so the
   Account pane does not start a sign-in: `_handlePendingAction` asks
   `getAPIKey()`, not `hasCredentials`). Navigate back to the Zotero-TTS
   pane.
6. **Signed in again.** Assign the kept `hasCredentials` back and fire
   the notification again → both Log in links hidden, both credits rows
   shown again with item 2's texts within 20 s.
7. **Nothing left, and Unlimited.** Keep `Zotero.Sync.Runner.getAPIClient`
   and wrap it so the client it returns answers
   `getReadAloudCreditsRemaining()` with `{ standardCreditsRemaining: 0,
   premiumCreditsRemaining: 200000000 }` (everything else passed
   through). Click **Test connection** beside Standard → Standard's
   credits text `No credits left` (zh-CN `额度已用完`) with
   `data-ztts-none`, computed `color` Zotero's `--accent-red` (read the
   variable on the pane's root to compare), its buy link shown; Premium's
   text `Unlimited` (zh-CN `不限额度`), no `data-ztts-none`, its buy link
   `hidden` (200,000,000 credits at 10 a minute is past 129,600
   minutes). Assign the kept `getAPIClient` back and click Test
   connection again → item 2's texts, both links shown.

What it may touch: `zotero-tts.zotero-standard.enabled` and
`zotero-tts.zotero-premium.enabled` (back to their values before the run:
the owner's profile had both off on 2026-09-29, so a run turns them on
first and off again at the end),
`Zotero.Sync.Data.Local.hasCredentials` and
`Zotero.Sync.Runner.getAPIClient` (each kept and assigned back), two
`api-key` notifications, the settings window's selected pane (back to
Zotero-TTS). Nothing is written to Zotero's account; `tts/credits` and
`tts/voices` spend nothing.

Only a human can judge: how the section reads beside the other sections
— the captions, the credits line under each, the links' color — which the
bridge cannot screenshot (it reaches the main window only).

Not testable live: a real sign-out and a real sign-in started from Log
in (the owner stays signed in); the unit tests in
`test/ui/zotero-credit-rows.test.ts` cover every state, a failed listing
and a stale refresh.
