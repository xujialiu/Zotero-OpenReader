[Checklist index](../README.md)

# Local HTML reading compatibility (issue #228)

The temporary compatibility hook handles local HTML rejected by Zotero's
snapshot classification and HTML whose native Document analysis contains
no blocks. It normalizes an inert copy and uses Zotero's own document
worker. Files, attachment types, and the native analysis cache are not
rewritten. Normal nonempty HTML, PDF, and EPUB analysis stays native.

## Prerequisites and permitted state

- Run [baseline](../baseline.md). This is not a WebDAV test: snapshot the
  folder switch, turn it off, confirm `positionSync().folder === false`,
  and restore its exact value/user-value state after cleanup.
- Use `test/fixtures/html-compatibility/bodyless.html` and `ordinary.html`,
  newly authored fixtures with no external dependencies. The reporter's
  original is an optional local fixture passed by path; never copy it into
  the repository. Use owned PDF/EPUB fixtures for controls.
- Create disposable imported-file, linked-file, and snapshot attachments.
  Snapshot imports may need a disposable parent item. Do not change an
  existing attachment's type. Record content hashes and metadata before
  tests and compare afterward. Linked source files remain untouched.
- Mute through the plugin volume and retain its user-value flag. Snapshot
  every other changed preference privately. Bound real playback to two
  sentences per fixture and use a deliberately selected configured voice.
  Do not play the owner's documents. Keep WebDAV off through all erasures.
- Disabling/re-enabling the plugin for item 7 is permitted; restore the
  verified beta afterward. The first run creates the reusable kit under
  `test/zotero-dev/scripts/html-compatibility/`.

## Checks

1. **Installed hook and original attachment.** Prove the beta's bundle
   identity, not its version alone. `diagnostics.startup()` has no failed
   steps and includes `HTML document compatibility`. Import/open the
   reporter's original, if available, without modifying it. After analysis,
   `diagnostics.htmlDocuments()` has its item with `status: compatibility`
   and `blocks > 0`; the pre-fix result was unavailable. For the supplied
   original on Zotero 10.0.6 the expected normalized analysis is 53 blocks
   and 1,977 characters. Any difference needs inspection, not a blind pass.
2. **Both failure classes and linking.** The authored bodyless HTML as an
   imported file, as a linked file, and as a webpage snapshot each yields
   nonempty segments with resolvable positions and `status: compatibility`.
   `ordinary.html` imported as a local file also uses compatibility; this
   isolates classification from omitted tags. The fixture's script marker
   must not execute during normalization. A script/comment mentioning a
   body tag must not fool the normalization.
3. **Real reading and highlight.** On the authored bodyless file and the
   original, if provided, select a configured voice and start muted
   reading. Verify advancing Engine audio time/source start, active
   segments, and no permanent preparation state. Resolve sentence
   positions against the displayed document and compare normalized text.
   For a voice with real word timing also resolve a sampled word position;
   otherwise verify sentence fallback, not invented word timing. Rendering
   requires the fixture tab and window to be restored. Subjective sound
   and moving-highlight quality remain human checks.
4. **Position.** On the authored fixture pause in the second paragraph,
   close its Reader normally, reopen the same attachment, and resume. The
   active sentence/position matches the saved one. Attachment identity,
   file hash, link mode, and content type remain unchanged. Remove any
   generated position/document-voice records during cleanup.
5. **Native controls and cache.** An ordinary webpage snapshot reports
   `status: native`, not compatibility. PDF/EPUB controls retain their
   native nonempty analysis and have no HTML diagnostic entry. Two direct
   `Zotero.SDT.getPack` calls for the same affected file show a compatibility
   cache hit without changing the native cache file. Source-change,
   concurrent-call, byte-ownership, eviction, and timeout races are covered
   by `test/read-aloud/html-document.test.ts`; do not stall the shared live
   Zotero worker to replay those unit tests.
6. **Failure is visible.** A disposable HTML file with no readable body
   text returns failed preparation, `status: failed`, and the localized
   notice asking the user to close/reopen. No permanent pending diagnostic.
   Check that the hook remains usable for another valid fixture. Input and
   normalized-source limits are 16 MB; the adapter's bounded read is pinned
   by the startup wiring test.
7. **Native comparison and lifecycle.** With fixture Players closed and
   owner sessions handled by the tester rules, disable the plugin. The
   original native `SDT.getPack` is restored: the imported HTML is again
   unavailable and a bodyless snapshot produces zero blocks. Where a
   native voice is available, also verify that the built-in Read Aloud
   cannot obtain segments; report an account/credits blocker separately
   instead of treating it as evidence of this HTML bug. Re-enable/reinstall
   the beta and reopen fixtures: compatibility works again. An idle reader
   with an earlier failed/empty analysis must not retain that failure across
   installation. A real reading must not unexpectedly start on install.
8. **Cleanup.** Run [playback item 3.26](playback.md) and
   [cleanup](../cleanup.md). Remove all disposable attachments/parents and
   their position/voice records, restore every changed preference, confirm
   the original WebDAV folder value/user-value flag, restore the original
   selected tab and geometry, and leave the host minimized. Read errors
   after cleanup, distinguishing new plugin errors from the pre-existing
   Zotero credential-decryption and locale warnings.
