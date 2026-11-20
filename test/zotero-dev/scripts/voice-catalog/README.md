# Voice catalog test scripts for issue #261

[Case](../../cases/voice-catalog.md) · [Baseline](../../baseline.md) · [Runner](../_shared/README.md)

| Script | Check | Required observation | Inputs |
| --- | --- | --- | --- |
| `kokoro-stub.cjs` | Controlled Kokoro listing and local audio | Fresh loopback counts, held lists can succeed, fail, or return empty. Credential-like headers remain absent. | Port `8973` |
| `catalog.js` | Run case items 1–6 through the plugin Player | `fullCatalogPass:true`, complete recovery, `headersRestored:true`, and stub stopped | `root`, `expectedVersion`, `stubBase`, fixture titles |
| `baseline.js` | Capture the named baseline for `catalog.js` | Numeric Position count, private preference and user-value flags | Current profile |
| `isolate.js` | Set up the local Provider while it is off | Loopback address, empty headers, System enabled | `stubBase` |
| `fixture-a.js`, `fixture-b.js`, `seed-system.js` | Import and prepare two standalone PDFs | Both readers ready and both saved voices verified as System Samantha before Play | `fixturesDir`, fixture titles |
| `probe-ready-start-close.js` | Ready voices, waiting at a selection, close cancellation | System's clock advances across release, one Kokoro start at Segment 5 after browsing the other tab, the closed wait starts nothing | Both fixtures and stub |
| `probe-02-03.js` | Wait status and successful refresh after timeout | Play names Kokoro while held. A fresh successful list arrives with the start count unchanged. | Fixture A and stub |
| `probe-04-06.js` | Supersession, favorites, and separate choices | B plays through release of A's canceled wait, then pauses for A. Favorites remain strict through failure. Native preferences match across the plugin's voice picks. | Both fixtures and stub |
| `handback.js` | Actual disable and native reopening after a passing catalog run | Player closes with Position held and no implicit audio. Both native methods are restored. The native Player selects fixture B. The addon is re-enabled. | `expectedVersion`, `handBackFixtureTitle`, optional `authorizedReaderTitle` |
| `restore.js` | Restore the profile from a live snapshot | Only fixture records removed, Position counts match, named preferences and flags restored, native choice and non-fixture records match | `state.vc261` |

## Before starting

- Follow baseline 0 and the install checklist. Verify the installed XPI or
  bundle identity and successful startup. Keep WebDAV off and pending
  requests settled through both scripts.
- Use macOS with the plugin's System Samantha voice available. The fixture
  uses `system::osx/com.apple.voice.compact.en-US.Samantha` and the stub's
  `local::af_sample`. Both Document voice IDs are verified before Play.
- Start `node test/zotero-dev/scripts/voice-catalog/kokoro-stub.cjs 8973`.
  The stub binds to `127.0.0.1` and keeps only counts and flags. Use a
  fresh instance with zero list and speech requests.
- The run temporarily mutes playback, changes named Provider switches and
  favorites, and imports standalone copies of `fixture-a.pdf` and
  `fixture-b.pdf`. The Kokoro header snapshot stays in the catalog
  script's local scope. Read the sanitized result files, with raw
  preference snapshots kept in Zotero memory for cleanup.
- Keep the native disable check confined to test readers. With one open
  non-fixture reader, supply its exact title only after explicit approval
  to close and reopen it. The script verifies its idle state and restores
  the article, tab index and selection. Otherwise arrange for the test
  fixtures to be the only readers. The native fixture supplies two voices
  and intercepts synthesis in its own reader during the hand-back.

## Launch

Load the [shared runner](../_shared/README.md) first. Pass a unique run ID
and the version of the installed test build.

```js
return runner.start({
  root,
  kit: 'voice-catalog',
  scripts: ['catalog.js', 'handback.js'],
  runId: '<unique-run-id>',
  params: {
    expectedVersion: '<installed-test-version>',
    stubBase: 'http://127.0.0.1:8973',
    fixtureTitle: 'Voice catalog fixture A',
    fixtureBTitle: 'Voice catalog fixture B',
    handBackFixtureTitle: 'Voice catalog native hand-back fixture',
    authorizedReaderTitle: '',
  },
  stopOnError: true,
});
```

After `started:true`, wait for the runner and inspect `catalog.js.json`
and `handback.js.json` in its results directory. Acceptance requires
`fullCatalogPass:true`, `handBack.pass:true`, both recovery checks, and a
closed stub port. With an authorized non-fixture tab, check that its
recovery reports `reopened:true`, `tabIndexRestored:true`,
`selectedRestored:true`, and `playerIdle:true`.

## Limits and run

- The earlier beta left its own `loadVoices` method in place after disable.
  The `1.17.2-beta2` check proved the native method was restored before
  the native Player reopened. An unassigned `can't access dead object`
  console entry remained in the beta2 run.
- This run verifies the case on macOS with controlled Provider responses.
  Listening quality and real metered synthesis are outside the checks.

2026-11-20, Zotero 10.0.9, `1.17.2-beta2`, code commit `794c6b5`.
The full case passed with the retained probe bodies. The complete table
is in [the issue closing comment](https://github.com/xujialiu/Zotero-OpenReader/issues/261#issuecomment-7037820749).
