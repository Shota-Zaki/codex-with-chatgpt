import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createPrivateFetch, configuredHosts, stateDirectory } from '../../runtime/privacy.mjs';

const hosts = () => new Set(['c2c.example.com']);

function capture() {
  const calls = [];
  return {
    calls,
    fetch: createPrivateFetch(async req => {
      calls.push(req);
      return new Response('{}');
    }, hosts),
  };
}

for (const url of [
  'https://author.example/collect',
  'https://github.com/a/b',
  'https://api.openai.com/v1/responses',
  'http://169.254.169.254/',
  'http://localhost:48765/health',
  'https://c2c.example.com.evil.test/health',
  'https://c2c.example.com/health?token=secret',
  'https://c2c.example.com/mcp',
  'https://c2c.example.com:444/health',
]) {
  test(`許可外通信を拒否: ${url}`, async () => {
    const c = capture();
    await assert.rejects(c.fetch(url), /C2C_EGRESS_DENIED/);
    assert.equal(c.calls.length, 0);
  });
}

test('ローカル管理要求は認証を保持しリダイレクトを拒否', async () => {
  const c = capture();
  await c.fetch('http://127.0.0.1:48765/admin/info', {
    headers: { authorization: 'Bearer LOCAL' },
  });
  assert.equal(c.calls[0].headers.get('authorization'), 'Bearer LOCAL');
  assert.equal(c.calls[0].redirect, 'error');
});

test('公開稼働確認から認証ヘッダーとCookieを除去', async () => {
  const c = capture();
  await c.fetch(new Request('https://c2c.example.com/health', {
    headers: {
      authorization: 'Bearer SECRET',
      cookie: 'secret=1',
      'x-api-key': 'SECRET',
    },
  }));
  assert.deepEqual([...c.calls[0].headers], [['accept', 'application/json']]);
  assert.equal(c.calls[0].credentials, 'omit');
  assert.equal(c.calls[0].redirect, 'error');
  assert.equal(c.calls[0].body, null);
});

test('外部への本文送信を拒否', async () => {
  const c = capture();
  await assert.rejects(
    c.fetch('https://c2c.example.com/health', { method: 'POST', body: 'private source' }),
    /C2C_EGRESS_DENIED/
  );
  assert.equal(c.calls.length, 0);
});

test('Quick Tunnelのhealthだけを本文なしで許可', async () => {
  const c = capture();
  await c.fetch(new Request('https://random-words-123.trycloudflare.com/health', {
    headers: { authorization: 'Bearer SECRET', cookie: 'secret=1' },
  }));
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0].url, 'https://random-words-123.trycloudflare.com/health');
  assert.deepEqual([...c.calls[0].headers], [['accept', 'application/json']]);
  assert.equal(c.calls[0].body, null);
});

test('Quick Tunnelでもhealth以外は拒否', async () => {
  const c = capture();
  await assert.rejects(
    c.fetch('https://random-words-123.trycloudflare.com/mcp'),
    /C2C_EGRESS_DENIED/
  );
  assert.equal(c.calls.length, 0);
});

test('IPv6ループバック', async () => {
  const c = capture();
  await c.fetch('http://[::1]:48765/health');
  assert.equal(c.calls.length, 1);
});

test('状態保存先の既存仕様を保持', () => {
  assert.equal(
    stateDirectory({}, 'darwin', '/Users/test'),
    '/Users/test/Library/Application Support/codex-with-chatgpt'
  );
  assert.equal(
    stateDirectory({ C2C_STATE_DIR: '/private/c2c' }, 'darwin', '/Users/test'),
    '/private/c2c'
  );
});

test('固定トンネル設定のみを許可し壊れた設定とsymlinkを無視', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-privacy-'));
  try {
    const dir = path.join(root, 'tunnels');
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, '0123456789ab.json'),
      JSON.stringify({ preference: 'named', hostname: 'c2c.example.com' })
    );
    fs.writeFileSync(path.join(dir, '0123456789ac.json'), '{bad');
    fs.writeFileSync(
      path.join(dir, '0123456789ad.json'),
      JSON.stringify({ preference: 'quick', hostname: 'other.example.com' })
    );
    fs.writeFileSync(
      path.join(dir, '0123456789ae.json'),
      JSON.stringify({ preference: 'named', hostname: 'user:secret@evil.example' })
    );
    fs.symlinkSync(
      path.join(dir, '0123456789ad.json'),
      path.join(dir, '0123456789af.json')
    );
    assert.deepEqual([...configuredHosts(root)], ['c2c.example.com']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('更新確認はビルドも通信もせず未確認として終了', () => {
  const result = spawnSync(
    process.execPath,
    ['bin/c2c.js', 'update-check', '--force', '--json'],
    { cwd: new URL('../..', import.meta.url), encoding: 'utf8' }
  );
  assert.equal(result.status, 0);
  const value = JSON.parse(result.stdout);
  assert.equal(value.checked, false);
  assert.equal(value.disabled, true);
  assert.equal(value.updateAvailable, false);
});

test('不正URLの構築失敗でも秘密文字列をエラーへ含めない', async () => {
  const c = capture();
  for (const url of [
    'https://user:TOPSECRET@author.example/collect',
    'invalid URL TOPSECRET',
  ]) {
    await assert.rejects(
      c.fetch(url),
      error => /C2C_EGRESS_DENIED/.test(error.message) && !error.message.includes('TOPSECRET')
    );
  }
  assert.equal(c.calls.length, 0);
});
