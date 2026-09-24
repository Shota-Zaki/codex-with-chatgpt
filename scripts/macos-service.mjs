#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { stateDirectory } from '../runtime/privacy.mjs';
import { LABEL, RUNTIME_FILES, validateConfig, volumeInfo, renderPlist, writePrivate } from '../runtime/service-common.mjs';

function main() {
  const command = process.argv[2] || 'plan';
  if (!['plan', 'prepare', 'install-agent', 'start-agent', 'stop-agent', 'status'].includes(command) || process.argv.length > 3) {
    throw new Error('使い方: node scripts/macos-service.mjs plan|prepare|install-agent|start-agent|stop-agent|status');
  }

  const home = fs.realpathSync.native(os.homedir());
  const runtimeDir = path.join(home, 'Homelab', 'codex-with-chatgpt');

  if (command === 'plan') {
    console.log(JSON.stringify({
      共有範囲: '/Volumes/ZAKKO_DEV/repos',
      起動管理: runtimeDir,
      認証保存先: stateDirectory(),
      起動方式: 'ログアウト後も稼働させる場合はprepareで生成するLaunchDaemonを使用',
      外部ドライブ: 'VolumeUUIDが一致する場合のみ起動。未接続なら待機',
      通信: '固定トンネル専用。C2Cのfetchによる外部送信は本文なしのhealth確認のみ',
      実行: 'このコマンドは設定の書き込み・起動・通信を行いません',
    }, null, 2));
    return;
  }

  if (process.platform !== 'darwin') throw new Error('この操作はMac上で実行してください。');
  if (process.getuid?.() === 0) {
    throw new Error('通常ユーザーで実行してください。システム登録は生成されたplistを確認して別途行います。');
  }

  const domain = `gui/${process.getuid()}`;
  const agent = path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);

  if (command === 'status') {
    try {
      execFileSync('/bin/launchctl', ['print', `${domain}/${LABEL}`], { stdio: 'inherit' });
    } catch {
      console.log('ユーザーサービスは未登録または停止中です。システムサービスは launchctl print system/' + LABEL + ' で確認します。');
    }
    return;
  }

  if (command === 'start-agent') {
    execFileSync('/bin/launchctl', ['bootstrap', domain, agent], { stdio: 'inherit' });
    return;
  }

  if (command === 'stop-agent') {
    execFileSync('/bin/launchctl', ['bootout', `${domain}/${LABEL}`], { stdio: 'inherit' });
    return;
  }

  const repository = fs.realpathSync.native(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const disk = volumeInfo('/Volumes/ZAKKO_DEV');
  if (disk.mount !== '/Volumes/ZAKKO_DEV') throw new Error('外部ドライブの接続を確認してください。');

  const c = validateConfig({
    version: 1,
    home,
    runtimeDir,
    repository,
    volume: disk.mount,
    volumeUUID: disk.uuid,
    workspace: '/Volumes/ZAKKO_DEV/repos',
    node: fs.realpathSync.native(process.execPath),
    user: os.userInfo().username,
    stateDir: stateDirectory(),
    ...(process.env.C2C_CLOUDFLARED_PATH?.trim()
      ? { cloudflaredPath: fs.realpathSync.native(process.env.C2C_CLOUDFLARED_PATH) }
      : {}),
    ...(process.env.C2C_TUNNEL_PROTOCOL?.trim()
      ? { tunnelProtocol: process.env.C2C_TUNNEL_PROTOCOL.trim().toLowerCase() }
      : {}),
  });

  if (!fs.existsSync(path.join(repository, 'dist', 'bridge', 'server.js'))) {
    throw new Error('先にテストとビルドを完了してください。');
  }

  for (const dir of [path.join(home, 'Homelab'), runtimeDir]) {
    if (fs.existsSync(dir) && fs.realpathSync.native(dir) !== dir) {
      throw new Error('起動管理ディレクトリにシンボリックリンクは使用できません。');
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.chmodSync(runtimeDir, 0o700);

  if (fs.existsSync(path.join(runtimeDir, 'run.lock'))) {
    throw new Error('既存サービスを停止してから起動管理を更新してください。');
  }

  for (const file of RUNTIME_FILES) {
    writePrivate(
      path.join(runtimeDir, file),
      fs.readFileSync(path.join(repository, 'runtime', file), 'utf8')
    );
  }
  writePrivate(path.join(runtimeDir, 'service.json'), JSON.stringify(c, null, 2) + '\n');

  const systemPlist = path.join(runtimeDir, `${LABEL}.system.plist`);
  writePrivate(systemPlist, renderPlist(c, true));
  execFileSync('/usr/bin/plutil', ['-lint', systemPlist], { stdio: 'inherit' });

  if (command === 'install-agent') {
    fs.mkdirSync(path.dirname(agent), { recursive: true });
    if (fs.existsSync(agent)) {
      throw new Error('既存のLaunchAgentは自動上書きしません。内容を確認してください。');
    }
    writePrivate(agent, renderPlist(c));
    execFileSync('/usr/bin/plutil', ['-lint', agent], { stdio: 'inherit' });
    console.log('ユーザーサービス定義を作成しました。まだ起動していません。ログアウト時には停止します。');
  } else {
    console.log(`システムサービス定義を作成しました。まだ登録・起動していません: ${systemPlist}`);
  }
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : '操作に失敗しました。');
  process.exitCode = 1;
}
