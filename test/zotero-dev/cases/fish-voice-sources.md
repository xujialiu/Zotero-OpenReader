[Checklist index](../README.md) · [Scripts](../scripts/fish-voice-sources/README.md)

## 1b. Fish Audio voice sources (issue #91)

Run after the baseline with a working Fish Audio API key. Preserve the
key in Zotero only, never in a tool argument or file. Save and restore
`fish.enabled`, `fish.voices`, `fish.includeOfficial`, `fish.includeOwn`,
`fish.includeManual`, `fish.model`, remembered/default voices, and any
sync switches suspended for the run. Use one fixture and leave the owner's
reading sessions alone. Source switches and the Model IDs field are the
final scope; the earlier draft's community search is not shipped.

1. **Official source.** Empty manual field; official on, own/manual off.
   The catalog and a fresh fixture player contain the Fish Official
   account's voices plus `fish::mul/default`. The account is
   `d8b0991f96b44e489422ca2ddf0bd31d`; its live list on 2026-09-12 had 338
   unique, trained TTS voices, ten tagged `zh`, returned in four pages.
   Compare the current API's count rather than pinning 338 forever. No
   unrestricted community-discovery request belongs to automatic listing.
2. **Own and manual sources.** Test the three sources independently and
   together. With an account that owns no models, own-only gives Default.
   Enter one valid Model ID absent from the official list: manual-only
   gives it and Default; toggling manual off retains the field verbatim
   and hides the extra voice, and back on restores it. Source settings
   survive settings reload and backup/restore.
3. **Union and all-off.** Enter an official voice's ID manually, enable
   official+manual: one entry per raw model ID. Turn official off: the
   manual copy stays; turn manual off as well, with own off: only Default.
   A disabled source contributes no cached voices or stale notices.
4. **The controls.** The shipped defaults are Official voices on, Your
   voices off and Manual voices off; stored choices take precedence.
   The three source switches lock while Fish is enabled and unlock after
   Disable. The three sources occupy one horizontal row with a normal-weight
   caption. Voices (Model IDs) accepts multiple IDs; Model IDs in that
   caption links to discovery, and the neighboring `?` includes
   `https://fish.audio/app/discovery/` and explains that Model ID identifies
   a voice. Existing pasted links still work. There is no separate Find
   Model IDs link or Refresh Fish list button. Enable/Disable and Test
   connection follow the three source switches at the end of Cloud;
   Local includes `github.com/fishaudio/fish-speech` in its heading.
   By eye: labels, field, and help fit the pane with no clipping; there is
   no in-plugin community search panel.
5. **Reading guard.** Enabled sources are locked and ignore synthetic
   commands. Disable retains the provider's existing reading guard: with
   the fixture's player open, it asks to stop reading. Cancel leaves the
   provider and source choices unchanged; agree closes the fixture player
   before unlocking the configuration. Never accept a dialog naming the owner's tabs;
   report that positive path as unit-tested when a protected user session
   prevents it from running live.
6. **Refresh and cache.** A repeated catalog call reuses the source
   snapshots; Enable or Test connection loads again. `diagnostics.fishVoices()`
   returns only `cacheHits`, `loads`, `cachedAccounts`. Reuse increases
   hits without increasing loads; a connection check increases loads. Turning a
   source off and on takes effect even with its snapshot cached. Await
   `diagnostics.fishVoices(true)` to list through the actual provider and
   report `sources`, `count`, `ids`, and `notices` beside the counters.
   Compare the IDs in Zotero and return counts/small samples to the tool,
   never dump the entire list. This proves filtering without starting
   playback or disturbing a protected paused reader. No key or account
   identifier is returned by the diagnostic.
7. **Synthesis.** One existing Fish voice on the free model still returns
   real word timings on the fixture. The connection check uses Default
   to verify synthesis. Only one small sample per live check; sound
   quality and the highlight's pace are human checks.
8. **Deterministic cases stay in unit tests.** Whole-operation timeout
   and transport abort, retry after a hung shared load, no late pages or
   cache overwrite, stale notice persistence across provider instances,
   auth errors/account isolation, all eight source combinations, and
   canceled source changes use controlled dependencies. Do not break the
   owner's network or replace their credentials to manufacture failures.
9. **Restore.** Restore prefs, memory last; erase the fixture, restore the
   debug store, and report byte-identical state and no new plugin or
   dead-object errors. The beta build may remain installed for the owner.

10. **Manual IDs stay restricted across refreshes (issue #216).**
    This item needs no working key or synthesis. Privately snapshot Fish's
    switch, key, source choices and IDs; keep WebDAV off and close only
    affected Players under the baseline rules. With Fish off and Manual
    voices off, the ID input must be disabled. Use an empty key so Test
    connection and Enable fail locally without a paid request. After each
    failure, the ordinary fields are editable, but IDs remain disabled.
    Send the account `api-key` notification without changing the account:
    IDs must still be disabled. Turn Manual voices on: IDs become editable;
    turn it off: the saved text is retained and disabled again. Restore all
    snapshots privately, reporting equality only.

    The held-check/source-observer interleaving and synthetic source/model
    commands are covered by `test/ui/fish-provider-state.test.ts`, without
    a live Fish request. A source refresh during a check may never unlock
    any field. Once a failed check ends, the Manual voices restriction must
    be reapplied. For issue #230, this test initializes only the Provider
    settings module used by the pane: no caller-supplied Fish lock, unlock
    callback, follow-up repaint or separate cleanup. External source/Model
    writes, restore verification and disposal of the whole group are tested
    there too. The real pane wiring is also exercised by
    `test/ui/prefs-pane-state.test.ts`; do not initialize the pane twice.
    Verified on 2026-10-20, 1.16.13-beta / Zotero 11.0-beta.1: all item-10
    expectations passed without a paid request. The revised script closed
    Settings before its finally-based restore, verified values and
    user-value presence, and discarded its private key snapshot.

**Verified on 2026-09-12, 1.12.2-beta2 (Luna-max tester).** Startup
20/20; `(official, own, manual)` counts `000=1, 001=2, 010=1, 011=2,
100=339, 101=340, 110=339, 111=340` on an account with no own models and
one manual ID. No duplicates or notices; official/manual overlap stayed
one entry; repeated listing kept loads at 3 while hits rose 24 to 27.
Three checkboxes editable; help URL present; `blank=[]`, `questionless=[]`;
no horizontal overflow. Default connection probe: 340 voices, synthesis
works. Guard Cancel passed for source and refresh. Positive stop/refresh,
backup/restore and fresh playback stayed unit-covered because the user's
paused reader was protected. Every changed setting and reader state was
restored; Debug storing off, auto-upload restored on; no new plugin or
dead-object error. Full evidence: [2026-09-12 notes](../../../notes/NOTES_2026-09-12.md).
