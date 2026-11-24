// Prepare a disposable Zotero and bind every tester call to its identity.
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import AdmZip from 'adm-zip';

const bridgeId = 'mcp-rdp@zotero.org';
const readerId = 'zotero-tts@xujialiu.top';
const temp = await fs.realpath(os.tmpdir());
const windows = process.platform === 'win32';
const usage = [
  'node scripts/test-zotero.mjs start ZOTERO_EXECUTABLE SERVER_PACKAGE_DIR BRIDGE.xpi OPENREADER.xpi [EXTRA.xpi ...]',
  'node scripts/test-zotero.mjs call SESSION_DIR TOOL [ARGUMENTS.json]  (use - for stdin)',
  'node scripts/test-zotero.mjs set-pref SESSION_DIR PLUGIN_KEY VALUE.json  (use - for stdin)',
  'node scripts/test-zotero.mjs close SESSION_DIR',
].join('\n');

async function availablePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (port === 6100) return availablePort();
  return port;
}

function mcpServer(packageDir) {
  const require = createRequire(path.join(packageDir, 'package.json'));
  const pkg = require('./package.json');
  if (pkg.name !== '@introfini/mcp-server-zotero-dev') throw Error('Expected the installed zotero-dev MCP server package directory');
  return {
    entry: path.resolve(packageDir, pkg.bin['mcp-server-zotero-dev']),
    Client: require('@modelcontextprotocol/sdk/client/index.js').Client,
    StdioClientTransport: require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport,
  };
}

function sessionPrefs(data, port) {
  const prefix = 'extensions.zotero.zotero-tts.';
  return {
    'extensions.zotero.useDataDir': true,
    'extensions.zotero.dataDir': data,
    'extensions.zotero.firstRun2': false,
    'extensions.zotero.firstRun': false,
    'extensions.zotero.httpServer.enabled': false,
    'extensions.zotero.sync.autoSync': false,
    'extensions.autoDisableScopes': 0,
    'extensions.enabledScopes': 15,
    'extensions.update.enabled': false,
    'extensions.mcp-rdp.enabled': true,
    'extensions.mcp-rdp.port': port,
    [prefix + 'webdav.enabled']: false,
    [prefix + 'webdav.syncPositions']: false,
    [prefix + 'webdav.autoUploadSettings']: false,
    [prefix + 'webdav.syncSettings']: false,
    [prefix + 'zotero-standard.enabled']: false,
    [prefix + 'zotero-premium.enabled']: false,
    [prefix + 'system.enabled']: true,
    [prefix + 'readAloud.volume']: 0,
  };
}

async function stageXpi(file, extensions, expectedId) {
  const bytes = await fs.readFile(file);
  const zip = new AdmZip(bytes);
  const manifest = JSON.parse(zip.readAsText('manifest.json'));
  const id = manifest.applications?.zotero?.id;
  if (!id || !/^[\w.@{}-]+$/.test(id) || (expectedId && id !== expectedId)) throw Error('Unexpected Zotero add-on ID in ' + file);
  await fs.writeFile(path.join(extensions, id + '.xpi'), bytes, { flag: 'wx' });
  const hash = data => createHash('sha256').update(data).digest('hex');
  const result = { id, version: manifest.version, sha256: hash(bytes) };
  if (id === readerId) result.bundleSha256 = hash(zip.readFile('content/zotero-tts.js'));
  return result;
}

async function withBridge(root, session, work, bindWindowsPid = false) {
  const { entry, Client, StdioClientTransport } = mcpServer(session.serverPackage);
  const client = new Client({ name: 'openreader-test', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: [entry], stderr: 'ignore',
    env: { ZOTERO_RDP_HOST: '127.0.0.1', ZOTERO_RDP_PORT: String(session.port) },
  });
  try {
    await client.connect(transport);
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      if (result.isError) throw Error(name + ' failed on the disposable bridge');
      return result.content;
    };
    const ping = (await call('zotero_ping'))[0]?.text ?? '';
    const data = /^\s*Data directory: (.+)$/m.exec(ping)?.[1]?.trim();
    const port = /^\s*RDP port: (\d+)$/m.exec(ping)?.[1];
    if (!data || Number(port) !== session.port || await fs.realpath(data) !== path.join(root, 'data')) {
      throw Error('Disposable Zotero ping did not match the session data directory and port');
    }
    const observe = async code => {
      const reply = (await call('zotero_execute_js', { code }))[0]?.text ?? '';
      if (!reply.startsWith('Result:\n')) throw Error('Disposable Zotero did not return the requested observation');
      return JSON.parse(reply.slice('Result:\n'.length));
    };
    const identity = await observe('JSON.stringify({profile:PathUtils.profileDir, pid:Services.appinfo.processID})');
    if (await fs.realpath(identity.profile) !== path.join(root, 'profile')) {
      throw Error('Disposable Zotero profile differs from the launch record');
    }
    if (identity.pid !== session.pid) {
      if (!bindWindowsPid || !(await windowsSessionPids(root, session.executable)).includes(identity.pid)) {
        throw Error('Disposable Zotero process differs from the launch record');
      }
      // The launcher can exit before the bridge opens. Pin the verified runtime
      // before setup calls and atomically replace the early recovery record.
      const next = path.join(root, 'session.next');
      await fs.writeFile(next, JSON.stringify({ ...session, pid: identity.pid }), { mode: 0o600 });
      await fs.rename(next, path.join(root, 'session.json'));
      session.pid = identity.pid;
    }
    return await work(call, observe);
  } finally {
    await client.close();
  }
}

