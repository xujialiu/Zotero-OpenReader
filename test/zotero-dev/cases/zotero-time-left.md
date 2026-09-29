[Checklist index](../README.md)

## A Zotero voice's time left in the player, and its used-up and daily-limit alerts (issue #140)

With one of Zotero's own voices selected, the player shows that voice's
time left at the right end of the voice button, before the chevron, the
name truncated first; the voice list shows every Zotero voice's time left
right-aligned in its row. Zotero's short form (`26m`, `1h 54m`; zh-CN
`26分钟`), gray, red under 3 minutes; nothing past 90 days, when unknown,
or for a plugin voice. When a Zotero voice's credits are used up the
status popover opens by itself: `The time left on Zotero Premium is used
up.` (zh-CN `Zotero 高级的剩余时间已用完。`) with an **Add more time**
link, no Retry, and the voice reads `0m` in red; at Zotero's daily limit
it opens with `You have reached today's limit for the Zotero voices. Try
again tomorrow, or choose another voice.` (zh-CN `已达到 Zotero
语音今天的限额，明天再试，或换一个语音。`), no link, no Retry. Each
opens again every time its error comes back; every other error keeps the
`!` only. Mechanism: `src/read-aloud/player-controller.ts` (`voicesOf`
reads each voice's own `minutesRemaining`, credits over its price;
`alertOf` reads `m.error`), `src/core/time-left.ts` (Zotero's
`formatTimeRemaining`), `addon/content/player-controls.js` (the
`.time-left` spans, the alert opening `openStatus`), the `buy-time`
command calling `Zotero.launchURL`.

Run the baseline first. The owner's profile is signed in, with both Zotero
tier switches off (2026-09-29): a run turns Premium on and off again. Use
`test/fixtures/fixture-a.pdf`. **No real Zotero audio**: every play in
items 4-6 goes through a stubbed client, so no credits are spent;
items 1-3 open the player without playing. Figures below are the owner's
260 Premium credits on 2026-09-29; read the current ones from the
snapshot.

1. **The voice button.** Premium on, the fixture open, the player open
   on Zotero Premium, English (US), `Premium Voice 1` (10 credits a
   minute) → the player's `inspect()` state (`diagnostics` of the
   player) lists that voice with `time` = its `minutesRemaining` rounded
   up in Zotero's form (`26m` for 260 credits) and `low: false`; plugin
   voices have no `time`. In the frame: `[data-pick="voice"]
   .time-left` shown, text the same, its right edge 6 px left of the
   `.chevron` (the picker's gap), after `.value`; the button's title
   `Voice: Premium Voice 1 · 26m`. A 30-credit voice (`Premium Voice 5`
   in en-US) reads `9m`.
2. **The voice list.** Open the voice picker → every Zotero voice's row
   is `.option.has-time` with a `.option-label` and a `.time-left`; the
   `.time-left` right edges are equal across rows (right-aligned), each
   `.time-left`'s text the row voice's `time`. Rows without a time (a
   plugin voice, if the language lists one) have no `.time-left`.
3. **Low.** Keep the voice's provider `premiumCreditsRemaining`
   (`voicesForLanguage[i].provider`), set it to 25 → within 1 s
   (the 250 ms snapshot) `Premium Voice 1` reads `3m` (2.5 minutes,
   rounded up) with `.low`, computed color `rgb(216, 68, 68)`, and a
   30-credit voice `1m`, low too. Assign the kept figure back → the
   times and gray color return.
4. **Used up.** Keep `Zotero.Sync.Runner.getAPIClient` and wrap it so
   its client answers `getReadAloudAudio()` with `{ audio: null, error:
   'quota-exceeded' }`; keep `Zotero.launchURL` and record its calls.
   Press play on `Premium Voice 1` at a sentence whose audio is not
   cached → within 2 s the status popover is open without a click:
   `.error-message` `The time left on Zotero Premium is used up.`, a
   `.buy-time` button `Add more time`, no `.retry`; the voice button's
   `.time-left` reads `0m` with `.low`; the player's state has `alert: {
   kind: 'time-used-up', buy: true }`. Click **Add more time** → the
   popover closes, `Zotero.launchURL` recorded once with
   `https://www.zotero.org/settings/readaloud`. Close any popover, press
   play again → the popover opens by itself again.
5. **Daily limit.** The same wrap answering `{ audio: null, error:
   'daily-limit-exceeded' }`; play → the popover opens by itself with
   `You have reached today's limit for the Zotero voices. Try again
   tomorrow, or choose another voice.`, no `.buy-time`, no `.retry`;
   the voice's time unchanged (item 1's).
6. **Every other error stays as it was.** The wrap answering `{ audio:
   null, error: 'network' }`; play → no popover opens; the `!` shows;
   clicking it shows `Playback failed. Check your provider connection
   and try again.` and **Retry**, no `.buy-time`.

What it may touch: `zotero-tts.zotero-premium.enabled` (back to its value
before the run), the fixture document's voice and whatever voice default
the pick writes (snapshot and restore every `readAloud.*` pref the pick
changes), the voice's provider `premiumCreditsRemaining` (kept and
assigned back), `Zotero.Sync.Runner.getAPIClient` and `Zotero.launchURL`
(each kept and assigned back; no browser page is opened), the player's
open state. Nothing is written to Zotero's account; no audio is fetched
from Zotero.

Only a human can judge: how the time reads beside the voice's name —
its gray and red against the theme, the truncation of a long name.

Not testable live: a plugin provider's own limit (`quota-exceeded` with a
plugin voice selected), which keeps `The provider has reached its limit or
has insufficient credits.` and no alert; `test/player-controller.test.ts`
covers it with every state of the snapshot.
