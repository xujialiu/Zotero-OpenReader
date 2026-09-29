# Scripts: The settings pane: its layout, the About group and the help icons

[Case](../../cases/settings-pane.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

Item 1.2's issue-#158 sentence has its own script (`03`); the rest of 1.2
(screenshots, the About group, the button pairs) and 1.4 are still
manual/未运行. The first two scripts are what the zotero-tiers/#111
verification brief's C1–C4 (issue #112: the pane's Fish split, a site
link in every provider heading, alphabetical sections) actually ran —
not yet a numbered item of this case.

## Scripts

| Script | Checks | Expects | Reads |
| --- | --- | --- | --- |
| `01-heading-links.js` | C1 every `groupbox` id in DOM order; C2 the 6 linked headings (Azure, Cloudflare, Fish Audio, Fish Speech, Kokoro-FastAPI, Speechify) and the 3 unlinked (OpenAI, System, Zotero); C3 the Azure heading's computed style + one-line check; C4 the two Fish sections' own fields and enabled-state locking | 17 groupboxes (not 16 — see Limits); every linked heading's `href` exactly `https://<host>`; `fontSizeMatches`/`fontWeightMatches: true`, `oneLine: true`; `matchesFishEnabledExpectation`/`matchesFishSpeechDisabledExpectation: true` | — |
| `02-screenshots.js` | A human check of C3's look: two PNGs, the pane's top and the Zotero section | Files written under `.tmp/zotero-dev/screenshots/`; a human looks | `tmpDir` |
| `03-help-shrink-wrap.js` | Item 1.2, the issue #158 sentence: the plugin sheet's `label.ztts-help[value]` rule carries `flex-shrink: 0` and no `font-size`; every `.ztts-help` computes `flex-shrink: 0` and a 16.25 px square; the `?` after the Zotero note stays 16.25 × 16.25 px while the note is made to wrap (its text set three times over), then the note is restored with `document.l10n.translateElements` | `allFlexShrinkZero: true` (58 helps on 1.16.2-beta6, all 16.25 × 16.25); `noteGrewTaller: true`, `helpStillSquare: true`; `restored.textRestored: true` with the note's box back to its before size | — |

## Before you start

- Build: `zotero_plugin_list` + `diagnostics.startup()` first (done
  directly, per the tester workflow, not a script here).
- Opens and closes the settings window itself (`01`; `03` is self-contained
  the same way — it opens the pane fresh, polls the plugin's own sheet into
  `doc.styleSheets`, and closes the window at the end either way); `02`
  needs it already open on the zotero-tts pane, so run `01` first or open
  the pane by hand before `02`.
- State touched: none. All three scripts only read the pane (and `03`
  briefly rewrites the Zotero note's textContent, restored and verified via
  `document.l10n.translateElements` in the same script); no pref is
  written, no switch is clicked.
- The `local` (Kokoro-FastAPI) heading's link is rendered at pane load by
  `ui/section-heading.ts`'s `renderSectionHeading` via
  `doc.createXULElement('label', { is: 'zotero-text-link' })` — its
  `getAttribute('is')` reads `null` even though `outerHTML` and
  `constructor.name` (`ZoteroTextLink`) both confirm it is the right,
  upgraded element (see Limits): detect it, and every other heading link,
  by `label.zotero-text-link` (the class Gecko's custom-element upgrade
  adds), never `label[is="zotero-text-link"]`.

## Limits

- **`Element.querySelector` rejects a `html|input` namespace prefix**
  without a declared `@namespace` — use the plain tag selector
  (`input[type="password"]`); it already matches an `html:input` in this
  XHTML document.
- **A dynamically created `is`-upgraded XUL element's `getAttribute('is')`
  reads `null`** (found this run, on the `local` heading's link): the
  element is genuinely upgraded (`classList.contains('zotero-text-link')`
  true, `constructor.name` `ZoteroTextLink`, `outerHTML` shows `is="..."`
  in its serialization) but the attribute itself does not answer a
  `getAttribute` read the way a link parsed from static markup
  (`<label is="zotero-text-link" ...>`, e.g. every other provider
  heading's) does. `01`'s own first attempt used the attribute selector
  and read `linkPresent: false` for `local` alone; switching to the class
  selector fixed it for every heading uniformly.
- **`drawSnapshot` returns a PROMISE of an ImageBitmap in this Firefox**,
  not the bitmap itself (driving notes Sec5 does not say so explicitly):
  `ctx.drawImage(snapshot, 0, 0)` on the un-awaited promise throws
  `TypeError: Argument 1 could not be converted to any of:
  HTMLImageElement, ...`. `await` the call.
- The pane's own groupbox count is **17**, not 16 (`html:h2` sections:
  Azure, Cloudflare, Fish Audio, Fish Speech, Kokoro-FastAPI, OpenAI,
  Speechify, System voices, Zotero, then Voice browser, Reading,
  Highlight, Keyboard shortcuts, WebDAV, Sync, Backup, About — 9 + 8).
  Recorded here since a brief's own count (16) read one short.

## Runs

| Date | Build | Report | Items | Notes |
| --- | --- | --- | --- | --- |
| 2026-09-15 | 1.12.11-beta, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #112 verification, C1-C4) | C1 PASS (count note), C2 PASS (all 6 links + 3 unlinked), C3 PASS (style + one-line; two screenshots taken), C4 PASS (Fish Audio locked, Fish Speech unlocked) | First scripts of this kit; `01` revised once for the `html|input` selector and the `is`-attribute-vs-class finding above |
| 2026-09-15 | 1.12.11-beta2, Zotero 10.0.3-beta.1+cfec88e31 | this run's reply (issue #112 second-pass verification, C1-C4) | C1 PASS (17 groupboxes, no `ztts-provider-fish-audio`, no `h3.ztts-subheading`), C2 PASS (all 6 links + 3 unlinked, same hrefs), C3 PASS (`fontSizeMatches`/`fontWeightMatches`/`oneLine: true`; two screenshots taken), C4 PASS (Fish Audio locked/enabled, Fish Speech unlocked/disabled) | Both scripts run unchanged, no revision needed; screenshots re-taken as `settings-pane-top-c112.png`/`settings-pane-zotero-section-c112.png` |
| 2026-09-29 | 1.16.2-beta6, Zotero 10.0.3-beta.3+80bc5565e | this run's reply (#159/#158 continuation verification, item 1.2's #158 sentence) | PASS: 58 `.ztts-help`, all `flex-shrink: 0`, all boxes 16.25 × 16.25 px; sheet rule with `flex-shrink: 0`, no `font-size`; the Zotero note wrapped 17.33 → 52 px and its `?` stayed 16.25 × 16.25; note text and box restored | First run of `03` (written by the previous, timed-out beta5 run), executed unchanged; the same run's zotero-credits `02` read the `?` 4 px after the visible note, 16.25 × 16.25 |
