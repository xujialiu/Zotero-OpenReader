import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it.runIf(process.platform === 'win32')('keeps a live Windows session after its recorded launcher exits', async () => {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'openreader-test-'));
  const bin = await mkdtemp(path.join(tmpdir(), 'test launcher '));
  const executable = path.join(bin, 'zotero.exe');
  const data = path.join(root, 'data');
  const sentinel = path.join(data, 'keep.txt');
  const close = () => execFileSync(process.execPath, ['scripts/test-zotero.mjs', 'close', root], { stdio: 'pipe' });
  let child;
  try {
    await copyFile(process.execPath, executable);
    await mkdir(data);
    await writeFile(sentinel, 'intact');
    // Legacy Windows records contain only the launcher's PID.
    const launcher = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await once(launcher, 'exit');
    await writeFile(path.join(root, 'session.json'), JSON.stringify({ pid: launcher.pid, port: 12345 }));
    child = spawn(executable, ['-e', 'setInterval(() => {}, 1000)', '--',
      '-profile', path.join(root, 'profile'), '-datadir', data], { stdio: 'ignore' });
    await once(child, 'spawn');
    expect(close).toThrow(/still using the session/);
    expect(await readFile(sentinel, 'utf8')).toBe('intact');
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    expect(JSON.parse(close().toString())).toEqual({ closed: root });
    await expect(realpath(root)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
}, 30000);
