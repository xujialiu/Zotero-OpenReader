(async () => {
  const run = Zotero.ZoteroTTSRun;
  const params = run.params;
  const snapshot = Zotero.__openReader128Snapshot;
  const filesDir = params.stubFilesDir;
  const logPath = params.stubLog;
  const loopbackURL = params.loopbackURL;
  const desktopNames = ['zotero-openreader-positions.json', 'zotero-tts-positions.json'];
  const sharedNames = ['openreader-positions.json', 'xujialiu-positions.json'];
  const allNames = [...desktopNames, ...sharedNames];
  const errors = [];
  const result = { stages: [], cleanup: {}, requestTotals: {} };
  const fail = (message) => { throw new Error(message); };
  const assert = (condition, message) => { if (!condition) fail(message); };
  const pathFor = (name) => `${filesDir}/${name}`;
  const basename = (path) => String(path).replace(/\\/g, '/').split('/').pop();
  const children = async () => IOUtils.getChildren(filesDir);
  const readFile = async (name) => {
    if (!(await children()).some((path) => basename(path) === name)) return null;
    return IOUtils.readUTF8(pathFor(name));
  };
  const writeFile = (name, text) => IOUtils.writeUTF8(pathFor(name), text);
  const readRequests = async () => {
    try {
      const text = await IOUtils.readUTF8(logPath);
      return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {
      if (String(error).includes('NS_ERROR_FILE_NOT_FOUND') || error?.name === 'NotFoundError') return [];
      throw error;
    }
  };
  let requestBaseline = 0;
  const diag = () => JSON.parse(Zotero.ZoteroTTS.diagnostics.positionSync());
  const setPref = (key, value) => Zotero.Prefs.set(`zotero-tts.${key}`, value);
  const waitIdle = async (timeout = 15000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const d = diag();
      if (!d.transport.running && !d.shared.transport.running) return d;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    fail('position transports did not become idle');
  };
  const waitRun = async (before, outcome, timeout = 15000) => {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      const d = diag();
      if (
        d.transport.syncs > before.transport.syncs &&
        d.shared.transport.syncs > before.shared.transport.syncs &&
        !d.transport.running && !d.shared.transport.running &&
        d.transport.lastOutcome === outcome && d.shared.transport.lastOutcome === outcome
      ) return d;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    fail(`position transports did not complete a new ${outcome} run`);
  };
  const syncOnce = async () => {
    let before = await waitIdle();
    if (Zotero.Prefs.get('zotero-tts.webdav.syncPositions') === true) {
      setPref('webdav.syncPositions', false);
      await waitIdle();
      before = diag();
    }
    setPref('webdav.syncPositions', true);
    return waitRun(before, 'ok');
  };
  const desktopText = (entries) => JSON.stringify({
    format: 'zotero-tts-positions',
    version: 1,
    items: [...entries]
      .sort((a, b) => a.lib - b.lib || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map(({ lib, key, pos, ts }) => ({ lib, key, pos, ts })),
  });
  const sharedText = (items) => JSON.stringify({
    format: 'xujialiu-positions',
    version: 1,
    items: [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map((item) => ({
      id: item.id,
      format: item.format,
      publicationId: item.publicationId,
      locator: item.locator,
      anchor: { exact: item.anchor.exact, prefix: item.anchor.prefix, suffix: item.anchor.suffix },
      stamp: { at: item.stamp.at, device: item.stamp.device },
    })),
  });
  const randomHex = (length) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const randomKey = () => randomHex(8).toUpperCase();
  const randomDocumentId = () => `sha256:${randomHex(64)}`;
  const requestName = (request) => {
    const path = String(request.pathname ?? request.path ?? '').split('?')[0];
    return allNames.find((name) => path.endsWith(`/${name}`)) ?? null;
  };
  const verifyRequestDelta = async (beforeCount, expectedPutNames, expectedGetCodes) => {
    const requests = await readRequests();
    const delta = requests.slice(beforeCount).filter((r) => ['GET', 'PUT'].includes(String(r.method).toUpperCase()));
    const getRows = delta.filter((r) => String(r.method).toUpperCase() === 'GET').map((r) => ({ name: requestName(r), code: Number(r.code) }));
    const putRows = delta.filter((r) => String(r.method).toUpperCase() === 'PUT').map((r) => ({ name: requestName(r), code: Number(r.code) }));
    const gets = getRows.map((r) => r.name).sort();
    const puts = putRows.map((r) => r.name).sort();
    assert(gets.length === allNames.length && gets.every((name) => name !== null), `expected one GET for each of four names; saw ${JSON.stringify(gets)}`);
    assert(JSON.stringify(gets) === JSON.stringify([...allNames].sort()), `GET names differ: ${JSON.stringify(gets)}`);
    assert(puts.every((name) => name !== null), `unexpected PUT path in ${JSON.stringify(puts)}`);
    assert(JSON.stringify(puts) === JSON.stringify([...expectedPutNames].sort()), `PUT names differ: ${JSON.stringify(puts)}`);
    for (const row of getRows) if (expectedGetCodes[row.name] !== undefined) assert(row.code === expectedGetCodes[row.name], `GET ${row.name} returned HTTP ${row.code}`);
    for (const row of putRows) assert(row.code === 201, `PUT ${row.name} returned HTTP ${row.code}`);
    return { gets: getRows, puts: putRows };
  };
  const assertFiles = async (expectedDesktop, expectedShared) => {
    const d = desktopText(expectedDesktop);
    const s = sharedText(expectedShared);
    for (const name of desktopNames) {
      const actual = await readFile(name);
      assert(actual === d, `${name} did not match canonical desktop bytes: expected=${d} actual=${actual}`);
    }
    for (const name of sharedNames) {
      const actual = await readFile(name);
      assert(actual === s, `${name} did not match canonical shared bytes: expected=${s} actual=${actual}`);
    }
  };
  const assertEmptyLocal = (d) => {
    assert(d.localEntries === 0 && d.tombstones === 0, 'synthetic desktop items changed the local store');
    const s = d.shared.documents;
    assert(s.documents === 0 && s.items === 0 && s.identifying === 0 && s.unnamed === 0, 'synthetic shared items changed local document state');
  };
  const stage = async (name, expectedDesktop, expectedShared, expectedPuts, expectedGetCodes = {}, completed = null, requestOffset = null) => {
    const beforeRequests = requestOffset ?? (await readRequests()).length;
    const d = completed ?? await syncOnce();
    assert(d.transport.lastOutcome === 'ok' && d.shared.transport.lastOutcome === 'ok', `${name}: transport outcome was not ok`);
    assert(d.transport.uploaded === (expectedPuts.some((n) => desktopNames.includes(n))), `${name}: desktop upload flag mismatch`);
    assert(d.shared.transport.uploaded === (expectedPuts.some((n) => sharedNames.includes(n))), `${name}: shared upload flag mismatch`);
    assert(d.transport.adopted === 0 && d.shared.transport.adopted === 0, `${name}: a synthetic item was unexpectedly adopted locally`);
    assert(d.shared.transport.carried === 1, `${name}: the server-only snapshot item was not carried through`);
    assertEmptyLocal(d);
    await assertFiles(expectedDesktop, expectedShared);
    const requests = await verifyRequestDelta(beforeRequests, expectedPuts, expectedGetCodes);
    result.stages.push({
      name,
      desktop: { remoteEntries: d.transport.remoteEntries, adopted: d.transport.adopted, uploaded: d.transport.uploaded },
      shared: { remoteItems: d.shared.transport.remoteItems, adopted: d.shared.transport.adopted, carried: d.shared.transport.carried, uploaded: d.shared.transport.uploaded },
      gets: requests.gets,
      puts: requests.puts,
      bytesAndStamps: 'full expected canonical bytes matched',
    });
  };

  let bodyError = null;
  try {
    assert(snapshot && snapshot.prefs && snapshot.testURL, 'private original-state snapshot is missing');
    const effective = new URL(Zotero.Prefs.get('zotero-tts.webdav.url'));
    assert(effective.href === new URL(loopbackURL).href && effective.hostname === '127.0.0.1' && effective.port === '56974' && effective.pathname === '/dav/', 'effective WebDAV URL is not the assigned loopback stub');
    for (const key of ['webdav.enabled', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings']) {
      assert(Zotero.Prefs.get(`zotero-tts.${key}`) === false, `expected ${key} off before the probe`);
    }
    assert(!Zotero.Prefs.get('zotero-tts.webdav.username') && !Zotero.Prefs.get('zotero-tts.webdav.password'), 'loopback credentials must be empty');
    assert((await children()).length === 0, 'assigned stub files directory was not empty at baseline');
    requestBaseline = (await readRequests()).length;

    const token = randomHex(8);
    const lib = Number(Zotero.Libraries.userLibraryID);
    assert(Number.isInteger(lib) && lib > 0, 'user library id unavailable');
    const keys = Array.from({ length: 6 }, randomKey);
    assert(new Set(keys).size === keys.length, 'synthetic attachment keys collided');
    const [pdfKey, snapshotKey, oldOnlyKey, newOnlyKey, directionKey, reverseKey] = keys;
    const docId = randomDocumentId();
    const serverOnlyId = randomDocumentId();
    assert(docId !== serverOnlyId, 'synthetic Document Ids collided');
    const t = Date.now() - 120000;
    const desktopEntry = (key, ts, pos) => ({ lib, key, pos, ts });
    const pdfOld = desktopEntry(pdfKey, t + 10, { pageIndex: 1, rects: [[12.3, 45.6, 12.3, 45.6]] });
    const pdfNew = desktopEntry(pdfKey, t + 20, { pageIndex: 2, rects: [[22.3, 55.6, 22.3, 55.6]] });
    const snapshotOld = desktopEntry(snapshotKey, t + 15, { value: `snapshot:${token}:legacy` });
    const snapshotNew = desktopEntry(newOnlyKey, t + 25, { value: `snapshot:${token}:new` });
    const oldOnly = desktopEntry(oldOnlyKey, t + 30, { pageIndex: 3, rects: [[32.3, 65.6, 32.3, 65.6]] });
    const oldToNew = desktopEntry(directionKey, t + 40, { pageIndex: 4, rects: [[42.3, 75.6, 42.3, 75.6]] });
    const newToOld = desktopEntry(reverseKey, t + 50, { value: `snapshot:${token}:reverse` });
    const epub = (at, device) => ({
      id: docId,
      format: 'epub',
      publicationId: null,
      locator: 'epubcfi(/6/2!/4/2)',
      anchor: { exact: `#128 ${token}`, prefix: 'before', suffix: 'after' },
      stamp: { at, device },
    });
    const serverOnly = {
      id: serverOnlyId,
      format: 'snapshot',
      publicationId: null,
      locator: `snapshot:${token}`,
      anchor: { exact: `server-only ${token}`, prefix: 'left', suffix: 'right' },
      stamp: { at: t + 12, device: 'server-only-fixture' },
    };

    const d1 = [pdfOld, snapshotOld];
    const s1 = [epub(t + 100, 'legacy-fixture'), serverOnly];
    await writeFile('zotero-tts-positions.json', desktopText(d1));
    await writeFile('xujialiu-positions.json', sharedText(s1));
    setPref('webdav.syncPositions', true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert(Zotero.Prefs.get('zotero-tts.webdav.syncPositions') === true && Zotero.Prefs.get('zotero-tts.webdav.enabled') === false, 'position switch did not settle while the folder remained off');
    await waitIdle();
    const firstBefore = diag();
    const firstRequestOffset = (await readRequests()).length;
    setPref('webdav.enabled', true);
    let firstRun = await waitRun(firstBefore, 'ok');
    await new Promise((resolve) => setTimeout(resolve, 500));
    firstRun = await waitIdle();
    await stage('legacy-only; new names missing', d1, s1, ['zotero-openreader-positions.json', 'openreader-positions.json'], {
      'zotero-openreader-positions.json': 404,
      'zotero-tts-positions.json': 200,
      'openreader-positions.json': 404,
      'xujialiu-positions.json': 200,
    }, firstRun, firstRequestOffset);

    const d2 = [pdfNew, snapshotOld, snapshotNew, oldOnly];
    const s2 = [epub(t + 300, 'new-divergent'), serverOnly];
    await writeFile('zotero-tts-positions.json', desktopText([pdfOld, snapshotOld, oldOnly]));
    await writeFile('zotero-openreader-positions.json', desktopText([pdfNew, snapshotNew]));
    await writeFile('xujialiu-positions.json', sharedText([epub(t + 200, 'legacy-divergent'), serverOnly]));
    await writeFile('openreader-positions.json', sharedText([epub(t + 300, 'new-divergent')]));
    await stage('divergent union; newer stamps win', d2, s2, allNames);

    const d3 = [...d2, oldToNew];
    const s3 = [epub(t + 400, 'legacy-forward'), serverOnly];
    await writeFile('zotero-tts-positions.json', desktopText(d3));
    await writeFile('xujialiu-positions.json', sharedText(s3));
    await stage('legacy to new', d3, s3, ['zotero-openreader-positions.json', 'openreader-positions.json']);

    const d4 = [...d3, newToOld];
    const s4 = [epub(t + 500, 'new-reverse'), serverOnly];
    await writeFile('zotero-openreader-positions.json', desktopText(d4));
    await writeFile('openreader-positions.json', sharedText(s4));
    await stage('new to legacy', d4, s4, ['zotero-tts-positions.json', 'xujialiu-positions.json']);

    await stage('unchanged no-op', d4, s4, []);
    const requests = (await readRequests()).slice(requestBaseline);
    result.requestTotals = {
      get: requests.filter((r) => String(r.method).toUpperCase() === 'GET').length,
      put: requests.filter((r) => String(r.method).toUpperCase() === 'PUT').length,
      expectedGet: 20,
      expectedPut: 10,
    };
    assert(result.requestTotals.get === 20 && result.requestTotals.put === 10, `total GET/PUT count mismatch: ${JSON.stringify(result.requestTotals)}`);
    result.stamps = {
      desktop: [pdfNew.ts, snapshotOld.ts, snapshotNew.ts, oldOnly.ts, oldToNew.ts, newToOld.ts].sort((a, b) => a - b),
      sharedWinnerByStage: [t + 100, t + 300, t + 400, t + 500],
      serverOnly: serverOnly.stamp.at,
    };
    result.fixtures = { generated: true, localAdoptions: 0, serverOnlyPreserved: true };
  } catch (error) {
    bodyError = `${String(error?.message ?? error)}\n${String(error?.stack ?? '')}`;
  } finally {
    const cleanupStep = async (name, fn) => {
      try { await fn(); } catch (error) { errors.push(`${name}: ${String(error)}`); }
    };
    await cleanupStep('suspend loopback switches', async () => {
      if (Zotero.Prefs.get('zotero-tts.webdav.syncPositions') !== false) setPref('webdav.syncPositions', false);
      await waitIdle();
      for (const key of ['webdav.autoUploadSettings', 'webdav.syncSettings', 'webdav.enabled']) {
        if (Zotero.Prefs.get(`zotero-tts.${key}`) !== false) setPref(key, false);
      }
      await waitIdle();
      assert(['webdav.enabled', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings'].every((key) => Zotero.Prefs.get(`zotero-tts.${key}`) === false), 'loopback switches remain on');
    });
    await cleanupStep('remove synthetic stub files', async () => {
      const current = (await children()).map(basename);
      const unexpected = current.filter((name) => !allNames.includes(name));
      assert(unexpected.length === 0, `unexpected stub files left untouched: ${JSON.stringify(unexpected)}`);
      for (const name of allNames) await IOUtils.remove(pathFor(name), { ignoreAbsent: true });
      assert((await children()).length === 0, 'stub files directory did not return to empty');
    });
    await cleanupStep('confirm designated URL prefix', async () => {
      const testURL = snapshot.testURL;
      const off = ['webdav.enabled', 'webdav.syncPositions', 'webdav.autoUploadSettings', 'webdav.syncSettings'].every((key) => Zotero.Prefs.get(`zotero-tts.${key}`) === false);
      assert(off, 'switches must be off before the designated URL prefix check');
      setPref('webdav.url', testURL);
      const norm = (value) => String(value || '').trim().replace(/\/+$/, '');
      result.cleanup.designatedURLMatches = norm(Zotero.Prefs.get('zotero-tts.webdav.url')) === norm(testURL);
      assert(result.cleanup.designatedURLMatches, 'designated test URL prefix did not match');
      result.cleanup.switchesOffForPrefixCheck = true;
    });
    await cleanupStep('restore original prefs and local baseline', async () => {
      const prefix = 'extensions.zotero.zotero-tts.';
      for (const [key, saved] of Object.entries(snapshot.prefs)) {
        const full = prefix + key;
        if (saved.has) {
          if (JSON.stringify(Zotero.Prefs.get(`zotero-tts.${key}`)) !== JSON.stringify(saved.value)) {
            Zotero.Prefs.set(`zotero-tts.${key}`, saved.value);
          }
        }
        else if (Services.prefs.prefHasUserValue(full)) Services.prefs.clearUserPref(full);
      }
      const mismatches = [];
      for (const [key, saved] of Object.entries(snapshot.prefs)) {
        if (Services.prefs.prefHasUserValue(prefix + key) !== saved.has || JSON.stringify(Zotero.Prefs.get(`zotero-tts.${key}`)) !== JSON.stringify(saved.value)) mismatches.push(key);
      }
      const final = diag();
      const base = snapshot.positionSync;
      const localMatches = final.localEntries === base.localEntries && final.tombstones === base.tombstones &&
        final.shared.documents.documents === base.shared.documents.documents && final.shared.documents.items === base.shared.documents.items;
      assert(mismatches.length === 0, `preference snapshot mismatch: ${JSON.stringify(mismatches)}`);
      assert(localMatches, 'local position/document baseline changed');
      result.cleanup.prefsRestored = true;
      result.cleanup.localBaselineRestored = true;
      result.cleanup.folderOff = final.folder === false;
      assert(result.cleanup.folderOff, 'WebDAV folder is not off after restore');
      delete Zotero.__openReader128Snapshot;
    });
  }
  result.cleanup.errors = errors;
  if (bodyError || errors.length) fail(JSON.stringify({ bodyError, cleanupErrors: errors, cleanup: result.cleanup }));
  result.ok = true;
  return JSON.stringify(result);
})()
