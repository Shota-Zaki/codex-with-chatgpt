---
name: codex-with-chatgpt
description: >
  ChatGPTを設計・レビュー担当、Codexを実装・実行担当として連携させる。
  C2Cの初回設定、接続、実装ループ、レビュー、復旧、切断を行うときに使用する。
---

# Codex with ChatGPT

ChatGPTが設計・レビューし、Codexが実装・実行する。

このSkillでは、Mac mini上の統合Workspaceを次に固定して扱う。

```text
/Volumes/ZAKKO_DEV/repos
```

`/Users/zaki/Developer` は上記への参照として扱う。

## 最重要ルール

1. ファイル本文、diff、長いログをChatGPT UIへ貼り付けない。
2. ChatGPTは必要な情報をMCPから自分で取得する。
3. 編集、shell、Git、package install、test、buildはCodexが担当する。
4. C2CのMCPは読み取り専用として扱う。
5. pairing code以外のOAuth token、Cookie、session情報をブラウザーへ手入力しない。
6. 機密情報をChatGPTへ送信しない。
7. `.env`、鍵、DB、credentials等が拒否された場合は防御を解除しない。
8. Workspace外の `data`、`docker`、`ollama`、`backups` を無理に読ませない。
9. 自動更新しない。更新は明示的にGitHub差分を確認してから行う。
10. 不明なPIDを保存済みPIDだけでkillしない。
11. Repository全体を一度に変更せず、小さいWork Unitで進める。
12. GitHub変更後は必ず読み戻して実反映を確認する。

## パス

### 統合Workspace

```text
/Volumes/ZAKKO_DEV/repos
```

### C2C checkout

標準:

```text
/Volumes/ZAKKO_DEV/repos/codex-with-chatgpt
```

実体が異なる場合は、現在のcheckoutを使用する。

### C2C状態

macOS:

```text
~/Library/Application Support/codex-with-chatgpt
```

### Mac常駐管理

```text
~/Homelab/codex-with-chatgpt
```

### Skill

```text
~/.agents/skills/codex-with-chatgpt/SKILL.md
```

## 統合Workspace運用

現在は複数Repositoryを1つのC2C Workspaceとして接続する。

そのため各タスクで必ず対象Repositoryを明示する。

例:

```text
TARGET_REPOSITORY: Template-Dock
TARGET_PATH: Template-Dock/
```

ChatGPTのPLANが別Repositoryまで広がっている場合は、明示的な理由がない限り実行しない。

各Repositoryの `.c2cignore` は独立して適用される。

## 初回前提確認

次を確認する。

```bash
node --version
git --version
cloudflared --version
```

Node.jsは20以上を使用する。

build済みでない場合:

```bash
cd /Volumes/ZAKKO_DEV/repos/codex-with-chatgpt
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:runtime
corepack pnpm build
```

検証に失敗した状態で常駐サービス設定を更新しない。

## 初回設定

### 1. Workspaceを確認

```bash
node bin/c2c.js workspace \
  -w /Volumes/ZAKKO_DEV/repos
```

期待するroot:

```text
/Volumes/ZAKKO_DEV/repos
```

### 2. 初回設定方式を確認

```bash
node bin/c2c.js prefs get --json
```

未選択ならユーザーの既定方針に従う。

自動設定:

```bash
node bin/c2c.js prefs set --setup-mode auto
```

手動ガイド:

```bash
node bin/c2c.js prefs set --setup-mode manual
```

ChatGPT側で開発者モードを確認できた後だけ:

```bash
node bin/c2c.js prefs set --developer-mode
```

未確認なのに有効済みとして記録しない。

### 3. 固定Tunnel

Mac mini常駐ではNamed Tunnelを使用する。

現在の標準ホスト:

```text
c2c-mac-mini-control-center.zakkolab.com
```

設定:

```bash
node bin/c2c.js tunnel choose \
  -w /Volumes/ZAKKO_DEV/repos \
  --mode named \
  --zone zakkolab.com \
  --hostname c2c-mac-mini-control-center.zakkolab.com
```

Cloudflareログインが必要な場合:

```bash
node bin/c2c.js tunnel login
```

ログイン、CAPTCHA、2FA、明示的同意だけはユーザー操作を求めてよい。

その場合、一度に1操作だけ案内する。

### 4. C2C setup

