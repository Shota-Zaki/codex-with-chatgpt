import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  validateConfig,
  volumeInfo,
  volumeReady,
  renderPlist,
  workerEnvironment,
  acquireLock,
  appendLog,
  LOG_LIMIT,
  retryDelay,
  writePrivate,
} from '../../runtime/service-common.mjs';

const config = () => ({
  version: 1,
  home: '/Users/test',
  runtimeDir: '/Users/test/Homelab/codex-with-chatgpt',
  repository: '/Volumes/ZAKKO_DEV/repos/codex-with-chatgpt',
  volume: '/Volumes/ZAKKO_DEV',
  volumeUUID: '01234567-89AB-CDEF-0123-456789ABCDEF',
  workspace: '/Volumes/ZAKKO_DEV/repos',
  node: '/opt/homebrew/bin/node',
  user: 'test',
  stateDir: '/Users/test/Library/Application Support/codex-with-chatgpt',
});

function temp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-service-'));
  try { fn(dir); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('指定範囲の構成を受理', () => {
  assert.equal(validateConfig(config()).version, 1);
});

for (const [key, value] of [
  ['workspace', '/Users/test'],
  ['workspace', '/Volumes/ZAKKO_DEV'],
  ['workspace', '/Volumes/ZAKKO_DEV/data'],
  ['workspace', '/Volumes/ZAKKO_DEV/backups'],
  ['repository', '/Volumes/ZAKKO_DEV/repos-other/app'],
  ['node', '/Volumes/ZAKKO_DEV/node'],
  ['runtimeDir', '/tmp/c2c'],
  ['volumeUUID', ''],
  ['user', 'test;echo bad'],
]) {
  test(`誤設定を拒否: ${key}=${value}`, () => {
    assert.throws(() => validateConfig({ ...config(), [key]: value }));
  });
}

test('diskutilをshellなし・timeout付きで呼び出す', () => {
  const result = volumeInfo('/Volumes/ZAKKO_DEV', (cmd, args, opts) => {
    assert.equal(cmd, '/usr/sbin/diskutil');
    assert.deepEqual(args, ['info', '-plist', '/Volumes/ZAKKO_DEV']);
    assert.equal(opts.timeout, 5000);
    return '<plist><dict><key>VolumeUUID</key><string>0123</string><key>MountPoint</key><string>/Volumes/ZAKKO_DEV</string></dict></plist>';
  });
  assert.equal(result.uuid, '0123');
});

test('UUID・mount・実体パスが一致したときだけ起動可能', () => {
  const c = config();
  const info = () => ({ uuid: c.volumeUUID, mount: c.volume });
  assert.equal(volumeReady(c, info, x => x), true);
  assert.equal(volumeReady(c, () => ({ ...info(), uuid: 'OTHER' }), x => x), false);
  assert.equal(volumeReady(c, () => ({ ...info(), mount: '/Volumes/ZAKKO_DEV 1' }), x => x), false);
  assert.equal(volumeReady(c, info, () => '/Users/test'), false);
  assert.equal(volumeReady(c, () => { throw new Error('unmounted'); }, x => x), false);
});

test('plistはsystemのみユーザーを指定し外部ドライブを作業ディレクトリにしない', () => {
  const c = config();
  const daemon = renderPlist(c, true);
  const agent = renderPlist(c);
  assert.match(daemon, /<key>UserName<\/key><string>test<\/string>/);
  assert.doesNotMatch(agent, /UserName/);
  assert.match(daemon, /<key>WorkingDirectory<\/key><string>\/Users\/test<\/string>/);
  assert.match(daemon, /<key>ThrottleInterval<\/key><integer>60<\/integer>/);
  assert.match(daemon, /<key>Umask<\/key><integer>63<\/integer>/);
  assert.doesNotMatch(daemon, /token|Bearer|sudo/);
});

test('plistのXML特殊文字をエスケープ', () => {
  const c = config();
  c.home = '/Users/A&B';
  c.runtimeDir = c.home + '/Homelab/codex-with-chatgpt';
  assert.match(renderPlist(c), /A&amp;B/);
});

test('子プロセスにAPIキー・NODE_OPTIONS・Git設定を継承しない', () => {
  process.env.C2C_TEST_SECRET = 'private';
  const env = workerEnvironment(config());
  delete process.env.C2C_TEST_SECRET;
  assert.equal(env.HOME, '/Users/test');
  assert.equal(env.C2C_TEST_SECRET, undefined);
  for (const key of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'OPENAI_API_KEY',
    'GIT_CONFIG_GLOBAL',
    'CLOUDFLARE_API_TOKEN',
  ]) {
    assert.equal(env[key], undefined);
  }
});

