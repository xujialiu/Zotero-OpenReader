[Checklist index](../README.md)

## A Zotero voice's remaining time in the player, and a tier switched off when it runs out (issue #140)

With one of Zotero's own voices selected, the player shows that voice's
remaining time at the right end of the voice button, before the chevron,
the name truncated first; the voice list shows every Zotero voice's time
right-aligned in its row. Rounded up, in the owner's form (`26min`,
`1h 54min`; zh-CN `26分钟`), gray, red under 3 minutes; nothing past 90
days, when unknown, or for a plugin voice.

When Zotero will not read a Zotero voice for its account:

- **Used up** — the tier's credits are 0 (read afresh from `tts/credits`,
  else the plugin's own figure). A voice whose own figure is already 0 is
  not asked for at all. Every open player reading with that tier, in every
  tab, is closed; the tier's switch goes off; a reminder opens over the
  document of the tab where it happened: `Zotero Premium has no remaining
  time and has been switched off. Add more time, then enable it again in
  Zotero-OpenReader settings.` (+ `Reading also stopped in N other tab(s).`),
  with an **Add more time** link and a ✕.
- **Short** — Zotero refused while credits are left: nothing closed or
  switched off; the reminder `Not enough remaining time on Zotero Premium
  for this voice. Choose a cheaper voice, or add more time.` with the link;
  the player's ! reads `Not enough remaining time on Zotero Premium for
  this voice.` with Retry.
- **Daily limit** — the tier that hit it is switched off as for used up;
  the reminder `Zotero Premium has reached today's limit and has been
  switched off. Enable it again in Zotero-OpenReader settings tomorrow.`, no link;
  the credits are not read.
- Every other error keeps the ! with Retry, and nothing is switched off.

A refusal counts when playback fails on it, not at a read-ahead; a voice
being switched to counts at once, and the old voice reads on. Mechanism:
`src/read-aloud/engine/index.ts` (`fetchFor`'s no-request at 0 and the
`refused` dep), `src/read-aloud/zotero-refusals.ts` (the decision, the
closes, the switch), `src/ui/zotero-reminder.ts` (`#ztts-zotero-reminder`),
`src/core/time-left.ts`, `src/read-aloud/player-controller.ts`,
`addon/content/player-controls.js`. `diagnostics.zoteroRefusals()` reports
the last refusal acted on: `{ code, tier, credits, minutes, action,
closed }`.

Run the baseline first. The owner's profile is signed in, with both Zotero
tier switches off (2026-09-29): a run turns Premium on and restores it.
Use `test/fixtures/fixture-a.pdf` and `fixture-b.pdf` in two tabs, plus a
third tab reading with a **free** plugin voice (System voices, or a local
Kokoro): never a paid provider. **No real Zotero audio**: items 4 and 8
rely on the plugin not asking (proved by a wrapped
`Zotero.Sync.Runner.getAPIClient` counting `getReadAloudAudio()` calls),
items 5-7 answer through that wrapper. Keep `Zotero.launchURL` and record
its calls. Read every figure from the snapshot, not from here: 260
Premium credits on 2026-09-29, 259 by the end of that run. **Zotero's own
interface caches a Zotero voice's sentence audio** (built with its audio
cache, `read-aloud/remote-interface.ts`): a sentence already fetched in
that voice replays with no request, so a check that needs Zotero to
refuse plays a sentence, or picks a voice, not fetched before (the
1.16.3-beta5 run logged no `tts/audio` request at all). The manager's 60 s
credits poll writes whatever the wrapper answers into the provider's
figure: reinstall the wrapper per item with the item's answers.

1. **The voice button.** Premium on, fixture A open, the player on Zotero
   Premium, English (US), `Premium Voice 1` (10 credits a minute) → the
   player's state lists that voice with `time` = its `minutesRemaining`
   rounded up, as `<N>min` (`26min` for 259-260 credits), `low: false`;
   plugin voices have no `time`. In the frame: `[data-pick="voice"]
   .time-left` shown, the same text, after `.value`, its right edge 6 px
   left of `.chevron`; the title `Voice: Premium Voice 1 · 26min`. A
   30-credit voice (`Premium Voice 5` in en-US) reads `9min`.
2. **The voice list.** Open the voice picker → every Zotero voice's row is
   `.option.has-time` with `.option-label` and `.time-left`; the
   `.time-left` right edges equal across rows; each text the row voice's
   `time`.
