# Codex with ChatGPT

[English](README.md) | **日本語**

> ChatGPTが考え、Codexが実行します。

## 解決する課題

ChatGPTのWebサブスクリプションを契約していても、その推論能力を使わず、Codex側のAPI／実行枠だけで設計・レビューまで行うと、Codex側の利用量が増えます。

このプロジェクトは、ChatGPTのWeb画面を「設計・レビュー担当」、Codexを「実装・実行担当」として分離します。APIキーや独自の逆プロキシは不要で、公式ChatGPT Webと読み取り専用MCP Bridgeを使用します。

## これは何か

ChatGPT WebをCodex作業の計画・レビュー担当として使い、実際のファイル編集・シェル実行・Git操作・テストはCodexが担当します。

Repository全体をChatGPTへアップロードする方式ではありません。ChatGPTはOAuthで保護された**読み取り専用**MCP接続を通じて、必要なファイルだけをローカルWorkspaceから読み取ります。

## 1プロンプトでの導入

GitやNode.js、ターミナル操作に詳しくなくても、以下をCodexへそのまま渡せます。

```text
安全強化済みの Codex with ChatGPT fork をインストールして設定してください。
技術的な作業は自分で進めてください。

1. 前提条件を確認してください。git と Node.js >= 20 が必要です。
   不足していれば導入し、必要に応じて cloudflared も導入してください。
   macOS は Homebrew、Windows は winget を使用してください。
2. このPCでは Hardened C2C の共有checkoutを1個だけ使用してください。
   存在しない場合は https://github.com/Shota-Zaki/codex-with-chatgpt を
   ~/codex-with-chatgpt にcloneしてください。
   既に存在する場合は自動でpullやupdateをせず、明示的に更新を依頼するまで
   現在の検証済みCommitを使い続けてください。
3. lockfileからbuildしてください。
   corepack pnpm install --frozen-lockfile
   corepack pnpm build
4. user Skillとして skill/SKILL.md を
   ~/.agents/skills/codex-with-chatgpt/SKILL.md
   にコピーしてください。
   Windowsでは
   %USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md
   を使用してください。
   インストール済みSkillの checkout lives at: を実際の共有checkoutパスへ置換してください。
5. 1つのRepositoryだけを対象に、SKILL.mdの初回設定手順を実行してください。
   複数Repositoryを含む親ディレクトリを1つのWorkspaceとして接続しないでください。
6. Repositoryごとに Workspace / OAuth・Token / ChatGPT Connector / ChatGPT Project
   を分離してください。別Repositoryの認証情報を使い回さないでください。
7. ユーザーへ操作を求めるのは、ログイン、CAPTCHA、2FA、明示的な同意、
   またはSkillで定義されたChatGPT設定手順が必要な場合だけにしてください。
   一度に1操作だけ案内してください。
8. 完了時に準備完了チェックリストとファイル読み取りテスト結果を表示してください。
```

**更新について：** Skillは新しい候補があるか確認できますが、自動更新はしません。現在の検証済みCommitを使い続け、更新候補があることだけを通知します。更新する場合は **「Codex with ChatGPTを更新して」** と明示的に指示してください。Hardened更新フローはdirty checkoutを拒否し、候補を検証してからfast-forwardします。

## 手動での導入 → 初回設定 → 利用

1. このPCにHardened Forkの共有checkoutを1個だけ置きます。
2. `skill/SKILL.md` を `~/.agents/skills/codex-with-chatgpt/SKILL.md` へコピーします。
   Windowsでは `%USERPROFILE%\.agents\skills\codex-with-chatgpt\SKILL.md` を使います。
   インストール済みSkillのcheckoutパスを実際の共有checkoutへ設定します。
3. Codexへ **「Codex with ChatGPTを使って、このRepositoryの初回設定をして。」** と指示します。
4. 以後は **「Codex with ChatGPTを使って、XXXを実装して。」** のように依頼します。

各アプリケーションRepositoryへC2C本体をコピーしないでください。1 Repository = 1 Workspace境界とし、OAuth／Token状態やChatGPT ProjectをRepository間で共有しないでください。

通常、ユーザーへ見せる完了表示は次のようになります。

```text
Codex with ChatGPT

✓ 現在のプロジェクトを確認
✓ Workspace Bridgeを起動
✓ 安全な接続を確立
✓ ChatGPTへ接続
✓ ファイル読み取りテスト成功

準備完了
```

ユーザー操作が必要になる可能性があるのは、ChatGPTへのログインと、固定ドメインを使う場合のCloudflareログインなどです。新規Repositoryでは、そのRepository専用のChatGPT Projectを1つ作成し、project-only memoryを使用します。既存Repositoryのlong-chatは、明示的に移行するまでそのまま維持されます。

### 固定ホスト名は任意

既定では一時Cloudflareアドレスを使用します。このアドレスはBridge再起動後などに変わる可能性があります。その場合、CodexはそのRepositoryのChatGPT Connectorだけを、同じConnector名・新しいアドレスで作り直します。

CloudflareアカウントとCloudflare管理下のドメインがある場合、初回設定時に `c2c-<project>.example.com` のような固定ホスト名を選択できます。Cloudflareアカウントがない場合や固定ドメインを使わない場合でも、一時アドレスで利用できます。

