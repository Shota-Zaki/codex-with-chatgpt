# Verification Standard
<!-- rule:verification -->

## 1. 選択

受入条件と変更の失敗リスクから必要十分な方法を選ぶ。文章の整合は静的レビュー、動作変更は関係するTest/Typecheck等、build/runtime/native依存は必要な実行検証を用いる。静的レビューが低コストだからという理由だけで、実行しなければ確認できない挙動をPASSにしない。
全Test・install・Build・E2E・実機検証の一律反復は不要。既存テストを削除・弱体化する場合は仕様根拠を残す。

## 2. Evidence形式

`docs/evidence/<task-or-unit>/<record>.md` の単一JSON blockを用いる。
`schema_version`、`id`、`recorded_at`（timezone付き）、`environment`、`target`、`checks`を必須とする。
targetは `{kind: files-sha256, files: {相対パス: SHA-256}}`。検証対象のbyte列でハッシュを計算する。自分自身やTask状態・次作業・checkpoint文書をtargetに含めて自己参照しない。
checksはTaskで定義したVerification IDごとのstatus、method、summary。statusは `pass / fail / not-run / not-required / blocked / deferred`。

Commit SHAだけは成功の証明にならない。検証対象の特定と、観測結果の両方を残す。TaskのtargetsがEvidenceのtarget.filesで覆われている必要がある。成功対象の内容が変更された場合は再検証し、古いEvidenceを現在の成功として使わない。
既存Evidenceを現在のDone根拠から外して履歴に残すことはできる。別ファイルへ結果を転記せず参照する。同じ検証実行が複数Taskの根拠になる場合、1つのEvidenceを各Taskから参照できる。Verification IDで対応付け、同じ実行結果やtarget一覧を複製しない。

## 3. 実機・外部環境

IME、Screen Reader、OS固有permission/installer、Hardware、実接続など、代替手段では受入条件を確認できない範囲だけ実機確認をRequiredにする。実機未実施をpassにしない。不要な実機確認を新たな完了条件へ追加しない。
UnavailableなRequired確認は当該TaskだけBlocked/Deferredとし、独立Taskを続行する。

## 4. 整合性検証の境界

check-project-stateは形式、ID、依存、参照、Doneの証跡、対象digest、command Scope、影響判定と実差分の一致を検証する。JSONの自己申告が真実か、仕様の意味が正しいか、監査Findingが解消したかは別のレビューが必要。
check-rule-packageはmanifest・規約の所有・配布・テンプレート・Snapshotの一致を検証する。構造checkを実行Test、Codex有効指示の確認、実OS受入、Production readinessと同一視しない。

## 5. 強制の境界

状態check、変更gate、書き込み権限・サーバー側保護は別の層。ローカルhookは任意の補助であり、API書き込みや `--no-verify` を防がない。GitHub Actionsを標準手段にせず、利用可能な承認済み経路で同じgateを実行する。権限設定の有効性を未確認のまま保証しない。

参考: https://git-scm.com/docs/githooks
