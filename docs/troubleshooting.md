# トラブルシューティング

最初に実行する診断:

```bash
c2c doctor -w /Volumes/ZAKKO_DEV/repos
```

## Bridgeが停止している

確認:

```bash
c2c status -w /Volumes/ZAKKO_DEV/repos
```

起動:

```bash
c2c start -w /Volumes/ZAKKO_DEV/repos
```

ログ:

```bash
c2c logs -w /Volumes/ZAKKO_DEV/repos
c2c logs -w /Volumes/ZAKKO_DEV/repos --verbose
```

Bridge状態が「確認不能」の場合は、別Bridgeを重複起動しません。

保存済みPIDだけを根拠に別processを強制終了する処理も行いません。

## ChatGPT Connectorへ接続できない

主な確認対象:

1. Bridgeが稼働しているか
2. Named Tunnelが稼働しているか
3. OAuth認証が有効か
4. pairing codeが有効か
5. ChatGPT側のConnector URLが現在のURLか

診断:

```bash
c2c doctor -w /Volumes/ZAKKO_DEV/repos
```

固定ドメインの場合、URL自体を作り直す前にTunnel状態を確認します。

## 固定ドメインへ接続できない

状態:

```bash
c2c tunnel status -w /Volumes/ZAKKO_DEV/repos
```

Cloudflareへ再ログイン:

```bash
c2c tunnel login
```

固定ドメイン再設定:

```bash
c2c tunnel choose \
  -w /Volumes/ZAKKO_DEV/repos \
  --mode named \
  --zone zakkolab.com \
  --hostname c2c-mac-mini-control-center.zakkolab.com
```

Mac mini常駐サービスはNamed Tunnelを前提とします。

## ペアリングコードが無効・期限切れ

新しいコードを発行します。

```bash
c2c pair -w /Volumes/ZAKKO_DEV/repos
```

古いコードは使い回しません。

コードはChatGPTの認証画面が表示されてから発行します。

## 401が続く

考えられる原因:

- access token期限切れ
- refresh失敗
- `c2c unpair` 実行済み
- ChatGPT Connector側の認証状態不整合

必要に応じて再認証し、新しいpairing codeを使用します。

## cloudflaredが見つからない

macOS:

```bash
brew install cloudflared
```

確認:

```bash
which cloudflared
cloudflared --version
```

PATH外へ置く場合は絶対パスを指定できます。

```bash
export C2C_CLOUDFLARED_PATH=/opt/homebrew/bin/cloudflared
```

## QUICが不安定

企業ネットワーク等でUDPが制限されている場合:

```bash
export C2C_TUNNEL_PROTOCOL=http2
```

その後Bridgeを再起動します。

未指定時はcloudflared既定動作を使用します。

## ACCESS_DENIED_SENSITIVE_FILE

これは基本的に正常な防御です。

代表例:

- `.env`
- 秘密鍵
- credentials
- DBファイル
- `.c2cignore` 対象

`.env.example` は読み取り可能です。

## Repository内のファイルが見えない

対象Repositoryの `.c2cignore` を確認します。

統合Workspaceでは、Repositoryごとの `.c2cignore` が適用されます。

上位で拒否されたものを下位ルールで再公開できません。

## Workspace外へアクセスできない

仕様です。

現在の共有範囲:

```text
/Volumes/ZAKKO_DEV/repos
```

次は共有対象外です。

```text
/Volumes/ZAKKO_DEV/data
/Volumes/ZAKKO_DEV/docker
/Volumes/ZAKKO_DEV/ollama
/Volumes/ZAKKO_DEV/backups
```

必要な開発データはRepository側へ明示的に配置するか、別の安全な連携方式を設計します。

## C2C_EGRESS_DENIED

C2CのNode.js fetchが許可外URLへ通信しようとした場合に発生します。

許可対象:

- loopback
- Named Tunnelの `/health`
- Quick Tunnelの `/health`

通常のGitHub APIや任意Web APIへC2C runtimeからfetchする処理は拒否します。

明示的なGit操作やcloudflaredの通信は別経路です。

## update-checkが更新を確認しない

仕様です。

```bash
c2c update-check --json
```

は外部照会せず、

```json
{
  "checked": false,
  "updateAvailable": false,
  "disabled": true
}
```

相当を返します。

更新は明示的にGitHub側の差分を確認してから行います。

## Mac mini常駐サービスが起動しない

構成確認:

```bash
pnpm mac:plan
```

確認対象:

- `/Volumes/ZAKKO_DEV` がmount済み
- Volume UUID一致
- `/Volumes/ZAKKO_DEV/repos` のrealpath一致
- C2C RepositoryがWorkspace内部
- `dist/bridge/server.js` が存在
- Named Tunnel設定済み
- run.lockが異常状態で残っていない

## WAIT_VOLUME

外部ドライブ待機状態です。

`ZAKKO_DEV` を接続してください。

同名の別VolumeがmountされてもUUIDが違えば起動しません。

## WAIT_BUILD

build済み `dist/` が見つかりません。

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

を実行してください。

## SERVICE_ALREADY_RUNNING

常駐Supervisorがすでに動いています。

二重起動しません。

既存サービスの状態を確認してください。

## SERVICE_LOCK_UNCERTAIN

run.lockの所有状態を安全に確認できません。

不明なlockを自動削除しない設計です。

既存processを確認してから対応します。

## 外部ドライブを抜いた

Supervisorが検知するとworkerを停止し、Volume再接続待ちへ戻ります。

Bridgeが外部Workspaceを開いたまま稼働し続けることを避けます。

## LaunchAgentの状態確認

```bash
node scripts/macos-service.mjs status
```

停止:

```bash
node scripts/macos-service.mjs stop-agent
```

## LaunchDaemon

ログアウト後も動かす構成はLaunchDaemonを使用します。

生成:

```bash
node scripts/macos-service.mjs prepare
```

生成されたplistを確認後にsystemへ登録します。

Repository側のスクリプトはroot操作を自動実行しません。

## Port競合

同じWorkspace用の正常なBridgeが存在すれば再利用します。

別processが既定portを使用している場合、Bridgeは利用可能なportへfallbackします。

## 完全に接続をやり直す

必要な場合:

```bash
c2c stop -w /Volumes/ZAKKO_DEV/repos
c2c setup -w /Volumes/ZAKKO_DEV/repos --tunnel
```

ChatGPTアクセスそのものを失効させる場合だけ:

```bash
c2c unpair -w /Volumes/ZAKKO_DEV/repos
```

`unpair` は既存tokenを失効させるため、通常の再起動では使用しません。
