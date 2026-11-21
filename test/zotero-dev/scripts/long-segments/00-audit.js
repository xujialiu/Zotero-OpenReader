// Issue #262 package-mechanism replay: extract the actual installed fix code
// and Zotero's native SDTReadAloudSegments from their bundles, then replay
// the split against the reported 3,231-char table text. No install, playback,
// Fish request, or user-document mutation.
(async () => {
  const out = { status: 'PASS', errors: [], checks: {} };
  const table = Zotero.ZoteroTTSRun.params.longTableText;
  if (!table || typeof table !== 'string') throw new Error('params.longTableText is required');

  // --- 1. Extract installed plugin modules from the XPI via AddonManager ---
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addons = await AddonManager.getAllAddons();
  let addonRoot = null;
  for (const addon of addons) {
    if (addon.id === 'zotero-tts@xujialiu.top') {
      addonRoot = addon.getResourceURI('content/zotero-tts.js').spec;
      break;
    }
  }
  if (!addonRoot) throw new Error('zotero-tts addon not found');
  const pluginBundle = await Zotero.File.getResourceAsync(addonRoot);

  // Extract module slices by the bundle's '  // src/...' boundaries.
  const extractModule = (path) => {
    const marker = '  // ' + path;
    const start = pluginBundle.indexOf(marker);
    if (start < 0) throw new Error('module not found: ' + path);
    const rest = pluginBundle.slice(start + marker.length);
    const nextMatch = rest.match(/\n  \/\/ src\//);
    const end = nextMatch ? start + marker.length + nextMatch.index + 1 : pluginBundle.length;
    return pluginBundle.slice(start, end);
  };
  const splitTextModule = extractModule('src/core/providers/split-text.ts');
  const invisibleModule = extractModule('src/read-aloud/invisible-text.ts');
  const longSegmentsModule = extractModule('src/read-aloud/long-segments.ts');

  const readerBundle = await Zotero.File.getResourceAsync('resource://zotero/reader/reader.js');
  const nativeSlice =
    readerBundle.slice(readerBundle.indexOf('class SDTReadAloudSegments {'), readerBundle.indexOf('function sdt_segments_buildSDTReadAloudSegments('))
    + readerBundle.slice(readerBundle.indexOf('function makePosition(chain, rawStart, rawEnd)'), readerBundle.indexOf(';// ./structured-document-text/src/pack/bytes.js'));

  // --- 3. Build a sandbox where all extracted code runs together ---
  // The plugin modules are ESM-compiled IIFE output with bare function/var
  // declarations; they need the invisible-text and split-text modules on scope
  // for long-segments to reference. We concatenate them in dependency order
  // and wrap in a function that returns what we need.
  const pluginCode = [splitTextModule, invisibleModule, longSegmentsModule, extractModule('src/core/engine/gap.ts')].join('\n');
  const pluginFactory = new Function(pluginCode + '\nreturn { splitText, divideLongSegments, gapBefore };');
  const plugin = pluginFactory();

  const nativeFactory = new Function(nativeSlice + '\nreturn { SDTReadAloudSegments };');
  const native = nativeFactory();

  out.extracted = {
    pluginChars: pluginCode.length,
    nativeChars: nativeSlice.length,
    hasSplitText: typeof plugin.splitText === 'function',
    hasDivideLongSegments: typeof plugin.divideLongSegments === 'function',
    hasCollection: typeof native.SDTReadAloudSegments === 'function',
  };

  // --- 4. Build a minimal one-node chain matching native-replay.ts ---
  const chain = {
    text: table,
    mappings: [{ absStart: 0, absEnd: table.length, ref: [0, 0], blockRef: [0], node: { text: table }, start: 0 }],
  };

  // --- 5. Build the native collection with the full table segment ---
  const col = new native.SDTReadAloudSegments();
  const added = col.addSegment(chain, 0, table.length, 'sentence');
  if (!added) throw new Error('addSegment failed');
  if (col.segments.length !== 1) throw new Error('expected 1 original segment');
  const original = col.segments[0];
  original.anchor = 'paragraphStart';
  original.paragraphSourcePosition = 'shared-ref';

  out.original = {
    textLen: original.text.length,
    anchor: original.anchor,
    expectedTextLen: table.length,
  };

  // --- 6. Run the installed divideLongSegments against the native collection ---
  const mapper = { textNodeSpansToSourcePosition(spans) { return spans; } };
  plugin.divideLongSegments(col, col.segments, mapper);

  const pieces = col.segments;
  out.pieceCount = pieces.length;
  if (pieces.length < 2) { out.status = 'FAIL'; out.errors.push('expected ≥2 pieces after divide'); return JSON.stringify(out, null, 1); }

  // --- 7. Verify exact reconstruction ---
  const reconstructed = pieces.map((p) => p.text).join(' ');
  out.checks = {};
  out.checks.reconstruction = {
    concatLen: reconstructed.length,
    originalLen: table.length,
    exact: reconstructed === table,
  };

  // --- 8. Verify piece caps ---
  const maxLen = Math.max(...pieces.map((p) => p.text.length));
  out.checks.caps = { maxLen, withinCap: maxLen <= 240 };

  // --- 9. Verify offsets ---
  const offsets = pieces.map((p) => p.openReaderOffset ?? null);
  out.checks.offsets = {
    offsets,
    increasing: pieces.every((p, i) => i === 0 || (pieces[i - 1].openReaderOffset ?? 0) < (p.openReaderOffset ?? 0)),
    firstIsZero: pieces[0].openReaderOffset === 0,
  };

  // --- 10. Verify anchors ---
  out.checks.anchors = {
    first: pieces[0].anchor,
    rest: pieces.slice(1).every((p) => p.anchor === null),
  };

  // --- 11. Verify shared paragraphPosition ---
  const paragraphPositions = pieces.map((p) => p.paragraphSourcePosition);
  out.checks.paragraphPosition = {
    shared: paragraphPositions.every((p) => p === 'shared-ref'),
  };

  // --- 12. Verify source ranges via native getWordTextSpans ---
  const rangeResults = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const spans = col.getWordTextSpans(piece, 0, piece.text.length);
    const span = spans[0];
    const recovered = span ? chain.text.slice(span.start, span.end) : null;
    rangeResults.push({
      piece: i,
      spanCount: spans.length,
      recoveredLen: recovered?.length ?? null,
      matches: recovered === piece.text,
    });
  }
  out.checks.sourceRanges = {
    allMatch: rangeResults.every((r) => r.matches && r.spanCount >= 1),
    detail: rangeResults,
  };

  // --- 13. Verify word-level resolution within each piece ---
  const wordResults = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const words = piece.text.split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;
    const midChar = Math.floor(piece.text.length / 2);
    const spans = col.getWordTextSpans(piece, midChar, midChar + 1);
    const span = spans[0];
    const recovered = span ? chain.text.slice(span.start, span.end) : null;
    wordResults.push({ piece: i, midChar, spanCount: spans.length, recoveredLen: recovered?.length ?? null });
  }
  out.checks.wordSpans = {
    allHaveSpans: wordResults.every((r) => r.spanCount >= 1),
    detail: wordResults,
  };

  // --- 14. Verify gapBefore override from openReaderOffset ---
  const settings = { sentence: { enabled: true, ms: 200 }, paragraph: { enabled: true, ms: 200 } };
  const gapContinuation = plugin.gapBefore(pieces[1], 1.4, settings);
  out.checks.gapContinuation = { gap: gapContinuation, correct: gapContinuation === 0 };

  // --- 15. Verify openReaderOriginal ---
  out.checks.openReaderOriginal = {
    allMatchOriginal: pieces.every((p) => p.openReaderOriginal === table),
  };

  // --- Verdict ---
  const allPass = out.checks.reconstruction.exact && out.checks.caps.withinCap
    && out.checks.offsets.increasing && out.checks.offsets.firstIsZero
    && out.checks.anchors.first === 'paragraphStart' && out.checks.anchors.rest
    && out.checks.paragraphPosition.shared && out.checks.sourceRanges.allMatch
    && out.checks.wordSpans.allHaveSpans && out.checks.gapContinuation.correct
    && out.checks.openReaderOriginal.allMatchOriginal;
  out.status = allPass ? 'PASS' : 'FAIL';
  if (!allPass) out.errors.push('one or more checks failed');
  return JSON.stringify(out, null, 1);
})()