認証情報はC2Cのユーザー状態ディレクトリへ保存され、アプリケーションRepositoryには保存されません。

## 仕組み

```text
             ┌───────────────────────────┐
             │       ChatGPT Web         │
             │   設計 / 計画 / Review   │
             └──────────┬──────────▲─────┘
                        │          │
               MCP      │          │ 内蔵ブラウザ
              data plane│          │ control plane (<1 KB)
                        ▼          │
             ┌─────────────────────┐
             │      C2C Bridge     │  loopback-only listener
             │  read-only MCP      │  OAuth 2.1 + one-time pairing
             │  OAuth + pairing    │  Cloudflare tunnel
             │  tunnel management  │
             └──────────┬──────────┘
                        │ 読み取り専用
                        ▼
             ┌─────────────────────┐          ┌─────────────────────┐
             │   Local workspace   │◀─────────│    Codex Harness    │
             └─────────────────────┘ edit/git │ Shell / Test / Fix  │
                                              └─────────────────────┘
```

- **Control plane（内蔵ブラウザ）：** CodexとChatGPTは小さな構造化メッセージ `[C2C]` を使い、`INIT → PLAN → EXECUTED → REVIEW → DONE` の状態をやり取りします。diff、ログ、ファイル本文をチャットへ直接貼り付けません。
- **Data plane（MCP）：** ChatGPTは必要な情報を9個の読み取り専用ツールから取得します。`workspace_info`、`list_directory`、`read_file`、`search_workspace`、`git_status`、`git_diff`、`test_status`、`execution_summary`、`execution_output` を使用します。
- **独立レビュー：** Codexが実装した後、ChatGPTはCodexの自己申告だけを信頼せず、実際のGit diffや公開されたtest/build出力をMCP経由で確認します。

## Hardenedセキュリティモデル（概要）

- **構造的に読み取り専用：** MCP serverはwrite、delete、shell、execute、commit、package install、任意network操作を公開しません。
- **1 Repository = 1境界：** 各Repositoryが独立したWorkspace、OAuth／Token状態、Connector、ChatGPT Projectを持ちます。複数Repositoryを含む親ディレクトリを1 Workspaceとして使用しません。
- **Scopeはfail-closed：** 未対応OAuth scopeは拒否し、対応scopeの必要最小限のsubsetだけを許可します。
- **公開登録処理を制限：** OAuth client登録数、redirect URI数／長さ、pending authorization request数、登録試行回数に上限があります。
- **公開health情報を最小化：** `/health` はserviceとstatusだけを公開します。Workspace identityはadmin tokenで保護されたloopback endpointから読み取ります。
- **機密パスを遮断：** `.env*`、key material、SSH／cloud credentials、Docker／Kubernetes config、Terraform state／varsなどは読み取り拒否します。`.env.example` は読み取り可能です。
- **共通Outbound Secret Boundary：** file read、search match、git diff、execution outputの一般的なcredentialをマスクします。Private key blockはfail-closedで返しません。
- **Path confinement：** canonical realpath checkによりabsolute path、`../`、symlink escapeを防ぎます。
- **Token isolation：** tokenなしは401、別Workspace用tokenは403です。Refresh tokenはrotationし、永続化時はhashのみ保存します。
- **無人自動更新なし：** 通常のupdate checkは候補を通知するだけです。明示的なupdate時もdirty checkoutを拒否し、候補を検証してから更新します。

詳細なThreat Modelは [docs/security.md](docs/security.md) を参照してください。

## 開発

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm typecheck

c2c setup           # Bridge + 公開接続 + pairing code
c2c sandbox-allow   # C2Cローカル状態ディレクトリをCodex sandboxで書き込み可能にする
c2c status / doctor / pair / unpair / logs / stop
```

要件：Node.js >= 20、git。公開接続には `cloudflared` が必要です。

ドキュメント： [architecture](docs/architecture.md) · [protocol](docs/protocol.md) · [security](docs/security.md) · [troubleshooting](docs/troubleshooting.md)

## Repository構成

```text
src/
  bridge/     loopback HTTP service、port recovery、admin API
  mcp/        9個のread-only tools、stateless Streamable HTTP
  auth/       OAuth 2.1（PKCE、registration、refresh rotation、revocation）
  pairing/    one-time pairing code（CSPRNG、TTL、rate limit）
  workspace/  path confinement、sensitive-file policy、search、git
  tunnel/     TunnelProvider abstraction + Cloudflare tunnel implementations
  execution/  review loopで使うexecution records
  process/    daemon lifecycle
  cli/        c2c command line
skill/        Codex Skill（UX layer）
tests/        unit + integration tests
docs/         architecture / protocol / security / troubleshooting
```

## 状態と検証

このRepositoryはHardened Forkです。コードが変更されているだけで「検証済み」とは扱いません。Deploy前には対象Commitを固定し、その同じCommitに対してfrozen install、test、typecheck、buildを実行する必要があります。必要な確認が成功してから `main` へ統合してください。

**非公式のコミュニティプロジェクトであり、OpenAI公式またはOpenAI公認プロジェクトではありません。**

## License

[MIT](LICENSE)