3. **Low.** Keep the voice's provider `premiumCreditsRemaining`
   (`voicesForLanguage[i].provider`), set it to 25 → within 1 s
   `Premium Voice 1` reads `3min` with `.low`, computed color
   `rgb(216, 68, 68)`, a 30-credit voice `1min`, low. Assign the figure
   back → the gray times return.
4. **Used up, never asked.** Fixture B's player paused on a Premium voice
   (a second Premium tab), the third tab's player paused on the free
   plugin voice. In fixture A set the provider's `premiumCreditsRemaining`
   to 0 (kept) and wrap the client so `getReadAloudCreditsRemaining()`
   answers `{ standardCreditsRemaining: S, premiumCreditsRemaining: 0 }`
   and `getReadAloudAudio()` counts its calls. Press play in fixture A →
   within 3 s: `getReadAloudAudio` called **0** times; fixture A's and
   B's players closed (`isPlayerOpen` false), the plugin-voice tab's
   still open; `zotero-tts.zotero-premium.enabled` false; in fixture A's
   document `#ztts-zotero-reminder` with the used-up text and `Reading
   also stopped in 1 other tab.`, a `Add more time` button and a ✕
   (`aria-label` `Close`); `diagnostics.zoteroRefusals()` → `last` `{
   code: 'quota-exceeded', tier: 'premium', credits: 0, minutes: 0,
   action: 'used-up', closed: 2 }`. Click **Add more time** →
   `Zotero.launchURL` once with `https://www.zotero.org/settings/readaloud`,
   the reminder stays; click ✕ → it is gone. Settings → OpenReader →
   Premium: its row reads `Enable`, and `Remaining time: 0min` in red with
   **Add more time**.
5. **Short.** Premium back on (pref), the provider figure back, the
   wrapper answering credits `premiumCreditsRemaining: 20` and
   `getReadAloudAudio()` `{ audio: null, error: 'quota-exceeded' }`. Play
   in fixture A → the player stays open, the pref stays true; the
   reminder with the short text and the link, no other-tabs line; the
   player's ! popover `Not enough remaining time on Zotero Premium for
   this voice.` with **Retry**; `last.action` `short`, `credits: 20`,
   `closed: 0`.
6. **Daily limit.** Close the reminder and the player; the wrapper
   answering `{ audio: null, error: 'daily-limit-exceeded' }`, credits
   above 0. Play, or pick a Premium voice not fetched before (a voice
   being switched to counts at once, so the refusal lands at the pick
   itself, as on 1.16.3-beta5) → the player closes, Premium off, the
   reminder with the daily-limit text, **no** link; `last` `{ code:
   'daily-limit-exceeded', credits: null, action: 'daily-limit' }`
   (credits not read). Zotero Standard's pref untouched.
7. **Every other error.** Premium back on; the wrapper answering `{
   audio: null, error: 'network' }`. Play → no reminder, the pref stays
   true, the player open with the ! and `Playback failed. Check your
   provider connection and try again.` and **Retry**; `last` unchanged
   from item 6.
8. **A voice being switched to.** Premium on, its provider figure 0 as in
   item 4. Fixture A reading (playing) with the free plugin voice; pick
   `Zotero Premium` in the player's first dropdown → the switch fails
   (the voice notice), the plugin voice reads on and fixture A's player
   stays open; `getReadAloudAudio` 0 calls; Premium off; the used-up
   reminder in fixture A, no other-tabs line; `last.closed` 0.
9. **Enable at 0** is `cases/zotero-credits.md` item 8.

What it may touch: `zotero-tts.zotero-premium.enabled` (back to its value
before the run), the three tabs' documents' voices and whatever voice
default a pick writes (snapshot and restore every `readAloud.*` pref and
`reader.readAloudVoices`), the provider's `premiumCreditsRemaining` (kept
and assigned back), `Zotero.Sync.Runner.getAPIClient` and
`Zotero.launchURL` (each kept and assigned back; no browser page opens),
the players' open state, the reminders (closed). Nothing is written to
Zotero's account; no audio is fetched from Zotero.

Only a human can judge: how the time reads beside the voice's name, and
the reminder's look and place over the document.

Not testable live: a refusal on a read-ahead that playback then reaches
(the unit test in `test/read-aloud/engine/engine.test.ts` covers the
wait), a real daily limit, and a plugin provider's own `quota-exceeded`
(`test/player-controller.test.ts`).
