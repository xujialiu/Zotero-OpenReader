# Scripts: Voice samples in the browser (issues #48, #61)

[Case](../../cases/voice-samples.md) · [Checklist index](../../README.md) · [All scripts](../README.md)

| Script | What it checks | What it expects | Params / state |
| --- | --- | --- | --- |
| `00-ensure-browser.js` | The settings window on the plugin pane with the listing settled, System selected, English (United Kingdom) chosen, Daniel's row found; records `backend.spawned` | Window open (opens one when absent), `System (193)`, Daniel's ▶ row | `state.spawned` |
| `01-first-sample-and-cache.js` | ▶ Daniel, let it end; ▶ again | First: glyph `▶ → … → ■ → ▶` and `spawned` up by one; second: `■ → ▶` and `spawned` unchanged (the window's cache) | `state.spawned` |
| `02-region-change-resample.js` | Azure's Region through the pane's own field while Azure is off; ▶ Daniel; ▶ once more; the Region back exactly as it was (including no user value) in a `finally` | Third ▶: fresh sample (`spawned` up by one) after the setup changed; fourth: unchanged; region restored byte-identical | `state.spawned` |

## Before you start

- The System voices must be on and the samples measured against `backend.spawned`
  (`diagnostics.systemProvider()`); the system-voices kit leaves both in place.
- Muted by default (`readAloud.volume` 0): the samples play silently; `ended` still fires.
- The window must not already hold the sample: the samples map lives as long as the pane, so a
  reused window returns cache hits (read 0) where a fresh window reads +1. Close and reopen the
  settings window for a clean first sample.
- Keep the window open throughout the item's four ▶.
- Volume and `azure.region` snapshots with user flags; the region restores in the script's
  `finally` (the pane's own field writes the pref — value + `change` event suffice).

## Limits

- Each `spawned()` read costs one `osascript` listing whose spawn lands in the NEXT read's
  snapshot (`systemProvider` reads `backend.state()` before it lists): a delta between two reads
  is (later − earlier − 1). +1 means one real `say`, 0 means none. The scripts assert the
  corrected deltas.
- The voice rows render the label with the locale ("Daniel (English (UK))"); rows are found by
  prefix, and the language group is picked by its full "English (United Kingdom) (9)" text.
- Azure off is the item's precondition (the section is editable while off); `azure.enabled` is
  read, never changed.

## Runs

| Run | Items | Result |
| --- | --- | --- |
| 2026-10-18 · 1.16.12-beta3 · `…-voice-samples(-r2…r5)` | 2.11: fresh sample +1 `say`, replay 0 (cache), Region change → sample made again +1, replay 0; region restored byte-identical — PASS | Scripts 00–02 as they stand; 00 revised to open the window itself; the counter's read cost and the reused-window cache are why r3's first reads show cache hits |
