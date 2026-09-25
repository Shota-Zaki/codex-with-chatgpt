import './bootstrap.mjs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { readConfig, volumeReady } from './service-common.mjs';

async function main() {
  const c = readConfig(process.argv[2]);
  if (!volumeReady(c)) return 10;

  const load = relative => import(pathToFileURL(path.join(c.repository, 'dist', relative)).href);
  const [{ Workspace }, { findBridgeObservation }, { readTunnelState, isNamedTunnelReady }, { startBridge }, { adminFetch }, { SERVICE_NAME }] = await Promise.all([
    load('workspace/manager.js'),
    load('bridge/runtime.js'),
    load('tunnel/state.js'),
    load('bridge/server.js'),
    load('process/daemon.js'),
    load('version.js'),
  ]);

  const workspace = new Workspace(c.workspace);
  const observed = await findBridgeObservation(workspace.id);
  // 稼働中または状態不明の既存プロセスを停止・乗っ取りしない。
  if (observed.state === 'healthy' || observed.state === 'unknown') return 11;

  const tunnel = readTunnelState(workspace.id);
  if (!isNamedTunnelReady(tunnel) || tunnel.fallbackReason) return 12;

  const bridge = await startBridge({ workspaceRoot: workspace.root });
  const runtime = { port: bridge.port, adminToken: bridge.adminToken };
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  const pause = ms => sleep(ms, undefined, { signal: abort.signal })
    .catch(e => { if (e.name !== 'AbortError') throw e; });

  let unhealthy = 0;
  try {
    await adminFetch(runtime, 'POST', '/admin/tunnel/start', 90000);
    while (!abort.signal.aborted) {
      await pause(60000);
      if (abort.signal.aborted) break;
      try {
        const response = await fetch(`https://${tunnel.hostname}/health`, {
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        });
        const body = response.ok ? await response.json() : null;
        if (!body || body.status !== 'ok' || body.service !== SERVICE_NAME || !bridge.tunnel.status().running) {
          throw new Error('HEALTH');
        }
        unhealthy = 0;
      } catch {
        unhealthy += 1;
        if (unhealthy >= 3) return 13;
      }
    }
    return 0;
  } finally {
    await bridge.close();
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
  }
}

main()
  .then(code => { process.exitCode = code; })
  .catch(() => { process.exitCode = 14; });