function running(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function windowsSessionPids(root, executable) {
  const script = await fs.readFile(new URL('./windows-zotero-pids.ps1', import.meta.url), 'utf8');
  const powershell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await promisify(execFile)(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, timeout: 10000,
    env: { ...process.env, OPENREADER_IMAGE_NAME: path.basename(executable || 'zotero.exe'),
      OPENREADER_EXECUTABLE: executable || '', OPENREADER_SESSION_ROOT: root },
  });
  return stdout.trim() ? stdout.trim().split(/\s+/).map(Number) : [];
}

async function removeAfterExit(root, pid, executable) {
  for (let i = 0; i < 100 && running(pid); i++) await sleep(150);
  if (running(pid)) throw Error('Disposable process has not exited. Retained ' + root);
  if (windows && (await windowsSessionPids(root, executable)).length) {
    throw Error('A disposable Zotero process is still using the session. Retained ' + root);
  }
  await fs.rm(root, { recursive: true, maxRetries: 3 });
}

// Serialized for zotero_execute_js and evaluated inside the verified instance.
async function inspectSetup(ids, expectedPrefs) {
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const active = await Promise.all(ids.map(async id => {
    const addon = await AddonManager.getAddonByID(id);
    return addon?.isActive ? addon.version : null;
  }));
  const diagnostics = Zotero.ZoteroTTS.diagnostics;
  const report = JSON.parse(diagnostics.startup());
  return JSON.stringify({
    active, version: report.version, steps: report.steps?.length, failed: report.failed,
    folder: JSON.parse(await diagnostics.positionSync()).folder,
    prefsOK: Object.entries(expectedPrefs).every(([key, value]) => Zotero.Prefs.get(key, true) === value),
  });
}

async function start([binary, serverPackage, bridge, plugin, ...extra]) {
  if (!plugin) throw Error(usage);
  const executable = await fs.realpath(binary);
  const server = await fs.realpath(serverPackage);
  mcpServer(server);
  const root = await fs.mkdtemp(path.join(temp, 'openreader-test-'));
  const profile = path.join(root, 'profile'), data = path.join(root, 'data');
  const extensions = path.join(profile, 'extensions');
  let child;
  let session;
  try {
    await fs.mkdir(extensions, { recursive: true });
    await fs.mkdir(data);
    const addons = [await stageXpi(bridge, extensions, bridgeId), await stageXpi(plugin, extensions, readerId)];
    for (const file of extra) addons.push(await stageXpi(file, extensions));
    const port = await availablePort();
    const prefs = sessionPrefs(data, port);
    // Seed the fresh profile once so later test settings survive a restart.
    await fs.writeFile(path.join(profile, 'prefs.js'), Object.entries(prefs).map(([k, v]) =>
      'user_pref(' + JSON.stringify(k) + ', ' + JSON.stringify(v) + ');\n').join(''));
    child = spawn(executable, ['-no-remote', '-profile', profile, '-datadir', data], { detached: true, stdio: 'ignore' });
    await once(child, 'spawn');
    child.unref();
    session = { pid: child.pid, port, executable, serverPackage: server, addons };
    await fs.writeFile(path.join(root, 'session.json'), JSON.stringify(session), { flag: 'wx', mode: 0o600 });
    console.error('Disposable session: ' + root);
    const expectedPrefs = Object.fromEntries(Object.entries(prefs).filter(([key]) => key.startsWith('extensions.zotero.')));
    const probe = `(${inspectSetup})(${JSON.stringify(addons.map(a => a.id))}, ${JSON.stringify(expectedPrefs)})`;
    // The listener may be up before the candidate finishes async startup.
    const until = Date.now() + 60000;
    let lastError;
    do {
      if (!windows && (child.exitCode !== null || child.signalCode !== null)) throw Error('Disposable Zotero exited during startup');
      try {
        const ready = await withBridge(root, session, (_call, observe) => observe(probe), windows && session.pid === child.pid);
        if (ready.failed?.length) throw Error('OpenReader startup failed: ' + ready.failed.length + ' step(s)');
        if (addons.every((a, i) => a.version === ready.active[i]) && ready.version === addons[1].version &&
            ready.steps > 0 && ready.failed?.length === 0 && ready.folder === false && ready.prefsOK) {
          for (const addon of addons) {
            const installed = await fs.readFile(path.join(extensions, addon.id + '.xpi'));
            if (createHash('sha256').update(installed).digest('hex') !== addon.sha256) throw Error('Installed XPI differs for ' + addon.id);
          }
          await withBridge(root, session, (_call, observe) =>
            observe('(() => { Zotero.getMainWindow().minimize(); return JSON.stringify(true); })()'));
          return { root, profile, data, ...session, startupSteps: ready.steps, folder: false, volume: 0 };
        }
        lastError = Error('Waiting for active add-ons and isolated settings');
      } catch (error) { lastError = error; }
      await sleep(500);
    } while (Date.now() < until);
    throw lastError;
  } catch (error) {
    if (child?.pid) {
      try {
        if (windows && session) await closeSession(root, session);
        else {
          child.kill();
          await removeAfterExit(root, child.pid, executable);
        }
      } catch (cleanupError) {
        throw Error(error.message + '. Cleanup incomplete at ' + root + ': ' + cleanupError.message);
      }
    } else await fs.rm(root, { recursive: true });
    throw error;
  }
}

