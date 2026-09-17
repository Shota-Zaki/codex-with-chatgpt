# New Repository Standard
<!-- rule:bootstrap -->

## 初期化

対象RepositoryとProject目的を確定し、開発用workを確立する。固定配置は [Repository Standard](REPOSITORY_STANDARD.md)、配布対象はmanifestを使用する。ファイル一覧をここに手書きしない。

1. 正式mainの固定Commitから配布物・テンプレートを取得する。
2. [Versioning](VERSIONING_STANDARD.md) の手順でSnapshotとRULES_SOURCEを同時に準備する。
3. `templates/repository/` を配置し、Project名・目的・前提を実値にする。空のテンプレートを設計完了とは扱わない。
4. 要件・基本設計・詳細設計・TaskのBaselineを現在Scopeに必要な粒度で整備する。
5. NEXT_WORKに最初のWork Unit、AI_WORK_STATEに初期checkpointを設定する。
6. 配布物check・状態check・内容レビューを行い、atomicに保存する。

## Design Gate

実装判断可能な要件、責務とArchitecture、最初のTaskに必要な契約、完成までを見通せるTask依存、受入条件と必要Verificationが揃っていること。存在確認だけでは通過しない。
該当しない設計項目は理由付きで除外できる。未確定事項に依存しない設計・Taskを止めず、未確定範囲だけ状態管理する。

## 入口

ChatGPT入口はProject Custom Instructions、Codex入口はGlobal/Repository AGENTSのテンプレートを使う。導入確認の詳細は実行主体別Standardを参照する。mainに開発文書をコピーして初期化を代用しない。
