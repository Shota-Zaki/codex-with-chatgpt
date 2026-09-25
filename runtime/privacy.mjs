import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MARKER = Symbol.for('c2c.private-fetch.v1');

export function stateDirectory(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.C2C_STATE_DIR?.trim()) return path.resolve(env.C2C_STATE_DIR);
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'codex-with-chatgpt');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'codex-with-chatgpt');
  return path.join(env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'codex-with-chatgpt');
}

// 認証トークンは読み込まない。固定トンネル設定のホスト名だけを参照する。
export function configuredHosts(stateDir = stateDirectory()) {
  const hosts = new Set();
  const dir = path.join(stateDir, 'tunnels');
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return hosts; }
  for (const entry of entries.slice(0, 1024)) {
    if (!entry.isFile() || !/^[a-f0-9]{12}\.json$/.test(entry.name)) continue;
    try {
      const file = path.join(dir, entry.name);
      if (fs.statSync(file).size > 32768) continue;
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value.preference !== 'named' || typeof value.hostname !== 'string') continue;
      const url = new URL(`https://${value.hostname}`);
      if (url.hostname === value.hostname.toLowerCase() && !url.port && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash) hosts.add(url.hostname);
    } catch { /* 壊れた設定は送信許可に利用しない。 */ }
  }
  return hosts;
}

export function classifyRequest(request, hosts) {
  const url = new URL(request.url);
  if (url.username || url.password || url.hash) return 'deny';
  const loopback = url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (loopback && url.protocol === 'http:') return 'local';
  const namedHealth = hosts.has(url.hostname);
  const quickHealth = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/i.test(url.hostname);
  if (url.protocol === 'https:' && !url.port && (namedHealth || quickHealth)
    && url.hostname.toLowerCase() !== 'api.trycloudflare.com'
    && url.pathname === '/health' && !url.search
    && (request.method === 'GET' || request.method === 'HEAD') && request.body === null) return 'health';
  return 'deny';
}

export function createPrivateFetch(fetchImpl, hostProvider = configuredHosts) {
  if (typeof fetchImpl !== 'function') throw new TypeError('HTTP通信機能を初期化できません。');
  return async function privateFetch(input, init) {
    let request;
    try { request = new Request(input, init); }
    catch { throw new Error('C2C_EGRESS_DENIED: HTTP要求を安全に構成できません。'); }
    const kind = classifyRequest(request, hostProvider());
    if (kind === 'deny') {
      // URL・クエリー・ヘッダー・本文をエラーに含めない。
      throw new Error('C2C_EGRESS_DENIED: この通信先または送信内容は許可されていません。');
    }
    if (kind === 'local') return fetchImpl(new Request(request, { redirect: 'error' }));
    // 公開先への通信は本文なしの稼働確認のみ。認証情報等を引き継がない。
    return fetchImpl(new Request(request.url, {
      method: request.method, headers: { accept: 'application/json' },
      redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: request.signal,
    }));
  };
}

export function installPrivacyFetch() {
  if (globalThis[MARKER]) return;
  globalThis.fetch = createPrivateFetch(globalThis.fetch.bind(globalThis));
  Object.defineProperty(globalThis, MARKER, { value: true });
}
