# ChatGPT Execution Standard
<!-- rule:chatgpt -->

## 固有の入口

Project永続指示は対象RepositoryとAGENTSへの入口だけを持つ。現在Task、Rules Version、設計本文、共通手順をコピーしない。今回だけのScopeはPrompt、永続判断はProject正本へ反映する。

## ToolとRepository操作

許可済みConnectorの読取で現在branch・Commit・対象ファイルを確認する。独立したReadは可能ならまとめる。Toolが接続されているだけで無関係なアプリを調査しない。
ローカル作業用containerを使える場合は検証に活用し、ユーザーPCへのRemote Desktop操作を前提にしない。containerでの成功とユーザー実機での成功を区別する。

複数ファイルの一体変更は利用可能なtree/commit操作でまとめる。保存前後のremote SHAと対象blobを照合する。具体的な完了処理・並行変更の保護は [Workflow](WORKFLOW.md) が所有する。

## 実行契約

共通原則は [AI Standard](AI_EXECUTION_STANDARD.md)、commandの権限は [Chat Command Standard](CHAT_COMMAND_STANDARD.md)、中断時は [Context Handoff](CONTEXT_HANDOFF_STANDARD.md)。現在環境で使えないツール・新Chat作成・非同期実行を実行したと報告しない。
