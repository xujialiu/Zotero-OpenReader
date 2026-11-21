[Case](../../cases/long-segments.md) · [Runner](../_shared/README.md)

| Script | Check | Expected on the reported table | Input |
| --- | --- | --- | --- |
| `00-audit.js` | Replay the installed splitter and gap calculation against Zotero's installed SDT collection. Resolve the source spans in a one-node test chain. | 15 pieces, at most 239 characters each, exact reconstruction, matching source ranges and zero continuation delay. | `params.longTableText`, the normalized 3,231-character Segment |

Use the case baseline and cleanup. The replay reads the installed
bundles and allocates an independent collection. Bundle module names
and native source delimiters are specific to the tested versions.

On 2026-11-21, Zotero 10.0.9 and OpenReader 1.17.2-beta3 reproduced
the source ranges for all 15 pieces. The Player run on a separate PDF
fixture and its timing limits are recorded in
[issue #262](https://github.com/xujialiu/Zotero-OpenReader/issues/262).
Failed-piece Retry is covered by the automated Engine test.
