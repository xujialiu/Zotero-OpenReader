# Scripts: The OpenAI section split into OpenAI, Xiaomi MiMo and OpenAI Compatible (issue #113)

[Case](../../cases/openai-split.md) · [Checklist index](../../README.md) · [Tester workflow](../../../../.agents/zotero-tester.md)

## Scripts

For the provider checks (case items 2–5), take the standard baseline and
run the scripts in order. Use a disposable profile with both tested
providers configured and off. Keep WebDAV off. Before muting, save the
volume, voice memory, native voice list and provider switches, including
their user-value flags. Restore and compare them after `05` closes the
settings window.

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `02-pane-structure-item2.js` | Item 2: opens the pane fresh (driving notes §1), every `groupbox` id in DOM order, the legacy menulist/groupbox gone, the three sections' headings/links/field ids/placeholders/buttons | 19 groupboxes, alphabetical order, no `ztts-openai-server`/`ztts-provider-openai` | — |
| `03-test-connections-item3.js` | Item 3: Test connection for openai-official, mimo, compatible, and compatible with its address emptied then restored — each click wrapped in an `http-on-modify-request` observer (masked host tag + path + method + `Authorization`/`CF-Access-Client-Id` presence). Reuses `02`'s open pane | The case's two corrected failure strings (below); `mimo`/`compatible`'s real "Connected…" text once they hold working credentials | — |
| `04-enable-verify-item4.js` | Item 4: enables both providers SEQUENTIALLY (see Limits — two live bugs fixed), `providerTiers()` labels, fields locked, the voice browser's tier column and each provider's voice list, then a fixture (`fixture-b.pdf`) proving the fallback debug line + header separation for one voice per provider (the #108 handoff: `selectTier` then `selectVoice` then resume/poll/pause, `Components.utils.waiveXrays`) | Both `.enabled` true, fields disabled, tier column has both entries at the documented counts, both fallback lines, correct header presence per provider | — |
| `05-cleanup-restore.js` | Close and erase the fixture, disable the two test providers and close Settings | Both providers off and the fixture gone before restoring the baseline | `item4Fixture` |

## Before you start

- Confirm the candidate version and all startup steps through the baseline.
- Fixture: `fixture-b.pdf`, imported fresh in `04`, erased in `05`
  (baseline.md's general fixture procedure). `readAloud.memory` is set to
  the first voice immediately before `Zotero.Reader.open` (the
  `voice-switch` kit's `kokoro-02-open-fixture.js` pattern), then restored
  verbatim; `reader.readAloudVoices` is restored too (see Limits).
- **A player open anywhere blocks item 4's Enable clicks by design**
  (reading-guard.ts): confirm with `Zotero.Reader._readers[i]
  ._internalReader._readAloudManager.active` (paused counts) before
  attempting one; the owner's player is closed by the tester itself with
  `toggleReadAloudPopup(false)`, noted in the report (settled 2026-09-16).
  `04`'s OWN fixture counts too, which is why `05` closes it before
  attempting a Disable (see Limits).

## Limits

- **Two live script bugs this run (fixed in the kit; neither is a plugin
  bug), same root cause**: `onToggle`'s (ui/provider-rows.ts) own first
  `await refuseWhileReading(...)` runs BEFORE `hold()` sets the button
  disabled/"Checking…", so a poll reading immediately after `toggle.click()`
  can see the unchanged pre-click state and wrongly conclude the check
  already finished — hit on `04`'s Enable (read stale leftover text from a
  previous Test-connection click; a SECOND `refuseWhileReading` right
  before the pref write then raced this script's own fixture becoming
  active and silently refused mimo's write) and on `05`'s original
  Disable-before-close ordering (the reading-guard dialog it never noticed
  was orphaned when the settings window closed mid-await, leaving both
  switches on). Fixed by waiting for a "started" signal before "settled",
  and by closing the fixture before attempting any Disable.
- **The #108 voice-pick handoff needs an explicit `m.selectVoice(id)`
  before the resume/poll/pause dance** (`04`'s first draft omitted it and
  timed out every time, confirmed via the debug log: "kept the controller:
  the voice list landed on the voice already playing" — nothing had asked
  it to change). Fixed; follows `scripts/provider-tiers/04-per-provider-memory.js`'s
  proven pattern.
- **A second same-tier voice pick can miss the 15 s window**: switching
  compatible away to mimo and back, then picking a SPECIFIC second
  compatible voice (`Emily.wav`), did not land within 15 s even though the
  underlying mechanism (fetch, debug line, headers) fired for whichever
  voice stayed selected (`Abigail.wav`) — matches
  `provider-tiers/04-per-provider-memory.js`'s own documented finding about
  the same handoff's two commit paths. Report whichever voice actually
  produced the evidence rather than failing the item over the exact name.
## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-16 (first) | 1.12.12-beta (buggy, 3c40365) | issue #113 verification reply | 1 first install PASS / second install FAIL (critical), 2 PASS, 3 mechanism PASS (2 case corrections), 4/5 NOT TESTABLE (owner's player open) | Found the migration-reruns bug; all five scripts kept |
| 2026-09-16 (re-run) | 1.12.12-beta (fixed, 7f7d953) | this run's reply (issue #113 verification) | 0 PASS, 1 PASS (both installs byte-identical, fix holds), 2 PASS, 3 PASS (mimo/compatible now "Connected…", message corrections confirmed), 4 PASS (both enabled, 28/9 voices, both fallback lines + header separation), 5 PASS (all state restored byte-exact) | Two script bugs found and fixed live (see Limits); kit fully reusable |
