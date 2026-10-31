// Case item 7, the log half: read the debug store (30 turned it on in 01 and put
// a "ZTTS209-MARK begin/end <doc>/<voice kind>/segment N" line round every
// paragraph it read) and sort every "[zotero-tts] highlight:" line into the block it
// came in, in order. Lines outside any block (opening a reader, a voice pick) go
// under "outside". Also lists, by block, the two lines the case names —
//   highlight: word position shows the wrong text and no rewrite fixes it
//   highlight: sentence selector does not resolve to the sentence and no rewrite does
// — and any [zotero-tts] line that reads like an error. The plugin logs each of
// these once per change of its message (logChange), so a repeat of the same line
// in a later block is silent: read the first block that shows it.
// params: none. Read-only.
(async () => {
  const out = { step: 'log-lines', blocks: [], outside: [], named: [], errorLike: [] };
  const log = String(await Zotero.Debug.get());
  const lines = log.split('\n');
  out.totalLines = lines.length;
  const mask = (l) => l.replace(/[0-9a-f]{32}/g, '<32hex>').replace(/^\(\d\)\(\+\d+\): /, '').slice(0, 240);
  let current = null;
  for (const raw of lines) {
    const begin = /ZTTS209-MARK begin (.+)$/.exec(raw);
    const end = /ZTTS209-MARK end (.+)$/.exec(raw);
    if (begin) { current = { label: begin[1].trim(), highlight: [] }; out.blocks.push(current); continue; }
    if (end) { current = null; continue; }
    if (!/\[zotero-tts\]/.test(raw)) continue;
    const line = mask(raw);
    if (/highlight:/.test(line)) (current ? current.highlight : out.outside).push(line);
    if (/word position shows the wrong text and no rewrite fixes it|sentence selector does not resolve to the sentence and no rewrite does/.test(line)) out.named.push({ block: current?.label ?? 'outside', line });
    if (/\b(error|failed|denied|dead object|exception)\b/i.test(line) && !/word timestamps for|no word timestamps/.test(line)) out.errorLike.push({ block: current?.label ?? 'outside', line });
  }
  // Collapse the per-tick "active word timestamp" lines; keep every other highlight line.
  const collapse = (arr) => arr.filter((l) => !/highlight: active word timestamp (none|real|stand-in)$/.test(l));
  out.summary = out.blocks.map((b) => ({ block: b.label, highlightLines: collapse(b.highlight) }));
  out.outsideHighlight = collapse(out.outside);
  out.ok = true;
  return JSON.stringify(out, null, 1);
})()
