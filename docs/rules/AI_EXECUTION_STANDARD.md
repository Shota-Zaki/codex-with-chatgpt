# AI Execution Standard
<!-- rule:ai -->

## 1. 共通の状態復元

通常の既存Projectは同期済みSnapshotを使用する。毎回upstreamを取得・同期しない。最新版取得の入口は [Chat Command Standard](CHAT_COMMAND_STANDARD.md)、欠損復旧は [Versioning](VERSIONING_STANDARD.md)。

最初にbranchと利用可能なAGENTS入口を特定し、RULES_SOURCE（配布元自身はmanifest）、TASKS、NEXT_WORK、AI_WORK_STATEを読む。現在Taskに必要なbrief/design/code/tests/evidenceと、必須の共通原則・終了契約・現在の実行主体・command契約を確認する。その他の規約は変更種別から担当を選択する。通常開始時の全Directory走査は不要だが、必須契約を読まずに速度だけを優先しない。

公開mainにAGENTSやSnapshotがないことを、非管理Repositoryと断定する根拠にしない。既知のRepositoryとworkの入口を参照する。未コミット変更を伴う自動checkoutをしない。

## 2. 優先順位とScope

Platformの上位指示を前提に、現在のユーザー指示、commandの許可範囲、Project固有契約、適用Snapshotを照合する。差分が矛盾する場合は最小の安全なScopeへ限定し、必要な決定を正本に残す。低優先の文書は上位指示・権限境界を上書きできない。

Repositoryで合理的に決められる命名・Scope内実装・テスト・正本同期は再質問せず進める。要件不明や外部影響がある操作を「自律実行」で無条件許可しない。
main Promotion、Production deploy、本番の破壊的変更、課金・購入、Credential/Secretの変更、実注文・送金は明示指示が必要。通常の参照や承認済み権限でのreadと、Secretの変更・露出を区別する。

## 3. Liveness

成果物を進めるために必要な状態が揃ったらCore actionへ進む。Rules同期、環境整理、Plugin列挙等はユーザー要求か成果物の必須条件である場合だけ行う。Tool数は探索を見直す目安であり、安全確認・契約確認を省く上限ではない。
同じ原因の失敗を反復せず、原因に対応する代替経路へ切り替える。非Blockingな保守は別Taskにする。

## 4. 局所的な失敗

原因・影響・再開条件をTaskへ記録し、依存しないReady Taskを続行する。危険、権限不足、必須外部環境不足等で安全な作業が残らない場合だけ現在の作業を止める。未検証をPASS、未完了をDoneに変換しない。
終了処理は [Workflow](WORKFLOW.md)、引継ぎは [Context Handoff](CONTEXT_HANDOFF_STANDARD.md) を参照する。

## 5. 実行主体

ChatGPTは [ChatGPT Standard](CHATGPT_EXECUTION_STANDARD.md)、Codexは [Codex Standard](CODEX_EXECUTION_STANDARD.md) の固有差分を追加する。接続済みTool・Plugin・Skillは能力であり、起動時の全数確認リストではない。
