# Kit: entry-language-picks

[Case](../../cases/entry-language-picks.md) · [Runner](../_shared/README.md)

| Script | Check | Expected measured values | Params |
| --- | --- | --- | --- |
| `232-00-baseline.js` | Read-only build/owner gate | exact expected version, startup failed `[]`, no owner session, minimized host; no writes | `expectedVersion` |
| `232-01-isolate.js` | Freeze exact-leaf snapshots before mutation | seven pref snapshots including defaults/user flags, owner-record set and row baseline; folder already false; mute 0, only native `en` isolated | — |
| `232-02-fixture.js` | Import one fresh owned PDF | no duplicate title, frozen item/key identity | absolute `fixtureA`, `fixtureTitle` |
| `232-03-plant.js` | Enable only System, plant missing voice | controlled native `en`, fresh fixture key, missing manual record, pulse unchanged | — |
| `232-04-open.js` | Independent plant and idle observation | saved missing ID/manual via sandbox diagnostic, inactive, no reading, no available remembered System target | — |
| `232-05-draft.js` | Actual Player Provider/Language commands | `{system, en-US, '', chooseVoice:true}`, missing record retained, W distinct from first native voice V | — |
| `232-06-choose.js` | Actual Player voice commit | selected/Player/native `en`/saved record all W, manual true, no draft; immediate fixture pause; console changes reported, not treated as failure by themselves | — |
| `232-99-cleanup.js` | Exact generic rollback | owned fixture only; value/type/user equality, owner set unchanged, rows at baseline; memory last; folder still isolated | — |

Historical 224 scripts are unchanged. Do not mix the two sequences or run
this entire folder: some historical scripts select Fish Audio.

| Script | Check | Expected measured values | Params |
| --- | --- | --- | --- |
| `224-00-setup.js` | Historical System/Fish setup | muted, fixture open, moving System audio; snapshot in `state.ep224` | absolute `fixtureA`, `fixtureTitle` |
| `224-01-build.js` | Historical build | 1.16.13-beta4, startup ok, `engine-handoff-v3` | — |
| `224-02-language-pick.js` | Language while playing | paused, old voice kept, empty en-GB draft, 5 s notice | — |
| `224-03-menu-and-quiet.js` | Draft menu and requests | exact en-GB rows, none chosen, Play disabled, requests flat | — |
| `224-04-entry-pick-keep.js` | Entry keeps exact locale | Fish en-GB draft, voice empty | — |
| `224-05-entry-pick-empty.js` | Entry lacks locale | locale/voice empty, language menu opens | — |
| `224-06-repick-noop.js` | Shown entry repick | no draft/notice/menu change | — |
| `224-07-refusals.js` | Play/Skip under draft | Play refused; Skip moves one, paused, requests flat | — |
| `224-08-choose-and-play.js` | Active draft commit/Play | W manual/paused, no request until Play, sentence from offset 0 | — |
| `224-09-voice-keys-draft.js` | Voice keys | first/last draft voice, paused | — |
| `224-10-close-restores.js` | Close draft/reopen | original choice, document record unchanged | — |
| `224-11-paused-pick.js` | Already-paused language pick | menu opens, no new Paused notice | — |
| `224-99-cleanup.js` | Historical cleanup | snapshot equality, fixture removed, owner tab/minimized | — |

## Before starting the 232 sequence

- The driver snapshots and isolates WebDAV **before install**, proves the
  supplied XPI/bundle identity, and owns restoration of its original
  WebDAV/debug state after the case. These scripts require folder=false
  and never write the folder switch or debug flag.
- Use `_shared/run.js` with explicit script names, fresh runner state and
  `params.expectedVersion`. Inspect each returned `ok` before dispatching
  the next step; a JSON failure is not necessarily a thrown runner error.
  Never resnapshot after mutation or reuse legacy `ep232` state.
- Only free local System voices and one new `test/fixtures/fixture-a.pdf`;
  no owner Player/document operation, paid voice, dialog or restart.
- Snapshots remain private in `state.ep232`; do not print maps. Cleanup
  requires the complete schema and restores captured values, not guesses.
  Registered defaults without user values are valid snapshots.
- Case mutations: System switch, volume, native en memory, memory/speed
  and fixture record/pulse. Global default and owner records are read-only.
- Chinese-region and Global-speed permutations are unit coverage. The
  idle ingress retains native activation; it is not the paused-active
  no-audio-before-Play path. Pronunciation/motion remain human judgments.

## Limits and execution status

- Current 232 baseline/cleanup revisions executed **offline** in
  `test/idle-draft-kit.test.ts`: exact keys, defaults/user flags, immutable
  baseline, wrong-build/missing-snapshot gates, no owner erasure, observer
  overwrite detection and actual native-entry reads. Other repaired guards
  and plant/commit paths have bounded offline tests and syntax checks.
  No complete live replay of these repaired revisions is claimed.
- The original live 232-01 and native-entry reads appended a dot to leaf
  names. Their snapshots and initial cleanup PASS were invalid. The
  one-off recovery's hardcoded values were removed from reusable scripts.
- Earlier checks assumed no native map because of that bad read; this was
  not a fresh profile. The repaired setup snapshots the real map and
  temporarily clears only en. Cleanup restores its exact original bytes.
- A timestamp increase is not error attribution. Scripted picks produced
  autoplay-gate warnings; source-less installation exceptions remain
  unattributed. The driver reviews bounded safe source/line evidence.
- System listing lands on popup open; `m.tiers` is a Set. Reader iframe
  access uses `contentWindow`. Erasure is `item.eraseTx()`.

## Runs

- 2026-10-22, 1.16.13-beta3/beta4: historical 224 items 1–7 passed after
  executed harness revisions. Setup's initial single audio probe was
  insensitive at a clip edge; later suspended-device probes were machine
  limits. Reports: [#224](https://github.com/xujialiu/Zotero-OpenReader/issues/224#issuecomment-6323563404),
  [#225](https://github.com/xujialiu/Zotero-OpenReader/issues/225#issuecomment-6323564014).
- 2026-10-24, 1.16.16-beta2, #232: nonfirst System Ava selected/displayed/
  saved manual, no draft; correct-leaf recovery observation confirmed
  native en=Ava. V was Albert. An earlier pass accidentally ran the old
  beta before installation; it was not an authorized planned comparison.
  The tester timed out; original volume/native-en values were lost because
  of the snapshot defect. Two fixtures were removed, 79 owner records
  matched, Position rows returned to 78. Paused-active control was not live.
- Owner explicitly adopted a **new** final baseline: volume 19/user,
  System true/user, native en=Ava and pulse 208 retained. The bounded
  adoption operation verified unchanged native-map/owner/default hashes,
  79 records, 78 rows, two inactive owner readers and folder=false. This
  does not establish exact pre-run restoration. Source remains 5096319;
  offline kit repair did not reinstall or repeat synthesis.
- Full incident/recovery and closing record: [#232](https://github.com/xujialiu/Zotero-OpenReader/issues/232#issuecomment-6385282454).
