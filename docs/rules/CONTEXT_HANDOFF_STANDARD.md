# Context Handoff Standard
<!-- rule:handoff -->

## Trigger

context/session上限の接近、状態保持の信頼性低下、実行環境の切替、ユーザーからの引継ぎ指示があれば準備する。正確な残token数を取得できない場合は合理的な観測から判断する。

## Checkpoint

安全に完了できる現在のatomic Work Unitを完了し、困難なら壊れない境界で保存する。同期手順は [Workflow](WORKFLOW.md)。Task状態はTASKS、次の1 Work UnitはNEXT_WORK、未完了変更と再開上の注意はAI_WORK_STATE、結果はEvidenceへ置く。Handoff専用の第二台帳を追加しない。
未保存・未commitの変更は対象と復旧手段をpending_changesへ記録し、次Sessionから取得不能なローカルファイルだけに状態を残さない。

## 再開

次Sessionは [AI Standard](AI_EXECUTION_STANDARD.md) の通常復元手順を使用する。全規約・全設計の再読込やChat全文転記を追加しない。確定事項を再質問しない。
新Chat/sessionを直接作成できないSurfaceでは、その事実を前提にRepositoryを再開可能にし、`/continue <owner/repository>` を出力する。実行していない自動切替を報告しない。

## 完了条件

Repositoryだけで現在の未完了範囲、次の具体的作業、必要な検証を特定できる。上限接近を理由に正本同期を省かず、安全な保存境界を優先する。
