# Codex with ChatGPT

> ChatGPTが設計・レビューし、Codexが実装・実行するためのローカルBridgeです。

このforkは、Mac miniを24時間開発ホストとして使う構成に合わせて、日本語化・送信先制御・外部ドライブ監視・常駐起動を追加しています。

## 現在の運用構成

```text
/Users/zaki/
├── Developer   -> /Volumes/ZAKKO_DEV/repos
├── Backups     -> /Volumes/ZAKKO_DEV/backups/previous
└── Homelab/
    └── codex-with-chatgpt/   # 常駐起動用設定

/Volumes/ZAKKO_DEV/
├── repos/       # 統合開発Workspace
├── archives/
├── backups/
├── cache/
├── data/
├── docker/
└── ollama/
```

C2CがChatGPTへ公開するWorkspaceは **`/Volumes/ZAKKO_DEV/repos`** です。  
`data`、`docker`、`ollama`、`backups` などはWorkspace外のため、MCPから直接参照できません。

各Repositoryの `.c2cignore` も継承されます。さらに、`.env`、秘密鍵、認証情報、SQLite/DBファイル、Docker認証設定などは共通ポリシーで読み取りを拒否します。

## 役割分担

- **ChatGPT**: 設計、計画、レビュー、デバッグ方針
- **Codex**: ファイル編集、shell、Git、テスト、実装
- **C2C Bridge**: ChatGPTからWorkspaceを読み取るためのMCP接続
- **Cloudflare Tunnel**: ChatGPTからMac mini上のBridgeへ到達する公開経路

MCPツール自体は読み取り専用です。ChatGPTがファイル編集やshell実行を直接行うのではなく、Codexが実装担当として実行します。

## プライバシーと外部通信

このforkでは、C2CのNode.jsプロセスからのHTTP通信を制限しています。

許可する通信は次のみです。

1. `127.0.0.1` / `::1` へのローカル管理通信
2. 設定済み固定Tunnelの `/health` への本文なしGET/HEAD
3. Cloudflare Quick Tunnel使用時の `*.trycloudflare.com/health` への本文なしGET/HEAD

公開health確認では、Authorization、Cookie、APIキー等を引き継がず、`credentials: omit`・`no-referrer`・redirect拒否で送信します。

その他の外部HTTP通信は `C2C_EGRESS_DENIED` として拒否します。C2Cの自動更新確認も停止しているため、通常起動時にGitHubへ更新照会しません。

### この制御の範囲

この制御は **C2CのNode.js `fetch` 経路**を対象にします。以下は別プロセス・別経路です。

- `cloudflared` がCloudflareへ行うTunnel通信（親shellのAPIキー等は継承せず、OS実行に必要な環境変数だけを渡します）
- ChatGPT/OpenAI側のConnector通信
- ユーザーまたはCodexが明示的に実行する `git fetch/pull/push`
- package managerが明示的な導入時に行う通信

したがって「元開発者のサーバーへ自動送信する処理を許可しない」ことと、「一切の外部通信をしない」ことは別です。

## 初回セットアップ

前提:

- Node.js 20以上
- pnpm
- git
- cloudflared
- 固定ドメインを使う場合はCloudflareアカウントと管理中ドメイン

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

初回設定:

```bash
node bin/c2c.js setup -w /Volumes/ZAKKO_DEV/repos --tunnel
```

状態確認:

```bash
node bin/c2c.js status -w /Volumes/ZAKKO_DEV/repos
node bin/c2c.js doctor -w /Volumes/ZAKKO_DEV/repos
```

固定ドメインを使用する場合:

```bash
node bin/c2c.js tunnel choose \
  -w /Volumes/ZAKKO_DEV/repos \
  --mode named \
  --zone zakkolab.com \
  --hostname c2c-mac-mini-control-center.zakkolab.com
```

## Mac mini 24時間常駐

現在の常駐処理は固定Tunnelを前提にしています。

まず構成だけ確認します。この操作では設定変更・起動・通信を行いません。

```bash
corepack pnpm mac:plan
```

テストとbuild完了後、常駐設定を生成します。

```bash
node scripts/macos-service.mjs prepare
```

生成先:

```text
/Users/zaki/Homelab/codex-with-chatgpt/
├── service.json
├── service-common.mjs
├── macos-supervisor.mjs
└── com.zakkolab.codex-with-chatgpt.system.plist
```

常駐処理は次を確認してからBridgeを起動します。

- `ZAKKO_DEV` のVolume UUIDが一致
- mount pointが `/Volumes/ZAKKO_DEV`
- Workspace実体が `/Volumes/ZAKKO_DEV/repos`
- 対象RepositoryがWorkspace内部
- build済みの `dist/` が存在
- 固定Tunnel設定が正常
- 同一サービスが重複起動していない

外部ドライブが未接続なら起動せず待機し、外れた場合はworkerを終了して再接続を待ちます。短時間の異常終了は指数バックオフで再試行し、最大5分まで間隔を伸ばします。

## 起動方式

### LaunchAgent

ログイン中だけ動かす場合:

```bash
node scripts/macos-service.mjs install-agent
node scripts/macos-service.mjs start-agent
```

停止:

```bash
node scripts/macos-service.mjs stop-agent
```

### LaunchDaemon

ログアウト後も24時間動かす場合は、`prepare` で生成された

```text
/Users/zaki/Homelab/codex-with-chatgpt/com.zakkolab.codex-with-chatgpt.system.plist
```

を内容確認後にsystem LaunchDaemonとして登録します。

このRepositoryからはroot権限操作を自動実行しません。

## 主なコマンド

| コマンド | 用途 |
| --- | --- |
| `c2c start` | Bridgeを起動 |
| `c2c stop` | Bridgeを停止 |
| `c2c restart` | Bridgeを再起動 |
| `c2c status` | 状態確認 |
| `c2c doctor` | 診断・可能な範囲の修復 |
| `c2c pair` | 新しいペアリングコードを発行 |
| `c2c unpair` | ChatGPTアクセスを失効 |
| `c2c logs` | Bridgeログ表示 |
| `c2c workspace` | Workspace情報表示 |
| `c2c tunnel status` | Tunnel設定確認 |
| `c2c update-check` | 外部照会せず「未確認」を返す |

## 開発時の検証

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:runtime
corepack pnpm build
```

`tests/runtime/` には、外部送信制御とMac常駐処理をNode標準テストで独立検証するテストがあります。

## ドキュメント

- [アーキテクチャ](docs/architecture.md)
- [C2Cプロトコル](docs/protocol.md)
- [セキュリティモデル](docs/security.md)
- [トラブルシューティング](docs/troubleshooting.md)
- [Codex Skill](skill/SKILL.md)

## 開発Branch

- `work`: 開発・検証
- `main`: 公開用

検証が完了するまで `main` へ反映しません。

## ライセンス

MIT License。詳細は [LICENSE](LICENSE) を参照してください。

このforkを含むCodex with ChatGPTは、OpenAI公式プロジェクトではありません。
