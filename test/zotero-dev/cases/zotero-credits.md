[Checklist index](../README.md)

## Each Zotero tier's remaining time in the settings, with Add more time and Log in (issues #159, #140)

Under each tier's name in the settings pane's **Zotero** section, a line
with the remaining time on the account for it, as zotero.org counts it:
credits over each voice's price, rounded up, in the owner's form
(`Remaining time: 1h 54min`; zh-CN `剩余时间：1小时54分钟`), a range
from the dearest voice to the cheapest when the tier has two prices
(`Remaining time: 9min – 26min, depending on voice`), its top `90d+` when
only the cheaper voices pass 90 days. Nothing left reads `Remaining time:
0min` in red; `Remaining time: Unlimited` only when even the dearest voice
passes 90 days (Zotero's own line); with no price listed, the credits
figure (`N credits left`). An **Add more time** link to
`https://www.zotero.org/settings/readaloud` shows only when the dearest
voice has under 3 minutes, 0 included (issue #140). Signed out, no such
line, and a **Log in** link after the switch row's result, which opens
Zotero's Account settings with the sign-in started. Read when the pane
opens, after each Test connection or Enable of a Zotero tier, and at every
sign-in or sign-out; a tier switched off still shows its figure. Enable
and Test connection fail a tier whose credits are 0: `No remaining time on
Premium. Add more time first.`; otherwise the result carries no credits.
Mechanism: `src/ui/zotero-credit-rows.ts` (`creditText`,
`offersMoreTime`) over the pane's `zoteroVoiceService()` — `tts/credits`
for the figures, the `tts/voices` listing for the prices
(`creditsPerMinute`, kept by `parseZoteroVoices`); wired in
`src/ui/prefs-pane.ts` (load, `onChecked`, the `api-key` notification);
the check in `src/ui/zotero-tier-check.ts`. `diagnostics.zoteroTiers()`
reports `credits` from the same `readZoteroCredits`, each tier with
`dearest` and the line's `text`.

Run the baseline first. No fixture: the settings pane only. **No player
may be open** for item 4 (the reading guard refuses the switch). The
owner's profile is signed in; items 5-6 sign out by the same stand-in as
`cases/zotero-tiers.md` items 10-11. Figures below are the owner's on
2026-09-15 (115 Standard, 283 Premium; 114 and 260 on 2026-09-29, which
zotero.org wrote as 1 hour 54 minutes and 9 to 26 minutes); read the
current ones from item 2's diagnostic, not from here.

1. **The section's shape.** Settings → OpenReader, `#ztts-zotero-section`,
   in document order: an hbox holding the `h2` `Zotero Read Aloud` (in
   every locale) and its `?` (`ztts-help-zotero`) right after it on the
   heading's line, with no note line under it; then per tier, Standard
   first: a
   `label.ztts-caption` reading `Standard` / `Premium` (computed
   `font-weight` 600); `description#ztts-zotero-credits-row-<tier>`
   holding `span#ztts-zotero-credits-<tier>` and, as its next sibling,
   `label#ztts-zotero-buy-<tier>` (a `zotero-text-link`, text `Add more
   time`, zh-CN `添加更多时长`, `href`
   `https://www.zotero.org/settings/readaloud`; `hidden` at 3 minutes or
   more, its place when shown measured in item 7); then
   `hbox#ztts-provider-zotero-<tier>` holding Enable, Test connection and
   a `description` holding `span#ztts-test-result-zotero-<tier>` and
   `label#ztts-zotero-log-in-<tier>` (`hidden` while signed in). The two
   buttons are the first children of their row: no label before them.
2. **The time left on open.** Within 20 s of the pane's load:
   `diagnostics.zoteroTiers()` (async) → `credits.standard` =
   `{ credits: S, cheapest: 1, dearest: 1, state: { kind: "time", low: S,
   high: S }, text: "Remaining time: <S>" }`, `credits.premium` = `{
   credits: P, cheapest: 10, dearest: 30, state: { kind: "time", low: P /
   30, high: P / 10 }, text: "Remaining time: <P/30> – <P/10>, depending
   on voice" }` (each rounded up: S = 114 → `Remaining time: 1h 54min`, P
   = 260 → `Remaining time: 9min – 26min, depending on voice`; zh-CN
   `剩余时间：1小时54分钟`, `剩余时间：9分钟 – 26分钟，视语音而定`);
   `checks[…].message` `Signed in: N Standard voices.` / `Signed in: N
   Premium voices.`, no credits in it. The pane: both rows shown,
   `#ztts-zotero-credits-<tier>` reading the diagnostic's `text`; both buy
   links `hidden` (every voice has 3 minutes or more); no
   `data-ztts-none` on either text; both Log in links hidden.
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
   `getAPIKey()`, not `hasCredentials`). Navigate back to the Zotero-OpenReader
   pane.
6. **Signed in again.** Assign the kept `hasCredentials` back and fire
   the notification again → both Log in links hidden, both credits rows
   shown again with item 2's texts within 20 s.
7. **Nothing left, and Unlimited.** Keep `Zotero.Sync.Runner.getAPIClient`
   and wrap it so the client it returns answers
   `getReadAloudCreditsRemaining()` with `{ standardCreditsRemaining: 0,
   premiumCreditsRemaining: 200000000 }` (everything else passed
   through). Click **Test connection** beside Standard → its result `No
   remaining time on Standard. Add more time first.`; Standard's text
   `Remaining time: 0min` (zh-CN `剩余时间：0分钟`) with `data-ztts-none`,
   computed `color` Zotero's `--accent-red` (read the variable on the
   pane's root to compare), its buy link shown, starting 6 px after the
   text's right edge **on the same baseline** (a Range over each one's
   text node gives equal `top` and `bottom`, 0 px); Premium's text
   `Remaining time: Unlimited` (zh-CN `剩余时间：不限`), no
   `data-ztts-none`, its buy link `hidden` (200,000,000 credits at 30 a
   minute is past 129,600 minutes). Then answer `{
   standardCreditsRemaining: 114, premiumCreditsRemaining: 80 }` → Test
   connection → Premium `Remaining time: 3min – 8min, depending on voice`,
   its link shown (2.7 minutes at 30 a minute, under 3, written 3min
   rounded up). Then `premiumCreditsRemaining: 1500000` → Premium
   `Remaining time: 34d 17h 20min – 90d+, depending on voice` (zh-CN
   `剩余时间：34天17小时20分钟 – 90天+，视语音而定`), its link `hidden`:
   50,000 minutes at 30 a minute, past 90 days at 10. Assign the kept
   `getAPIClient` back and click Test connection again → item 2's texts,
   both links hidden.
