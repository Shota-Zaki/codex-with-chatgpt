# アーキテクチャ

## 全体構成

```text
┌────────────────────────────┐
│        ChatGPT Web         │
│   設計 / 計画 / レビュー   │
└───────────┬────────▲───────┘
            │        │
       MCP  │        │ ChatGPT UI
            ▼        │
┌────────────────────────────┐
│         C2C Bridge         │
│ 読み取り専用MCP            │
│ OAuth / Pairing            │
│ Tunnel管理                 │
│ Loopback Admin API         │
└───────────┬────────────────┘
            │ 読み取り
            ▼
┌────────────────────────────┐
│ /Volumes/ZAKKO_DEV/repos   │
│  統合開発Workspace          │
└───────────▲────────────────┘
            │ 編集 / shell / Git / test
┌───────────┴────────────────┐
│        Codex Harness       │
└────────────────────────────┘
```

## 役割

### ChatGPT

ChatGPTは次を担当します。

- 要件理解
- 設計
- 実装計画
- 差分レビュー
- デバッグ方針
- 次のWork Unitの判断

ChatGPT自身がC2CのMCP経由でshellやGit writeを実行する設計にはしていません。

### Codex

Codexは次を担当します。

- ファイル作成・編集・削除
- shell実行
- package install
- Git操作
- test / lint / typecheck / build
- 実装後の修正

### C2C Bridge

BridgeはChatGPTとローカルWorkspaceの間に入り、必要な情報を読み取り専用MCPとして公開します。

主なMCPツール:

- `workspace_info`
- `list_directory`
- `read_file`
- `search_workspace`
- `git_status`
- `git_diff`
- `test_status`
- `execution_summary`
- `execution_output`

## Workspace境界

Mac mini常駐構成では、Workspace rootを次に固定します。

```text
/Volumes/ZAKKO_DEV/repos
```

この配下に複数Repositoryを配置します。

Workspaceの外にある次の領域はMCPから直接参照できません。

```text
/Volumes/ZAKKO_DEV/data
/Volumes/ZAKKO_DEV/docker
/Volumes/ZAKKO_DEV/ollama
/Volumes/ZAKKO_DEV/backups
/Volumes/ZAKKO_DEV/archives
```

パスはrealpathで正規化し、`../` やsymlinkによるWorkspace外への脱出を拒否します。

## Repositoryごとの非公開設定

統合Workspace内では、各Repositoryまたは下位ディレクトリの `.c2cignore` を適用します。

上位ディレクトリですでに拒否されたパスを、下位の否定ルールで再公開することはできません。

共通ポリシーでも、認証情報・秘密鍵・DBファイルなどを拒否します。

## Bridgeの待受

Bridgeは次のloopbackだけで待ち受けます。

- `127.0.0.1`
- `::1`
- `localhost`

LANへ直接bindしません。

外部からの接続はCloudflare Tunnel経由に限定します。

## Admin API

管理APIはloopback専用です。

さらにランダムなadmin tokenを要求し、proxy経由の要求は拒否します。

用途:

- Bridge情報取得
- pairing発行
- Tunnel開始・停止
- token失効
- shutdown

## OAuthとPairing

ChatGPT ConnectorはOAuthでBridgeへ接続します。

初回認証時のみ、ローカルで発行したワンタイムpairing codeを利用します。

Access token / refresh tokenはChatGPT UIへ直接表示する前提ではありません。

## Tunnel

対応する接続方式:

- Cloudflare Named Tunnel
- Cloudflare Quick Tunnel

Mac miniの24時間常駐サービスでは、接続先を安定させるため **Named Tunnelを必須** としています。

通常CLIではQuick Tunnelも利用できます。

## 公開health

外部公開する `/health` は最小情報だけを返します。

```json
{
  "service": "c2c-bridge",
  "status": "ok"
}
```

Workspace path、Workspace ID、version、token状態などは公開しません。

## 外部送信制御

C2CのNode.js `fetch` は起動時にラップされます。

許可対象:

- loopback HTTP
- 設定済みNamed Tunnelの `/health`
- Quick Tunnelの `*.trycloudflare.com/health`

公開health要求では、元のheaderやCookieを引き継ぎません。

その他の外部HTTP要求は拒否します。

この制御はC2CのNode.js fetchに対するもので、`cloudflared`、`git`、package managerなど別プロセスの通信は別管理です。

## Mac mini常駐レイヤー

常駐処理は3層です。

```text
launchd
  ↓
macos-supervisor.mjs
  ↓
service-worker.mjs
  ↓
C2C Bridge + Named Tunnel
```

### Supervisor

Supervisorは次を担当します。

- ZAKKO_DEV接続待ち
- Volume UUID確認
- mount point確認
- build済み成果物確認
- worker起動
- 外部ドライブ切断検知
- worker停止
- 再試行backoff
- ログrotation
- 二重起動防止

### Worker

Workerは次を担当します。

- Workspace生成
- 既存Bridge状態確認
- Named Tunnel設定確認
- Bridge起動
- Tunnel起動
- 定期health確認
- 異常時終了

Supervisorがworkerを再起動するため、worker自身に複雑な復旧責務を持たせません。

## 状態保存先

macOSの既定状態保存先:

```text
~/Library/Application Support/codex-with-chatgpt
```

ここにはWorkspaceコードではなく、runtime state、OAuth状態、Tunnel設定などを保存します。

Mac常駐用の管理ファイルは次へ分離します。

```text
~/Homelab/codex-with-chatgpt
```

## 設計原則

1. ChatGPTと実行権限を分離する
2. MCPは読み取り専用にする
3. Workspace外へ出さない
4. 機密情報はfail-closedで拒否する
5. 公開情報を最小化する
6. 自動更新を行わない
7. 不明なprocessをPIDだけでkillしない
8. 外部ドライブが不明な状態では起動しない
9. 常駐処理は監視と実処理を分離する
10. Mac実機依存処理は明示的な運用手順として分離する