```bash
node bin/c2c.js setup \
  -w /Volumes/ZAKKO_DEV/repos
```

必要なら `--tunnel` を付ける。

### 5. ChatGPT Connector

ChatGPT側へC2C MCP Connectorを追加する。

Connector名は統合Workspaceを一意に識別できる名前にする。

例:

```text
ZAKKO DEV C2C
```

OAuth画面が表示された段階でのみpairing codeを発行する。

```bash
node bin/c2c.js pair \
  -w /Volumes/ZAKKO_DEV/repos
```

古いpairing codeを再利用しない。

### 6. 接続確認

```bash
node bin/c2c.js doctor \
  -w /Volumes/ZAKKO_DEV/repos \
  --json
```

ChatGPT側でも `workspace_info` を呼び出し、rootが統合Workspaceであることを確認する。

## Mac mini常駐設定

### 構成確認

変更を行わず確認だけする。

```bash
corepack pnpm mac:plan
```

### 設定生成

test/build成功後:

```bash
node scripts/macos-service.mjs prepare
```

生成先:

```text
~/Homelab/codex-with-chatgpt
```

### LaunchAgent

ログイン中のみ稼働する場合:

```bash
node scripts/macos-service.mjs install-agent
node scripts/macos-service.mjs start-agent
```

停止:

```bash
node scripts/macos-service.mjs stop-agent
```

### LaunchDaemon

ログアウト後も24時間稼働させる場合は、`prepare` で生成されたsystem plistを使用する。

root操作は自動で実行しない。

plist内容、実行ユーザー、Node path、Workspace、Volume UUIDを確認してからsystemへ登録する。

## 通常の開発タスク

### 1. 対象を固定

必ず最初に対象Repositoryを特定する。

```text
Repository: <name>
Path: <relative path under /Volumes/ZAKKO_DEV/repos>
Goal: <user goal>
```

### 2. C2C状態確認

```bash
node bin/c2c.js doctor \
  -w /Volumes/ZAKKO_DEV/repos \
  --json
```

正常なら既存Bridgeを再利用する。

### 3. Task ID

タスクごとに短い一意IDを作る。

例:

```text
c2c_tdock_001
```

### 4. INIT

ChatGPTへ小さい制御メッセージだけを送る。

```text
[C2C]
STATE: INIT
TASK_ID: c2c_tdock_001
ITERATION: 0

TARGET_REPOSITORY:
Template-Dock

TARGET_PATH:
Template-Dock/

GOAL:
ユーザーの要求を実装する。

INSTRUCTION:
MCPで現在コードを確認し、Codexが実行できる次のWork Unitを計画してください。
別Repositoryへ変更を広げないでください。
```

### 5. PLANを受け取る

PLANには最低限次を含める。

- 対象ファイル
- 変更理由
- 実装内容
- リスク
- テスト
- 受入条件

40項目の巨大計画より、完了可能な小さいWork Unitを優先する。

### 6. Codexが実装

Codex自身のツールで実装する。

必要な場合:

- edit
- shell
- test
- typecheck
- build
- git diff

を実行する。

ChatGPTへファイル本文を貼り付けない。

### 7. 実行記録

```bash
node bin/c2c.js record \
  -w /Volumes/ZAKKO_DEV/repos \
  --task c2c_tdock_001 \
  --iteration 1 \
  --changed-files 3 \
  --tests "tests passed" \
  --exit-status ok
```

長いtest/build出力をレビュー対象へ出す必要がある場合だけ `--output-file` を使用する。

秘密情報を含む出力は公開しない。

### 8. EXECUTED

```text
[C2C]
STATE: EXECUTED
TASK_ID: c2c_tdock_001
ITERATION: 1

TARGET_REPOSITORY:
Template-Dock

RESULT:
実装完了。

CHANGED_FILES:
3

TESTS:
passed

INSTRUCTION:
MCPで対象Repositoryの現在diffと必要な実行記録を独立確認してください。
```

### 9. ChatGPTレビュー

ChatGPTはCodexの自己申告だけでDONEにしない。

確認:

- `git_status`
- `git_diff`
- 必要なsource
- `test_status`
- `execution_output`

問題があれば次のPLANを返す。

受入条件を満たしたらDONEを返す。

### 10. 完了

DONE後、必要ならcheckpointをclearする。

