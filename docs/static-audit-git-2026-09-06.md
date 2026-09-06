# 2026-09-06 静的監査: Git diff

Review base: `49910af34266216e25b9e220dd2d7e04c8e94160`。対象は`src/workspace/git.ts`と回帰テスト2ファイル。

## F-C2C-005 / Medium — 外部diff/textconv処理の未抑止

- Evidence: diff inventoryとpatch batchの両方が`--no-ext-diff`/`--no-textconv`なしでGitを呼んでいた。Git公式仕様ではconfigured external driverやtextconv filterを実行できる。
- Impact: 認証済みの読取要求で、ローカルGit設定にある外部処理が起動し得る。攻撃成立にはその設定等が必要であり、未認証の任意コード実行や現実の悪用とは分類しない。
- Decision/Reason: 両呼出へ明示的な禁止flagを追加する。shellを使わないargv方式、mode whitelist、NUL inventory、敏感path/rename両端判定、literal pathspecは維持する。
- Tests source: 各modeのinventory/patch argvの両方にflagとpath境界があることを確認するmockテスト。実外部helperは使わない。
- Limit: Gitの全機能・filter・fsmonitor・ローカル設定をsandbox化する変更ではない。信頼しないGit実行環境全体への安全保証をしない。

## F-C2C-008 / Medium — Unicode diffのpage境界破損

- Evidence: UTF-8 Bufferを任意byteで切り`toString`していた。改行がpage内にない長い行では文字の途中で切れ、次pageも継続byteから始まる。
- Impact: 日本語等のコード差分が置換文字となり、複数pageを再結合しても元の差分を復元できない。
- Decision/Reason: page末尾をUTF-8 code point境界へ戻してからdecodeし、従来の改行優先とbyte cursorを維持する。
- Tests source: 長い日本語/emoji行を小さいpageで読み、byte数・cursor前進・上限・全文復元を確認するコード。
- Limit: 保証対象はoffset=0から返却されたnextOffsetを使う連続page。呼出側が独自に文字途中のoffsetを指定する問題とは区別する。

## F-C2C-009 / Medium — Git子directoryでのpath基準不一致

- Evidence: workspaceがGit rootの子directoryの場合、Git既定のrepo-root基準のname-statusをworkspace-relativeのscopeと照合し、さらにcwd-relative pathspecとして再利用していた。
- Impact: 正当なworkspace内差分が欠落し、特定file scopeが空結果になり得る。
- Decision/Reason: inventoryとpatchの両方に`--relative`を指定してworkspace基準へ統一する。既存の`.` pathspecによる対象制限は維持する。
- Tests source: 独立fixture repoの子workspaceで3modeを確認し、兄弟file内容が返らないこともassertする。今回はテストを実行しない。

## Static review / record

- 既存OAuth・bridge修正、runGit公開signature、gitInfo/gitStatus、rename機密保護、batch/aggregate capを変更しない。
- 変更後は保存patchと関連tool入力/返却schemaを静的に再確認する。実行検証は対象外でPASSを主張しない。
- 根拠: https://git-scm.com/docs/git-diff （no-ext-diff/no-textconv/relative）。
- 全体正本: `Shota-Zaki/AI-Knowledge-LAB` / `audit/static-20260906` / `ALL_REPOSITORIES_AUDIT.md`。