8. **Enable at 0.** Premium off (as item 4), the wrapper of item 7
   answering `premiumCreditsRemaining: 0` → **Enable** beside Premium:
   `Checking…`, then the result `No remaining time on Premium. Add more
   time first.` (zh-CN `高级没有剩余时间，请先添加时长。`), the switch stays
   off (`zotero-tts.zotero-premium.enabled` unchanged), the row reads
   `Remaining time: 0min` in red with its link. The wrapper answering 20
   → Enable switches it on (`Signed in: N Premium voices.`). Restore.

What it may touch: `zotero-tts.zotero-standard.enabled` and
`zotero-tts.zotero-premium.enabled` (back to their values before the run:
the owner's profile had both off on 2026-09-29, so a run turns them on
first and off again at the end),
`Zotero.Sync.Data.Local.hasCredentials` and
`Zotero.Sync.Runner.getAPIClient` (each kept and assigned back), two
`api-key` notifications, the settings window's selected pane (back to
Zotero-OpenReader). Nothing is written to Zotero's account; `tts/credits` and
`tts/voices` spend nothing.

Only a human can judge: how the section reads beside the other sections
— the captions, the remaining-time line under each, the links' color — which the
bridge cannot screenshot (it reaches the main window only).

Not testable live: a real sign-out and a real sign-in started from Log
in (the owner stays signed in); the unit tests in
`test/ui/zotero-credit-rows.test.ts` cover every state, a failed listing
and a stale refresh.