async function jsonInput(input) {
  const json = input === '-' ? await new Response(process.stdin).text() : await fs.readFile(input, 'utf8');
  return JSON.parse(json);
}

// Set only declared OpenReader preferences. A misspelling otherwise creates
// a new Gecko preference and even a successful read-back checks the wrong key.
async function setPluginPref(root, session, key, input) {
  const value = await jsonInput(input);
  const type = { boolean: 128, string: 32, number: 64 }[typeof value];
  if (!type || (type === 64 && (!Number.isInteger(value) || value < -2147483648 || value > 2147483647))) {
    throw Error('Expected a boolean, string or signed 32-bit integer preference value');
  }
  const fullKey = 'extensions.zotero.zotero-tts.' + key;
  const name = JSON.stringify(fullKey);
  return withBridge(root, session, async (_call, observe) => {
    const declaredType = await observe(`JSON.stringify(Services.prefs.getDefaultBranch("").getPrefType(${name}))`);
    if (declaredType !== type) throw Error('Unknown OpenReader setting or incorrect value type: ' + key);
    await observe(`(() => { Zotero.Prefs.set(${name}, ${JSON.stringify(value)}, true); return JSON.stringify(true); })()`);
    const verified = await observe(`JSON.stringify(Zotero.Prefs.get(${name}, true) === ${JSON.stringify(value)})`);
    if (!verified) throw Error('OpenReader preference read-back failed: ' + key);
    return { key: fullKey, verified };
  });
}

async function closeSession(root, session) {
  if (running(session.pid)) {
    await withBridge(root, session, (_call, observe) =>
      observe('(() => { Zotero.getMainWindow().setTimeout(() => Services.startup.quit(Services.startup.eAttemptQuit), 200); return JSON.stringify(true); })()'));
  }
  await removeAfterExit(root, session.pid, session.executable);
}

async function main([action, dir, ...args]) {
  if (action === 'start') return start([dir, ...args]);
  if (!dir || !['call', 'set-pref', 'close'].includes(action)) throw Error(usage);
  const root = await fs.realpath(dir);
  if (path.dirname(root) !== temp || !/^openreader-test-[a-zA-Z0-9]{6}$/.test(path.basename(root))) throw Error('Expected a generated session directory');
  const session = JSON.parse(await fs.readFile(path.join(root, 'session.json'), 'utf8'));
  if (!Number.isSafeInteger(session.pid) || session.pid <= 0 || !Number.isInteger(session.port) ||
      session.port <= 0 || session.port > 65535 || session.port === 6100) throw Error('Invalid session identity');
  if (action === 'close') {
    if (args.length) throw Error(usage);
    await closeSession(root, session);
    return { closed: root };
  }
  const [tool, input] = args;
  if (!tool || args.length > 2) throw Error(usage);
  if (action === 'set-pref') {
    if (!input) throw Error(usage);
    return setPluginPref(root, session, tool, input);
  }
  const params = input ? await jsonInput(input) : {};
  return withBridge(root, session, call => call(tool, params));
}

try { console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2)); }
catch (error) { console.error(error.message); process.exitCode = 1; }
