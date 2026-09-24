import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { readConfig, volumeReady, workerEnvironment, acquireLock, appendLog, retryDelay } from './service-common.mjs';

async function main() {
  if (process.platform !== 'darwin') throw new Error('SERVICE_MACOS_REQUIRED');
  const c = readConfig(process.argv[2]);
  const release = acquireLock(path.join(c.runtimeDir, 'run.lock'));
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  let child = null;
  let closePromise = Promise.resolve();
  let failures = 0;
  let previousEvent = '';

  const event = (name, detail = '') => {
    if (`${name}:${detail}` === previousEvent) return;
    previousEvent = `${name}:${detail}`;
    appendLog(c.runtimeDir, name, detail);
  };

  const pause = ms => sleep(ms, undefined, { signal: abort.signal })
    .catch(e => { if (e.name !== 'AbortError') throw e; });

  async function stopChild() {
    if (!child) return;
    const pid = child.pid;
    if (pid && child.exitCode === null && child.signalCode === null) {
      try { process.kill(-pid, 'SIGTERM'); } catch { /* 自分で生成したプロセス群のみ。 */ }
    }
    let timer;
    await Promise.race([
      closePromise,
      new Promise(resolve => { timer = setTimeout(resolve, 15000); }),
    ]);
    clearTimeout(timer);
    if (pid && child.exitCode === null && child.signalCode === null) {
      try { process.kill(-pid, 'SIGKILL'); } catch { /* 残存した子プロセス群を回収。 */ }
    }
    child = null;
  }

  try {
    while (!abort.signal.aborted) {
      if (!volumeReady(c)) {
        event('WAIT_VOLUME');
        await pause(30000);
        continue;
      }
      if (!fs.existsSync(path.join(c.repository, 'dist', 'bridge', 'server.js'))) {
        event('WAIT_BUILD');
        await pause(60000);
        continue;
      }

      const start = Date.now();
      let closed = false;
      let exitCode = null;
      child = spawn(
        c.node,
        [path.join(c.repository, 'runtime', 'service-worker.mjs'), process.argv[2]],
        {
          cwd: c.repository,
          env: workerEnvironment(c),
          stdio: 'ignore',
          detached: true,
        }
      );
      closePromise = new Promise(resolve => {
        child.once('error', () => { closed = true; exitCode = 90; resolve(); });
        child.once('exit', () => {
          try { process.kill(-child.pid, 'SIGTERM'); } catch { /* 既に終了済み。 */ }
        });
        child.once('close', code => { closed = true; exitCode = code; resolve(); });
      });
      event('WORKER_STARTED');

      while (!closed && !abort.signal.aborted) {
        await pause(30000);
        if (!abort.signal.aborted && !volumeReady(c)) {
          event('VOLUME_REMOVED');
          break;
        }
      }

      await stopChild();
      if (abort.signal.aborted) break;

      failures = Date.now() - start > 120000 ? 0 : failures + 1;
      event('WORKER_RETRY', `exit:${Number.isInteger(exitCode) ? exitCode : 'unknown'}`);
      await pause(retryDelay(failures));
    }
  } finally {
    await stopChild();
    event('SERVICE_STOPPED');
    release();
  }
}

main().catch(() => {
  process.stderr.write('C2Cの起動管理を開始できません。設定・ロック・権限を確認してください。\n');
  process.exitCode = 1;
});
