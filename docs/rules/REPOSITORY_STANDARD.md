# Repository Standard
<!-- rule:documents -->

## 1. 情報所有と更新契機

以下は `work` の固定正本。各行の情報を別名の正本へ複製しない。

| パス | 所有する情報 | 更新する契機 | 所有しない情報 |
| --- | --- | --- | --- |
| docs/project/PROJECT_BRIEF.md | 目的、対象者、Projectの境界 | 目的・対象者・大きな範囲の変更 | 詳細要件、Architecture本文、進捗 |
| docs/design/REQUIREMENTS.md | 機能・非機能要件、制約、要件受入条件 | 提供する挙動・制約の変更 | 実装手順、Task状態 |
| docs/design/BASIC_DESIGN.md | 構成、主要責務、境界、主要Data Flow | 構成・責務・データ所有の変更 | API項目の完全定義、進捗 |
| docs/design/DETAILED_DESIGN.md | API、Schema、状態遷移、正常・異常・境界の契約 | 実装上の契約変更 | Task台帳、検証実績 |
| docs/design/adr/ | 判断理由、代替案、採否の履歴 | 重要な設計判断の採用・変更 | 現在仕様の第二の正本 |
| docs/project/TASKS.md | Task状態、依存、受入条件、検証計画、Evidence参照 | Taskの契約・状態・参照の変更 | 設計本文、実測結果、手入力進捗率 |
| docs/project/NEXT_WORK.md | 次の1 Work Unitの目的・手順・終了境界 | 次の作業・順序・境界の変更 | Task状態、次Task一覧、検証結果 |
| docs/project/AI_WORK_STATE.md | 前回境界、未完了変更、再開時の注意 | checkpoint・中断・引継ぎ | Task状態、次作業計画、検証結果 |
| docs/evidence/ | 版を特定した観測結果、Work Unit影響判定 | 検証・作業単位の記録 | 現在のTask状態の第二台帳 |
| docs/quality/ | 監査Findingと根拠・推奨対応 | 監査結果の変化 | Task状態の第二台帳 |
| docs/rules/RULES_SOURCE.md | 適用Snapshotの版・取得元・ハッシュ | Snapshot同期 | Project状態・共通Ruleの独自改変 |
| AGENTS.md | 入口、Project固有の適用差分 | 入口・適用差分の変更 | 共通Rule本文・Task本文 |

同じTask IDや参照の再利用は許可する。別ファイルに同じTaskのStatusや検証結果を手入力しない。過去のEvidenceは日時・対象版が明確な履歴として保持でき、現在状態の読み取り元にはしない。
仕様の適用差分はProject正本で明示し、Snapshotを独自編集しない。

## 2. 構造化領域

TASKS、NEXT_WORK、AI_WORK_STATE、RULES_SOURCE、機械検証するEvidenceは、それぞれ1つのJSON fenced blockを正本とする。対応テンプレートを用いる。未知のフィールドや同一JSONキーの重複はエラー。本文に同じ値を再記載せず、補足理由・参照だけを置く。
これはMarkdownと別JSONファイルの二重管理ではなく、Markdown内の1つのデータ領域である。表示用進捗はTaskから計算し、Phaseやパーセントを手入力しない。

## 3. Rootと文書の成長

root MarkdownはREADMEとAGENTSを基本とし、工具・配布上必要なLicense等は理由付き例外とする。Task・設計はrootへ追加しない。`.codex/config.toml` は実行設定であり、要件・Taskの正本ではない。

長い詳細設計は `docs/design/` 配下に契約単位で分割し、DETAILED_DESIGNを索引にできる。旧本文を残したまま同内容を新ファイルへ追加しない。TASKSの現行形式を変更する分割は移行Taskとして設計する。別名台帳を独断で増やさない。

## 4. Branchと公開

`work` が開発状態、`main` が公開に必要な成果物・build/deploy/runtime最小構成。Project正本、Snapshot、Evidence、差分、backup、旧版、一時fileは公開成果物でない限りmainに含めない。READMEやAGENTSも自動的に公開必須ではない。

公開はwork全体のmergeではなく対象を選別するPromotion。履歴はGit historyまたはworkで保持し、公開treeへ旧版を残さない。License等の必要な配布義務は保持する。main単体の成立性を確認する。

この配布元ではRules・テンプレート・ツール・その検証テストが公開成果物。公開許可パスはmanifestのpublicationを使用する。配布元自身もworkにProject正本を持つが、自分のSnapshotは作らない。
