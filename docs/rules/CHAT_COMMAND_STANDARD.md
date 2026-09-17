# Chat Command Standard
<!-- rule:commands -->

## コマンド

| Command | 目的 |
| --- | --- |
| /dev <repo> | 正式Rules適用と設計Baseline整備後に開発 |
| /continue <repo> | 適用済みSnapshotで次の実行可能Taskを継続 |
| /status <repo> | 現状・受入・次作業の読み取り専用確認 |
| /design <repo> | 要件・設計・Task設計 |
| /audit <repo> | 根拠付きFindingと対応Task |
| /sync-rules <repo> | 正式なRules配布物と適用記録だけを同期 |
| /rules | 共通Rules正式版の読み取り専用確認 |

repoはowner/nameを基本とし、現在情報から一意なら省略できる。これは会話上の実行契約であり、製品に標準実装されたslash commandだとは主張しない。

## 書き込み範囲

許可パスの正本はmanifestのcommands。スクリプトには同じ一覧をハードコードしない。空配列はRead-only。maintenanceは明示された保守作業、releaseは明示された公開作業のgate用識別子であり、command名だけでユーザー承認を付与しない。
一般的な自律進行より開始時点に固定したcommand Scopeを優先する。作業中にmanifestを書き換えて現在操作の権限を拡大しない。auditは監査記録とTask管理まで、designは設計・Project正本まで。sync-rulesでProject Task移行を行わない。

## 適用Rules

通常のcontinue/design/audit/statusは対象Snapshotを使用し、自動upstream同期を行わない。dev/sync-rules/rules、新規bootstrap、明示的なRules保守だけが最新版の確認入口。statusでdrift確認するのは明示要求時だけ。
rules/statusは書き換えない。sync-rulesの取得・照合・atomic更新は [Versioning](VERSIONING_STANDARD.md) に従う。

## 設計・継続

devは必要な設計BaselineとTaskを整えてから実装する。既存設計を再生成しない。Project Custom InstructionsはRepository入口だけを実値で出力する。continueでは再出力しない。
開始・終了は [Workflow](WORKFLOW.md)、報告は [Output Quality](OUTPUT_QUALITY_STANDARD.md)。Read-onlyではWork Unit文書やTaskの更新を行わない。
