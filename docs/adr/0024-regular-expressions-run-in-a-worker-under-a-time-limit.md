---
status: accepted
date: 2026-11-02
issue: 237
---

# Regular expressions run in a worker under a time limit

*The product argument is [design 0024](../design/0024-a-slow-pattern-is-skipped-not-waited-for.md).*

## Context

Replacement rows (issue #237, ADR 0023) may be JavaScript regular
expressions. SpiderMonkey's irregexp backtracks: a pattern such as
`(a+)+$` takes time exponential in the length of a non-matching input. In
content, the slow-script watchdog would interrupt it. Zotero turns the
watchdog off for chrome code: `pref("dom.max_chrome_script_run_time", 0)`
(Zotero 10's `defaults/preferences/zotero.js:1406`). The plugin's
sandbox has the system principal (`xpcom/plugins.js:137-139`), so a
pattern run there on the main thread is never interrupted and freezes
Zotero.

The sandbox is given `Worker` and `ChromeWorker` (`xpcom/plugins.js:167`,
`:172`). Zotero itself runs workers from `resource://` URLs
(`xpcom/pdfWorker/manager.js:26`).

## Decision

1. **Every Segment's replacement passes run in one dedicated worker
   whenever its ordered list holds a regular-expression row**; a list of
   exact rows only runs on the main thread. An exact row compiles to a
   literal with fixed-width lookarounds, which is linear.
2. **A time limit per Segment** (250 ms). The
   worker posts which row it starts before each regular-expression
   row.
   When the limit passes, the plugin terminates the worker, starts a new
   one, and runs the Segment again with the row it was in skipped for
   that Segment. The skip is reported (Player status, dialog row,
   `diagnostics.replacements()`).
3. **The full JavaScript syntax** with the `u` flag, plus `i` when the row
   does not match case. Rows are validated at entry: a syntax error, or a
   pattern that matches the empty string, is refused.
4. **Preparing the speech text becomes asynchronous** in
   `remote-interface.getAudio` and `forget`, which already are.

## Rejected

- **Main-thread `RegExp`.** One pathological row and Segment hang Zotero
  with no recovery but a forced quit.
- **A linear-time engine (an RE2 port).** No hang and no worker, but no
  lookaround or backreferences, RE2's syntax differences, and a
  third-party library to license and ship.

## Verified

On 1.16.17-beta, Zotero 10.0.7, macOS (2026-11-02, issue #237):

- **The worker starts** from the Player's `resource://` substitution
  (`new Worker(…/replacements-worker.js)` in the sandbox), and
  `terminate()` frees a worker stuck in `(a+)+$` on a 43-character
  sentence: that Segment came back in 519 ms with the row skipped
  (`timedOut: [4]`), and a bridge call right after it answered in 1 ms.
- **The round trip** of an ordinary Segment with four rows, two of them
  regular expressions, was 1-4 ms.
- **Counters are per Zotero session.** An edit's recheck of the Segments a
  reading holds runs a slow row again, and times out again, once per such
  Segment: 8 cuts in that run, all of the same row and sentence.