test('同時起動を拒否し死んだプロセスのロックのみ復旧', () => temp(dir => {
  const lock = path.join(dir, 'run.lock');
  const release = acquireLock(lock);
  assert.throws(() => acquireLock(lock, () => true), /SERVICE_ALREADY_RUNNING/);
  release();
  assert.equal(fs.existsSync(lock), false);

  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), '{"pid":2147483000}');
  const release2 = acquireLock(lock, () => false);
  release2();
  assert.equal(fs.existsSync(lock), false);
}));

test('壊れたロックを勝手に削除しない', () => temp(dir => {
  const lock = path.join(dir, 'run.lock');
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, 'owner.json'), 'bad');
  assert.throws(() => acquireLock(lock), /SERVICE_LOCK_UNCERTAIN/);
  assert.equal(fs.existsSync(lock), true);
}));

test('ログは最大3世代、機密を含む任意文字列を受理しない', () => temp(dir => {
  const log = path.join(dir, 'service.log');
  for (let i = 0; i < 4; i++) {
    fs.writeFileSync(log, 'x'.repeat(LOG_LIMIT));
    appendLog(dir, 'WORKER_RETRY', 'exit:12');
  }
  assert.equal(fs.existsSync(log + '.1'), true);
  assert.equal(fs.existsSync(log + '.2'), true);
  assert.equal(fs.existsSync(log + '.3'), false);
  assert.equal(fs.statSync(log).mode & 0o777, 0o600);
  assert.throws(() => appendLog(dir, 'ERR', 'Authorization=SECRET'), /SERVICE_LOG_FORMAT/);
}));

test('ログのsymlinkを拒否', () => temp(dir => {
  const target = path.join(dir, 'other');
  fs.writeFileSync(target, 'preserve');
  fs.symlinkSync(target, path.join(dir, 'service.log'));
  assert.throws(() => appendLog(dir, 'START'), /SERVICE_LOG_PATH/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'preserve');
}));

test('設定を原子的・所有者限定で保存', () => temp(dir => {
  const file = path.join(dir, 'config.json');
  writePrivate(file, '{}');
  writePrivate(file, '{"v":1}');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"v":1}');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(dir), ['config.json']);
}));

test('再試行は5秒から5分の範囲で増加', () => {
  assert.equal(retryDelay(0), 5000);
  assert.equal(retryDelay(1), 10000);
  assert.equal(retryDelay(20), 300000);
});

test('planはLinux上でも実行できる', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/macos-service.mjs', 'plan'],
    { cwd: new URL('../..', import.meta.url), encoding: 'utf8' }
  );
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout)['共有範囲'], '/Volumes/ZAKKO_DEV/repos');
});

test('必要なトンネル設定だけを引き継ぐ', () => {
  const c = validateConfig({
    ...config(),
    cloudflaredPath: '/opt/homebrew/bin/cloudflared',
    tunnelProtocol: 'http2',
  });
  assert.equal(workerEnvironment(c).C2C_CLOUDFLARED_PATH, c.cloudflaredPath);
  assert.equal(workerEnvironment(c).C2C_TUNNEL_PROTOCOL, 'http2');
});

test('外部ボリューム上の接続バイナリと不正な通信方式を拒否', () => {
  assert.throws(() => validateConfig({
    ...config(),
    cloudflaredPath: '/Volumes/ZAKKO_DEV/cloudflared',
  }));
  assert.throws(() => validateConfig({
    ...config(),
    tunnelProtocol: 'invalid',
  }));
});
