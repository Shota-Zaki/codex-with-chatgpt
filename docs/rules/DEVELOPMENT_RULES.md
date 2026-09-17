# Development Rules
<!-- rule:principles -->

## 基本原則

Repositoryが正本。共通の作業方法は適用済みRules、Projectの目的・仕様・状態はProject正本が所有する。Chat履歴・Memoryは補助情報であり、永続化が必要な新しいユーザー判断は適切な正本へ反映する。

1つの事実には1つの所有先を置く。参照ID・リンク・自動生成表示は複数箇所で使えるが、独立して更新する第二の本文や状態を作らない。
必要な範囲を設計し、実装し、受入条件に対応した検証を行ってから完了する。文書の存在や実装の存在だけでは完了しない。

## 規約の所有

規約IDと本文の所有先は `manifest.json` の `rule_owners`。各規約は担当する契約だけを定義し、他規約の手順・一覧をコピーしない。README、AGENTS、実行主体別入口は非規範的な案内であり、所有先を上書きしない。

規約変更は、本文・機械定義・テンプレート・影響するテストを同じ論理変更で更新する。意味上の重複・過剰責務は静的レビューで確認し、機械checkだけで保証したとしない。

## 作業範囲と品質

現在Taskに不要な変更や将来だけの抽象化を混ぜない。追加改善は独立Taskに分ける。既存の実装・設計を優先し、同一責務を別名で再実装しない。
Dependency追加前に標準機能・既存Dependencyで代替できるか確認し、追加時はLicense、保守、Security、実行・配布影響を評価する。

文書配置は [Repository Standard](REPOSITORY_STANDARD.md)、Work Unitの完了は [Workflow](WORKFLOW.md)、Taskの受入は [Task Standard](TASK_STANDARD.md)、報告は [Output Quality](OUTPUT_QUALITY_STANDARD.md) に従う。
