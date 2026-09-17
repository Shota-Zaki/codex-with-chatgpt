# Rules Versioning Standard
<!-- rule:versioning -->

## Versionと正式版

Current Versionの値はmanifestだけに保持する。MAJORは配置・Task形式・運用契約の非互換変更、MINORは互換追加、PATCHは意味を変えない修正。変更はworkで検証し、明示された公開作業でmainへPromotionする。mainに存在する固定Commitだけが正式な取得元となる。

## Snapshot同一性

配布物はmanifestのrule_owners、support_filesおよびmanifest自身から算出する。Project固有AGENTSとProject文書はSnapshotではない。
RULES_SOURCEはschema_version、rules_version、source_repository、source_branch、source_commit、synced_at、files（配布先path→SHA-256）を持つ。source_commitは40桁の完全SHA、日時はtimezone付き。filesは配布集合と完全一致させる。

## 同期

1. 正式mainの固定Commitを取得し、Versionと全配布物を先に準備する。
2. 旧RULES_SOURCEと旧manifestで管理していたパスを特定する。旧管理外のProject固有ファイルを削除しない。
3. 新配布内容とbyte単位のSHA-256を比較し、管理済み廃止パスだけを削除対象にする。
4. SnapshotとRULES_SOURCEを同一のtree/commitで更新する。入口の不足だけを同じScopeで補える。
5. source commit、版、配布集合、内容ハッシュ、旧管理対象の残存を確認する。

検証例（正式版の取得済みsource treeで実行）:

```sh
python scripts/check-rule-package.py --root <source> --snapshot <project> --source-commit <sourceSHA>
```

sourceがGit checkoutならHEADと指定SHAの一致、配布対象にローカル変更がないことも確認する。取得済みexportはConnector等で固定SHAと各byteの由来を別途検証する。ハッシュ一致だけで取得元の真正性を保証したとしない。
旧snapshotのRULES_SOURCEを `--previous-source <path>` で渡すと、管理済み廃止パスの残存も検出する。同一版・同一source・同一内容なら再同期しない。復旧不能な欠損やatomic手段不足は当該同期だけを保留する。

## 2.xからの移行

3.xでは状態文書の構造と責務が非互換。Rules同期とProject状態移行は別Taskにする。sync-rules中にTaskを書き換えない。

1. 旧SHA・旧Task ID・状態・要件・Evidence参照を記録する。
2. Task状態をTASKSへ集約し、NEXT_WORKの次の1単位、AI_WORK_STATEの中断情報だけを抽出する。
3. 設計本文は所有する設計へ移し、Taskから参照する。旧内容と新しい所有先の対応を移行Evidenceへ残す。
4. 旧DoneのEvidenceが新形式で検証できない場合、成功を捏造せず再検証する。確認完了までReview等へ移す理由を残す。
5. 新形式のcheckを通し、元の要求・未完了情報が失われていないことをレビューする。
6. まず1Projectで受入し、正式公開後に他Projectへ展開する。fixtureでの成功と実Projectでの受入を区別する。

## 変更履歴

### 3.0.0

情報所有と更新契機を固定。構造化Task/Work Unit/Evidence、配布manifest、状態・変更gate、ハッシュ照合、Codex診断、保守正本を追加。重要な未完了の開示を明確化。

### 2.0.0

workを開発正本、mainを公開最小treeへ分離し、選択的Promotionを導入。

### 1.6.0

適用済みSnapshotによるFast Path、atomic同期、補助作業の抑制。

### 1.5.0

Context HandoffとRepository checkpoint。

### 1.4.0

共通AIと実行主体固有差分の分離。

### 1.3.0

Scopeに必要十分なVerification。

### 1.2.0

Design Gateと設計Baseline。

### 1.1.1

内部状態と通常報告の分離。

### 1.1.0

Chat Command契約。

### 1.0.0

共通開発ルール初版。
