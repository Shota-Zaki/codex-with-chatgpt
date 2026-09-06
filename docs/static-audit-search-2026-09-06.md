# 2026-09-06 静的監査: workspace search

Review base: `36a80b502814e330c784f2612d221709cfaaa962`。sourceは`src/workspace/search.ts`、関連interfaceはMCP `search_workspace`と共通error変換。

## F-C2C-007 / Medium — ripgrep失敗の空成功化

- Evidence: childのclose handlerがexit code/signalを無視して常にresolveしていた。invalid regex等のexit 2も該当なしに見える。stderrも消費されていなかった。
- Impact: 調査漏れ・不正確なレビュー結果を生み、stderr pipe充満時には待ち続け得る。
- Decision/Reason: 正常0/該当なし1/結果上限による意図したSIGTERMを区別し、それ以外と不正JSONを失敗へ送る。stderrは返さずignoreする。literalは既存Node fallback、regexは既存の安全なREGEX_ENGINE_UNAVAILABLEへ進む。
- Tests source: exit2、正常1、malformed JSON、異常signal、literal fallback、意図したlimit停止。fake childであり実外部processは起動しない。

## F-C2C-010 / Medium — 単一file pathのNode fallback取りこぼし

- Evidence: fallbackは指定pathへ常にreaddirし、file指定時の失敗を無視して空結果にしていた。
- Impact: 同一query/pathでもripgrepの有無や起動失敗によって結果が欠落する。
- Decision/Reason: 共通scanFileへ通常fileの検査処理を抽出し、directory traversalと直接fileの両方から使う。機密/noise、2MiB、binary、件数制限を維持する。明示pathの不存在は安全なFILE_NOT_FOUNDとする。
- Tests source: file限定、兄弟除外、不存在、既存directory/globケース。

## F-C2C-011 / Medium — glob経由の正規表現backtracking

- Evidence: regex queryのNode fallbackを禁止している一方で、globの反復wildcardを`.*`等へ置換し、JavaScript RegExpで評価していた。反復wildcardの非一致は多数の組合せを探索し得る。
- Impact: 認証済みworkspace.searchのglob指定でNode event loopを長時間占有し得る。未認証RCEや実際の攻撃を確認したものではない。
- Decision/Reason: 従来の`*`/`**`/recursive directory/`?`とliteral文字を、後方の動的計画法で照合する。user inputからRegExpを作らない。glob長1024とquery全体の照合state計算20,000,000回を上限とし、超過はSEARCH_LIMIT_EXCEEDEDで明示する。case-insensitiveとpath segment境界からの照合を維持する。
- Complexity: 各pathはtoken数×path長、作業メモリはpath長に比例。loop/再帰backtrackingではない。new dependencyは追加しない。
- Tests source: root/nested recursive glob、単一segment、?、反復wildcardの不一致、長さ超過、literal括弧。performance計測は行っていない。
- Limit: Node fallbackは元からglobの部分集合を扱い、ripgrepの全glob構文互換を主張しない。file I/O自体の総時間や全search全体のsandbox保証とは別。

## 静的再レビュー・記録

- error classの追加codeは既存MCP safeFailure経路へ渡る。query値・stderr・絶対pathをerrorへ埋め込まない。
- scanFileを共通化し、同一のsize/binary/limit処理を二重実装しない。既存list_directoryや認証、public tool schemaは変更しない。
- 変更後の保存patch、error propagation、file種別、globのzero/one/many segment、test fixtureの隔離を静的に確認する。
- 今回のtest/build/lint/typecheck/アプリ/通信等の実行検証はすべて対象外。PASSや利用者PCへの反映は主張しない。
- 全体正本: `Shota-Zaki/AI-Knowledge-LAB` / `audit/static-20260906` / `ALL_REPOSITORIES_AUDIT.md`。
