# C2Cエージェントプロトコル

C2Cでは、ChatGPTとCodexの間で「状態」と「実データ」を分離します。

- **Control Plane**: ChatGPT UI上でやり取りする小さい構造化メッセージ
- **Data Plane**: MCP経由で取得するWorkspace、diff、検索結果、実行記録

Control Planeへファイル本文・diff・長いログを貼り付けません。

## 状態遷移

```text
INIT → PLAN → EXECUTING → EXECUTED → REVIEW → PLAN | DONE | BLOCKED | ERROR
```

| 状態 | 送信者 | 意味 |
| --- | --- | --- |
| `INIT` | Codex | 新しいタスク開始。ChatGPTへ調査と計画を依頼 |
| `PLAN` | ChatGPT | 次の実装単位の計画 |
| `EXECUTING` | Codex | 実装中 |
| `EXECUTED` | Codex | 実装完了。メタデータのみ通知 |
| `REVIEW` | ChatGPT | MCPで差分や実行結果を確認中 |
| `DONE` | ChatGPT | 受入条件を満たした |
| `BLOCKED` | ChatGPT | 外部要因等で進行不能 |
| `ERROR` | どちらでも | プロトコル・基盤エラー |
| `HANDOFF` | Codex | 新しいChatGPT会話への引継ぎ |

`RESUME` というプロトコル状態はありません。

Codex再起動時はローカルcheckpointを読み、必要なら `HANDOFF` を送ります。

## ローカルcheckpoint

session内部では次の状態を保存できます。

| checkpoint | 意味 |
| --- | --- |
| `INIT` | INIT送信済み。PLAN待ち |
| `PLAN_RECEIVED` | PLAN受信済み。実装未完了 |
| `EXECUTING` | 実装中 |
| `EXECUTED_LOCAL` | 実行記録済み。EXECUTED未送信 |
| `EXECUTED_SENT` | EXECUTED送信済み。レビュー待ち |
| `DONE` | 完了 |
| `BLOCKED` | 停止要因あり |

checkpointはChatGPTへそのまま公開するプロトコル状態ではありません。

## Control Message形式

全メッセージは `[C2C]` から開始します。

目安は1KB未満です。

### INIT

Codex → ChatGPT

```text
[C2C]
STATE: INIT
TASK_ID: c2c_f81a
ITERATION: 0

GOAL:
ダークモードを実装する。

INSTRUCTION:
接続中のWorkspaceをMCPで確認し、
Codexが実行できる次の実装計画を作成してください。
```

### PLAN

ChatGPT → Codex

```text
[C2C]
STATE: PLAN
TASK_ID: c2c_f81a
ITERATION: 1

GOAL:
...

RATIONALE:
...

ACTIONS:
1. ...
2. ...
3. ...

FILES_LIKELY_INVOLVED:
...

TESTS:
...

SUCCESS_CRITERIA:
...
```

PLANは有限で、実行可能なWork Unitにします。

Repository全体を書き換えるような巨大PLANを1回で返さず、必要に応じて分割します。

### EXECUTED

Codex → ChatGPT

```text
[C2C]
STATE: EXECUTED
TASK_ID: c2c_f81a
ITERATION: 1

RESULT:
実装完了。

CHANGED_FILES:
4

TESTS:
27 passed

MCPで現在のgit diffと実行結果を独立確認してください。
```

EXECUTED送信前に、Codexはローカルへ実行記録を保存します。

例:

```bash
c2c record \
  --task c2c_f81a \
  --iteration 1 \
  --changed-files 4 \
  --tests "27 passed" \
  --exit-status ok
```

テスト、build、lint、typecheckを実行した場合は、必要に応じて `--command` と `--output-file` を指定します。

ChatGPTは次を使って確認します。

- `execution_summary`
- `test_status`
- `execution_output`

実行出力は明示的に記録されたものだけが対象です。

秘密鍵などの危険な出力は本文を公開しません。

### DONE

ChatGPT → Codex

```text
[C2C]
STATE: DONE
TASK_ID: c2c_f81a
ITERATION: 3

SUMMARY:
受入条件を満たしました。
```

### BLOCKED

ChatGPT → Codex

```text
[C2C]
STATE: BLOCKED
TASK_ID: c2c_f81a
ITERATION: 3

REASON:
...

NEEDS:
...
```

## HANDOFF

ChatGPT会話を切り替える場合は、ログやファイル本文を貼らずに要点だけを引き継ぎます。

```text
[C2C]
STATE: HANDOFF
TASK_ID: c2c_f81a
ITERATION: 4

ORIGINAL_GOAL:
ダークモードを実装する。

PROGRESS:
- テーマ状態管理を追加
- トグルUIを追加
- 永続化を追加

CURRENT_STATE:
EXECUTED

KNOWN_ISSUES:
初回表示時のちらつき確認が必要。

NEXT_EXPECTED_STEP:
MCPで現在の差分を確認し、PLANまたはDONEを返す。
```

新しい会話は、必要なコードをMCPで再取得します。

## 信頼順序

情報が競合する場合は次の順序を優先します。

1. MCPで取得した現在のコード
2. 現在タスクのHANDOFF
3. Project instructions
4. Project memory

## Iteration上限

`.c2c.json` の `maxIterations` で上限を設定できます。

既定値は12です。

上限到達時は無限ループを続けず、状態を保存して停止します。

## 新しいChatGPT会話へ最初に渡す指示

以下を基本とします。

```text
あなたはCodex開発セッションの設計・レビュー担当です。

Codexが実装・shell・Git・テストを実行します。
あなたは要件整理、計画、レビューを担当します。

現在のローカルWorkspaceは
「Codex with ChatGPT」MCP Connectorから読み取れます。

ルール:
1. MCPで読めるファイルの貼り付けをCodexへ要求しない。
2. タスクに必要なファイルだけ確認する。
3. 現在コード、git status、git diffをMCPで確認する。
4. 実行可能な小さいPLANを返す。
5. EXECUTED後はCodexの自己申告だけで完了判定しない。
6. git diffと必要な実行記録を独立確認する。
7. 不要な全面書き換えを避ける。
8. HANDOFF受信時は現在コードを再確認して継続する。
9. C2C構造化メッセージを返す。
```

## 統合Workspace運用

現在のMac mini運用では次を1つのWorkspaceとして使用します。

```text
/Volumes/ZAKKO_DEV/repos
```

複数Repositoryが同じWorkspaceに存在するため、PLANには対象Repository名と対象パスを明示します。

例:

```text
Repository: Shota-Zaki/Template-Dock
Path: Template-Dock/
```

別Repositoryへ意図せず変更範囲を広げないことを前提とします。

各Repositoryの `.c2cignore` は独立して適用されます。
