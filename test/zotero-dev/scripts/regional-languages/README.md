# regional-languages — issue #223 (every region a language of its own)

Run with the kit runner (`test/zotero-dev/scripts/_shared/README.md`):
one `zotero_execute_js` loads the runner and calls `start()` with this
kit and the run id, later calls collect via `Zotero.ZoteroTTSRun.api.wait`.
`stopOnError` is on. Scripts 00–03 and 04–09 are independent of each
other only in that order: 04 needs the fixture's Player open (03), and
07 needs 04/06's Chinese picks settled. The run's private baseline
(`Zotero.ZoteroTTSRun.state.prefs`, `.window`, `.ownerReaders`) is written
by 00 and read by 10 — never rerun 00 (it would snapshot the run's own
temporary state) and never `reset()` the runner before 10 has verified.

| script | what it checks | what it expects | params it reads |
| --- | --- | --- | --- |
| 00-baseline.js | snapshot: the five prefs (+user-value flags), switches, window, owner readers, debug store, error ring (27), documentVoices (58 records), position rows (75); WebDAV folder off; mute | `webdavOff` true, `muted` true; volume was already 0 (user-set), webdav.enabled false without a user value | — |
| 01-install-proof.js | build identity: `startup()` on 1.16.12-beta7, bundle markers | every step ok; `providerPick`, `zoteroKeepsRegion`, `stagedExact` true; folder still false | — |
| 02-language-column.js | the voice browser's language column vs the Player's (2.1–2.3) | System: Chinese (China) 9 / (Hong Kong) 1 / (Taiwan) 9 (en-US names); fixture reader `same: true`, `zotero` holds one `zh`; Azure/Premium columns empty (both off) | — |
| 03-fixture-open.js | import fixture-a.pdf (`ztts <date> #223 A`), open its Player muted+paused, record its document voice | reader ready ≤24 s; memory not metered; manager paused on Samantha (en-US); `user/<key>` record saved | `fixtureTitle`, `fixturesDir` |
| 04-pick-system-zhcn.js | 3.1: System entry, then Chinese (China) via the language dropdown, then Tingting via the voice dropdown | zh-CN staged (`staged an exact zh-CN voice`); Tingting selected and `zh` remembers it — a paused voice pick pends as the Engine's handoff, so one muted play-pause commits it; paused throughout | — |
| 05-pick-zhHK.js | 3.2: Chinese (Hong Kong) via the language dropdown | `zh-HK` on Sinji ≤1 s; `staged an exact zh-HK voice`; playerVoiceList `patched: true`, offered 1 < compatible 19 | — |
| 06-pick-zhTW-zhCN.js | 3.3: Chinese (Taiwan), then Chinese (China) | each ≤1 s on a voice of its own locale, staged lines, paused | — |
| 07-voice-keys-zhTW.js | 3.4: Shift+/. cycle inside zh-TW only, wrapping both ways | read on `voiceSwitch()`: the paused handoff's pending target walks the 9 zh-TW voices; a press onto the selected voice cancels back onto it (wrap up); selected never moves while paused | — |
| 08-provider-switch.js | 4.1 Azure zh-HK switch (NOT TESTABLE, Azure off; unit-tested); 4.2 English (United Kingdom) System↔Fish | en-GB held both ways, voice returns (Daniel), no `for the provider pick` line; 1 Fish sample | — |
| 09-english-regions.js | 5.2 first (Fish generic en menu — read-only when the Player already sits there; a paused pick spends a Fish request), then 5.1 System English regions | 5.2: 45 voices all `en`, none `en-US`, offered 45 < compatible 125; 5.1: en-US/en-GB/en-US hold (Albert/Daniel/Albert), generic `en` not offered on System | — |
| 10-cleanup.js | 6: close the fixture Player+tab, erase the item, restore the documentVoices branch (after the prefs settle — the readAloudVoices write spreads), restore the five prefs byte-identically (memory LAST), positionSync agrees, debug store back, owner's tab, window, minimized | rows 75; records 58; every pref `has`+value matches; `folder: false`; owner reader untouched | — |

Before you start

- Bridge up (`zotero_ping`), build 1.16.12-beta7 installed (`zotero_plugin_list`,
  `startup()` all ok). Zotero 11.0-beta.1, locale en-US.
- Fixture: `test/fixtures/fixture-a.pdf`, imported as a standalone attachment by 03.
  The Player must open in the selected tab, muted (`readAloud.volume` 0 — 00 mutes;
  the baseline volume was already 0).
- The owner's reader ("The Optical Nature of Myopic Changes in Retinal Vessel
  Caliber", paused) is never touched; the fixture's session is the run's own and
  is closed with `toggleReadAloudPopup(false)`.
- Azure and Zotero Premium are off; never switch a provider on. Fish: listing
  only, ≤3 Fish samples a run (entry/language picks on a paused Player each
  request one). System voices are free.
- A paused **voice** pick does not move `selectedVoiceID` until Play (the
  #108 handoff); a paused **language** pick settles at once (native). Evidence
  for the keys while paused is `diagnostics.voiceSwitch()`'s report, not the
  manager's selection.
- Trusted key presses need the iframe focused (`beginInputTransactionForTests`)
  and the key event must carry its own `shiftKey` — a prior Shift keydown does
  not set it on a synthesized event.
- Cleanup: 10 restores everything from the 00 snapshot and confirms; the
  runner `reset()` happens only after 10's result is verified.

Limits

- 04 originally read the pref as `map.voices.zh` (shape is `{<lang>: entry}`),
  clicked a possibly re-rendered row, and masked a failed pick by comparing the
  entry to the state instead of the chosen target — fixed: Tingting targeted,
  pick retried on a fresh query, `ok` requires the chosen voice selected, and
  the paused-handoff commit (one muted play-pause) added.
- 07 originally sent Shift+. without `shiftKey` on the key event (never
  matched) and then read `selectedVoiceID`, which a paused handoff never
  moves — fixed: shiftKey on the event, evidence from `voiceSwitch()`'s
  pending/`last.to`, stale pending cancelled with a `setSpeed` no-op.
- 09 originally stepped System to generic `en` (macOS offers none) and threw
  (`safea` undefined), leaving the Player on Fish's generic English — fixed:
  negative check for generic `en` on System, `safea` defined, 5.2 reads first
  and picks only when needed.
- 10 originally called `Zotero.Reader.close` and `Zotero.Items.eraseTx` —
  neither exists in Zotero 11 (`Zotero_Tabs.close`, `Zotero.Items.erase`) —
  and compared a no-user-value read against the snapshot's value; fixed.
- 05 originally picked its `playerVoiceList` row by title/first (rows carry no
  title and follow the readers' order) — fixed: the fixture reader's index.

Runs

- 2026-10-19, 1.16.12-beta7, issue #223 ([table](https://github.com/xujialiu/Zotero-OpenReader/issues/223#issuecomment-6253782187)):
  items 1, 2.1, 2.2 (NOT TESTABLE — Azure and Premium off), 2.3 PASS (run
  `2026-10-19-1.16.12-beta7-regional-languages`; 00–03, 05, 06, 08 there);
  items 3.1, 3.4 PASS (`…-rerun2`, 04 there; 07 as `one-07`); 4.2, 5.1, 5.2
  PASS (`…-rerun`, 09 there); 4.1 NOT TESTABLE (Azure off; unit-tested).
  10 PASS (one() on 2026-10-19; the first execution hit the Zotero 11 API
  renames above and was re-run after the fix).
