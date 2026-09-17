# Task Standard
<!-- rule:tasks -->

## 1. Taskの責務

全Taskの正本は `docs/project/TASKS.md` の単一JSON block。Taskは受入を独立判定できる単位とし、さらに小さい実行境界をWork Unitとする。
詳細な正常系・異常系・Data Flow・API契約は設計へ置き、Taskは参照する。共通Done条件をTaskごとに複製しない。

## 2. 必須項目

常に必須: `id`、`purpose`、`status`。IDはRepository内で一意とし、削除後も別目的へ再利用しない。
Ready以降は `priority`、`scope`、`dependencies`、`references`、`acceptance`、`verification`、`evidence` を必須とする。referencesは設計等の実在パス。scopeは許可する相対パスglob。dependenciesはTask ID。acceptanceは一意なIDとcondition。verificationは一意なID、required、method、acceptance参照、targetsを持つ。
Blocked/Deferredは `blocker` にcause、impact、resume_conditionを必須とする。reasonは状態・契約変更の根拠として使用する。

## 3. 状態

`Backlog` は計画不足、`Ready` は実行契約と依存充足、`In Progress` は作業中、`Review` は受入判定中、`Blocked` は外部条件等で停止、`Deferred` は理由付き保留、`Done` は受入完了。
通常はBacklog → Ready → In Progress → Review → Done。checkpoint間に複数段階を進めることはできるが、中間gateを省略しない。依存未充足や循環依存のままReady以降へ進めない。Doneを再開するときはreasonを残す。

## 4. Done

全受入条件が、対応付けられたRequired Verificationのpassで満たされ、Evidenceを追跡でき、関連正本が整合していること。設計・実装・必要なSecurity/Quality確認が完了し、受入を妨げる重大問題を残さない。
必要な実行検証を静的レビューの自己申告へ置き換えない。適用しない検証は計画のrequired=falseとし、not_required_reasonを必須にする。各受入条件には少なくとも1つのRequired確認を残す。
既存のRequired条件を弱める・削除する場合は、仕様変更または同等代替の根拠をWork Unit記録に残す。Doneへ進めるためだけの条件変更は禁止する。

## 5. 次作業・再開状態

NEXT_WORKはtask_id、work_unit_id、goal、scope、steps、exit_condition、verification_idsだけを持つ。TaskのStatusや検証結果は持たない。対象は依存を満たすReady/In Progressの1つ。実行可能Taskがなければwork_unit=nullとreasonを残す。
AI_WORK_STATEはbranch、base_commit、checkpoint_id、pending_changes、resume_notesだけを持つ。次Task一覧・進捗率・検証結果・TaskのStatusは置かない。
構造化フィールドにはschema_versionを付け、形式変更は移行Taskとして扱う。
