# Codex Execution Standard
<!-- rule:codex -->

## 指示の配置

Global入口は `$CODEX_HOME/AGENTS.md`（通常 `~/.codex/AGENTS.md`）、Project入口はRepository rootのAGENTS、subtree固有差分だけnested AGENTSへ置く。要件・Task本文は含めない。`.codex/config.toml` は実行設定だけを持つ。

Codexは同じ探索場所の `AGENTS.override.md` をAGENTSより優先し、指示の探索順と読み込み量の制限を持つ。配置したことを有効な指示の読込確認と同一視しない。
参考: https://developers.openai.com/codex/guides/agents-md

## 導入と診断

配布元の `scripts/install-codex-global.py --check --project <path>` で配置・override・開始branchを診断する。install時は既存内容を常に一意なbackupへ保存し、競合検出後に置換する。overrideやユーザー設定を自動削除しない。
実際のCodex起動時には読み込まれた指示と適用Scopeを確認する。診断ツールは有効な指示chainを完全再現せず、未確認は未確認として扱う。

## 開始branch

開発用起動入口はworkのcheckout/worktreeへ向ける。mainが公開最小treeでAGENTSを持たなくても、workの入口・既知のRepository識別で管理対象を判定する。未コミット変更を伴う自動checkoutは禁止する。
Global入口にはProject固有情報を持たせず、Repositoryの指示と正本を参照させる。

## 実行差分

ローカルのGit状態と既存変更を保全し、実装・必要なローカル検証を連続して進める。共通の状態復元・Scopeは [AI Standard](AI_EXECUTION_STANDARD.md)、終了gateとGit操作は [Workflow](WORKFLOW.md) を参照する。
