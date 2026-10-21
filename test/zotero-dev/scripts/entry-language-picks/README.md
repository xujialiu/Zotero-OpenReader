# Kit: entry-language-picks (issue #224)

Case: `test/zotero-dev/cases/entry-language-picks.md`. An entry or language
picked in the Player picks no voice: the reading pauses, a draft stands beside
the manager (`read-aloud/engine/voice-pick.ts`), nothing is asked of the
provider until a voice of the draft is chosen and played.

| script | what it checks | what it expects | params |
| --- | --- | --- | --- |
| `224-00-setup.js` | Private pref/user-value snapshot into `Zotero.ZoteroTTSRun.state.ep224`, WebDAV folder off, mute, fixture-a.pdf in, player open and playing on the memory's System en-US voice, audio probe | `webdavFolder: false`, memory a `system::` voice, `seededPlaying` true, `audio.advancing` true, `selectedVoice` = memory voice | `fixtureA`, `fixtureTitle` |
| `224-01-build.js` | Item 1: the build | `startup()` version 1.16.13-beta3, every step ok; `voiceSwitch().mechanism` `engine-handoff-v3` | — |
| `224-02-language-pick.js` | Item 2.1: language en-GB picked while playing | within 1 s: `paused` true, `selected` V, player `{system, en-GB, '', chooseVoice}`, draft `{system, en-GB}`; notice "Paused. Choose a voice to continue." opacity 1, `pre-line`, gone after 5 s | — |
| `224-03-menu-and-quiet.js` | Items 2.2 + 2.3: the voice menu opens by itself; nothing reads meanwhile | popover aria `Voice`, exactly the System entry's en-GB rows, none `chosen`; `.play` disabled; engine voice V, `store.requests` flat, paused | — |
| `224-04-entry-pick-keep.js` | Item 3.3 (language half) + 3.1: repicking the shown language changes nothing; the Fish entry pick keeps en-GB | draft and notice unchanged, no menu; then player `{fish, en-GB, '', chooseVoice}`, voice menu opens with exactly the entry's en-GB rows | — |
| `224-05-entry-pick-empty.js` | Item 3.2: an entry pick that leaves the language empty | draft → fish en-NZ, a voice committed paused, fish reading; the System pick → `locale ''`, draft `{system, null}`, the LANGUAGE menu opens by itself, `.play` disabled | — |
| `224-06-repick-noop.js` | Item 3.3 (entry half): picking the entry the Player shows changes nothing | draft `{system, null}` and notice as they were, no menu opens | — |
| `224-07-refusals.js` | Items 4.1 + 4.2: Play refused under a draft; the next-sentence key | trusted Shift+Space and the Player's `.play`: notice "Choose a voice in the player first.", paused stays, `selected` V; trusted ArrowRight moves `session.position` +1, paused, requests flat | — |
| `224-08-choose-and-play.js` | Items 5.1 + 5.2: a draft voice chosen, then Play | `selected` W, paused, draft null, `chooseVoice` false; document record W `manual: true`; no request until Play; the first clip is W's at the paused sentence from offset 0 | — |
| `224-09-voice-keys-draft.js` | Item 5.3: the voice keys under a draft | next-voice key → the FIRST of the draft's list, paused; previous-voice key → the LAST | — |
| `224-10-close-restores.js` | Item 6.1: close the Player under a draft, reopen | provider/language/voice are the ones before the pick; the document record byte-identical; ends paused, no draft | — |
| `224-11-paused-pick.js` | Item 7.1: a language pick while already paused | `chooseVoice` true, the voice menu opens, and NO "Paused" notice (the rendered element stays opacity 0; the diagnostic's `handoff.notice` only lingers the last kind) | — |
| `224-99-cleanup.js` | Cleanup | every saved pref and user-value flag restored byte-identically (memory last), document record and pulse restored, fixture tab closed (`Zotero_Tabs.close`) and erased (`Zotero.Items.erase`), owner tab back, WebDAV still off, host minimized | — |

## Before you start

- Build and bridge: `zotero_ping`, `zotero_plugin_list` at the manifest's
  `-betaN` (1.16.13-beta3), `diagnostics.startup()` all ok,
  `voiceSwitch().mechanism` `engine-handoff-v3`. WebDAV off before 224-00 and
  re-confirmed after any install.
- Fixture: `fixture-a.pdf` imported by 224-00 (17 segments); its reader index
  and item key live in `Zotero.ZoteroTTSRun.state.ep224` — scripts read them
  from there, nothing is hard-coded.
- State touched: `readAloud.volume` (0 for the run), the memory voice, the
  System/Fish entries through the Player, `readAloud.speed` (224-99 restores),
  the fixture's document voice record. System voices and the Fish entry only;
  never a Zotero Standard/Premium voice.
- Zotero 11 (Firefox 153) gates the AudioContext: `notifyUserGestureActivation()`
  on the reader iframe's document before any scripted Play, or nothing advances.
- Trusted keys go through `nsITextInputProcessor` on the reader's iframe window
  (driving §6); the top layout renders no skip buttons, the next-sentence KEY
  is ArrowRight. From the document's last sentence a forward skip cannot move —
  224-07 steps back two paused sentences first.
- The Player frame is reached through `frame.contentWindow` — `contentDocument`
  is null in this Firefox state (fixed in this kit 2026-10-22).
- Cleanup: 224-99, then `test/zotero-dev/cleanup.md`.

## Limits

- A paused language pick shows no notice and the diagnostic's
  `handoff.notice` keeps the last kind recorded: only the rendered
  `#ztts-voice-notice` opacity is evidence (224-11).
- 224-08's voice menu is auto-opened by the pick's followUp: use it when it is
  open — a click on the voice button toggles that very menu closed.

## Runs

- 2026-10-22, build 1.16.13-beta3, run `2026-10-22-1.16.13-beta3-entry-language-picks`
  (items 1, 2.1) and `-2` (2.2–2.3, 3.1–3.3): PASS. `-3` and `one()` reruns
  (4.1–4.2, 5.1–5.3, 6.1, 7.1): PASS. Script revisions of the continuation run
  (contentWindow frame access; trusted keys in 224-07; the followUp menu in
  224-08; the en-US landing and en-GB draft in 224-10; the rendered-notice
  check in 224-11; Zotero 11 close/erase in 224-99) are the ones in this kit.
- Issue comment holding the full table: the run report of 2026-10-22
  (issues #224/#225 verification).
