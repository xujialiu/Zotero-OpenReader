# Player A/M keeps the current document's choice (issues #117, #153)

[Checklist index](../README.md) · [Scripts](../scripts/player-following/README.md)

Run baseline section 0 and cleanup section 7 under the required test WebDAV
isolation. Use disposable PDF and EPUB fixtures, muted output, both scroll
styles and scrolled/paginated EPUB. Preserve original preferences and their
user-value flags, voice memory, owner readers and positions. Never start
or resume an owner document.

The sandbox sources are `diagnostics.pluginPlayer().readers[].state.automatic`
and `diagnostics.autoScroll()`. The visible A/M text, tooltip, aria-label and
aria-pressed must agree with automatic/following after the normal 250 ms
Player poll. Record fixture identity, audio state and actual viewport/page
position. Native position-lock fields are intentionally false while the
plugin owns following; they are not the A/M oracle. The retired
`autoScrollEnabled` and `keepFollowingWhileVisible` preferences are not
oracles either and must not control the new behavior.

## 1. Manual browsing and recovery

- With the new default on, open a fixture and start reading: A. Pause
  without navigating: still A and no page movement.
- Use trusted wheel or PageDown input: M immediately, whether the current
  sentence is visible, clipped or outside. Later visible/offscreen sentences,
  word updates, viewport reentry, pause/resume, focus and mode changes remain
  M and issue no automatic positioning. Repeat during paused reading.
- Normal playback in A still follows according to the chosen scroll style.
  Automatic scroll notifications, ordinary clicks and zoom do not enter M.
  Retain whole-sentence and real-word geometry coverage from auto-scroll.

## 2. Explicit manual mode and isolation

- Click A: M. Later sentences, pause/resume and layout/focus changes leave M.
  Any outstanding one-time return is canceled by fresh manual input.
- Select M in one disposable document; another document retains its own
  state. Split views within one document share the same choice. Unit tests
  cover cancellation of pending positioning across split views.
- Stop/close the Player and reopen it in the same document tab: retain M.
  Switching tabs also retains it. Close the document itself and reopen it:
  use the current default, without a saved per-document A/M override.

## 3. Explicit recovery and one-time positioning

From both clicked M and gesture-induced M, verify playing and paused:

- Click M, press Shift+M, or press Shift+Enter: locate the current sentence
  and display A. Shift+M from A instead enters M and stops following.
- Shift+R: locate the current sentence once and keep M. Subsequent sentences
  do not scroll; the action must not merely flash M after enabling follow.
  From A, Shift+R locates once and retains A.
- Previous/next sentence and paragraph in M change the segment but leave
  the viewport/page unchanged. In A they locate the new sentence and keep A.
- All positioning/toggle/skip actions keep paused audio paused. Resume
  through the actual Player and Shift+Space keeps the prior A/M; only A
  positions on resume. Paginated EPUB locates the sentence's page, subject
  to document boundaries and oversized-sentence limits.

## 4. Cleanup and evidence limits

Close fixture readers before erasing attachments. Restore exact prefs/user
flags, voice memory, volume, sync switches, local positions/bookmarks and
original tab under isolation before restoring owner destinations. Confirm
no pending writes, fixture records or new relevant console errors. Do not
restore an owner Player by starting it.

Separate trusted key/button execution from injected state progression and
positioned viewports. Observe real audio advancing for continuous-follow
checks; report suspended output as a limitation, not a pass. Smoothness and
comfort remain human judgments. Old kit PASS rows are historical evidence,
not verification of #153. Retain the scripts actually run in this case's kit.

## 5. Default choice and settings

- The default radio group selects Auto-scroll on a fresh install. Choose
  Manual-scroll, open new
  PDF/EPUB tabs and start reading: M, with no automatic jump. Existing tabs
  keep their choices. Choose Auto-scroll again: only later opened tabs
  start in A. Closing/reopening a document uses the new default.
- Default on/off and the scroll-style controls are independent. Their help
  explains scope. The old keep-following checkbox is absent. Neither
  default changes nor settings sync may change existing tab intent.
- Settings backup/restore and shared-settings round-trips include
  `readAloud.defaultAutoScroll`. Tab A/M is absent from serialized settings.
  Schema round-trips are unit-covered; verify the actual radio-group binding
  and live tab isolation, reporting live sync separately if not exercised.

## 6. Shortcut settings and labels

- The existing return binding defaults to Shift+Enter and is labeled
  Go to reading position and switch to auto-scroll. Existing custom return
  bindings keep that action. The full label wraps without clipping.
- Go to reading position defaults to Shift+R; Switch A/M to Shift+M. All
  three support recording, clearing, restoring defaults and settings backup.
- Shift+A still changes Scroll at every sentence / Scroll when outside the view,
  with its existing toast, without changing A/M. Held follow keys act only
  once and typing in editable fields is untouched.
- Return keys fall through without an open reading session. Switch A/M
  works while the Player is open, including while paused. Verify real key
  routing, not only direct calls to the underlying actions.

## 7. Web snapshots and Reading Mode (issue #188)

Since #188 the plugin's DOM follower owns following in every DOM view: EPUB,
web snapshots and Reading Mode. Use the snapshot of
`test/fixtures/return-key/` imported as a real snapshot (the import and
`Zotero.SDT.ensure` steps are in [limitations](../limitations.md)) and a
disposable PDF fixture with Reading Mode switched on from the reader's
Appearance popup. The oracle is `diagnostics.autoScroll()`: the reader's row
reads `kind: "snapshot"` (or `"reading-mode"` while Reading Mode is on),
`patched: true`, and `following` equal to the Player's A/M; the page's
`scrollY` is read beside it. Default scrolling = Manual-scroll for the M
rows, Auto-scroll for the A rows (snapshot and restore the pref).

1. **Attached.** Open the snapshot and its Player: the row is `kind:
   "snapshot"`, `patched: true`. Switch Reading Mode on in the PDF fixture
   after its Player is open, then start or resume reading: within one
   sentence the row is `kind: "reading-mode"`, `patched: true`, with no
   reopen of the Player.
2. **Shift+R in M.** Read the snapshot in M, scroll away by wheel, press
   trusted Shift+R: the page returns to the spoken sentence once; over the
   next three sentences `scrollY` does not move, the Player and
   `following` stay M. (Before #188 the page followed every later
   sentence.)
3. **Stop and play, pause and resume.** In M, stop and play again: no page
   movement from the first sentence on. Pause with the sentence on screen
   and resume: still no movement, still M.
4. **A manual scroll shows as M.** In A, scroll by wheel: the Player turns
   M at once and `following: false`.
5. **A follows by the scroll style.** In A, each scroll style places the
   sentence at the reading line as on a scrolled EPUB (`last.reason` in the
   row), and the docked Top bar does not cover it.
6. Steps 2-4 again in Reading Mode on the PDF fixture. The hidden PDF view
   under it is not checked.
7. **Cleanup.** Close the fixture readers, restore Default scrolling, delete
   the imported snapshot; no new `can't access dead object` or plugin error.

A snapshot whose page scrolls inside an element of its own (not the
window) is placed through Zotero's navigation instead (`last.reason:
"element"`); it is unit-tested, and live only if such a page is at hand.