Repositoryの正本がある場合は、TASKS/NEXT_WORK/AI_WORK_STATE等を更新する。

## GitHub操作ルール

大規模変更を1回へまとめない。

原則:

```text
1. 5～10ファイル以下を取得
2. 内容確認
3. 修正
4. Commit
5. GitHubから読み戻す
6. 次のWork Unit
```

### 安全判定ブロック

次のエラー:

```text
リクエストの安全性を確認できなかったため...
```

が出た場合、GitHub権限不足と即断しない。

複数ファイルを1つの大きなGit treeへまとめず、1～数ファイル単位へ分割する。

### Code Mode呼出上限

```text
Code Mode exceeded the maximum number of tool calls.
```

はGitHubエラーではない。

次のWork Unitからツール呼び出しを分割して継続する。

### SHA競合

既存ファイル更新前には現在SHAを再取得する。

書き込み後は新しいSHAまたはBranch HEADを確認する。

## 会話の継続

C2C sessionへ現在会話を保存できる。

確認:

```bash
node bin/c2c.js session get \
  -w /Volumes/ZAKKO_DEV/repos \
  --json
```

新しい会話へ移る場合はHANDOFFを使用する。

ログやdiffをHANDOFFへ貼らない。

## HANDOFF形式

```text
[C2C]
STATE: HANDOFF
TASK_ID: ...
ITERATION: ...

TARGET_REPOSITORY:
...

ORIGINAL_GOAL:
...

PROGRESS:
...

CURRENT_STATE:
...

KNOWN_ISSUES:
...

NEXT_EXPECTED_STEP:
...
```

新しいChatGPT会話は必要なsourceをMCPで読み直す。

## 復旧

### 基本診断

```bash
node bin/c2c.js doctor \
  -w /Volumes/ZAKKO_DEV/repos
```

### Bridge停止

```bash
node bin/c2c.js start \
  -w /Volumes/ZAKKO_DEV/repos
```

### 固定Tunnel不調

```bash
node bin/c2c.js tunnel login
node bin/c2c.js doctor -w /Volumes/ZAKKO_DEV/repos
```

### pairing切れ

ChatGPT認証画面を開いてから:

```bash
node bin/c2c.js pair -w /Volumes/ZAKKO_DEV/repos
```

### 接続を完全にやり直す

```bash
node bin/c2c.js stop -w /Volumes/ZAKKO_DEV/repos
node bin/c2c.js setup -w /Volumes/ZAKKO_DEV/repos --tunnel
```

### ChatGPTアクセスを失効

明示的に切断するときだけ:

```bash
node bin/c2c.js unpair -w /Volumes/ZAKKO_DEV/repos
```

## 切断

ユーザーが「ChatGPTとの接続を切る」と明示した場合:

1. `c2c unpair`
2. 必要に応じ `c2c stop`
3. ChatGPT Connector側も削除または無効化
4. token失効を確認

通常の再起動ではunpairしない。

## 更新

自動更新確認は禁止。

`c2c update-check` は外部照会しない。

更新依頼が明示された場合:

1. GitHubで現在の `work` / `main` を確認
2. upstreamとの差分を確認
3. 更新内容をレビュー
4. 小さいWork Unitで取り込む
5. typecheck/test/test:runtime/build
6. 問題なければ `work` へ反映
7. `main` は明示指示時のみ

## プライバシー

C2C runtimeの外部HTTP fetchは許可先を限定する。

許可:

- loopback
- Named Tunnel `/health`
- Quick Tunnel `/health`

公開healthへ秘密headerやCookieを転送しない。

cloudflaredはCloudflare通信のため別経路で起動するが、親shellのAPIキー・GitHub token・`NODE_OPTIONS`等は子プロセスへ継承しない。

`C2C_EGRESS_DENIED` が出た場合、安易に制限を解除しない。

通信が本当に必要か確認し、設計として許可する場合のみレビューして変更する。

## 完了条件

C2C関連の作業を完了扱いにするには、可能な範囲で次を満たす。

- typecheck成功
- Vitest成功
- runtime Node test成功
- build成功
- 日本語UI/文書の残存確認
- 機密除外テスト成功
- 外部送信制御テスト成功
- GitHub `work` への反映確認
- Mac実機依存だけを明確に残件化

Mac実機確認ができないことを理由に、Repository上で可能な実装・テスト・文書更新を停止しない。
