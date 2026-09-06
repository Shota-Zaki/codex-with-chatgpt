# 2026-09-06 静的監査: credential redaction

- Finding: `F-C2C-003` / High。
- Review HEAD: `a7e8146ffb803364e5862a34ec1470d41c00826b`。
- 対象: `src/security/outbound-sanitize.ts`、`src/logger/index.ts`。
- Evidence: 従来のgeneric assignment式はkey直後の閉じ引用符を許容せず、`"password": "..."`を認識しない。引用符付き値に空白がある場合も値全体を除去できない。LoggerはC2C/OAuth専用式だけを使い、MCP側の一般credential形式と一致していなかった。
- Impact: 読取許可された通常ファイルやログmetadataに含まれる一般password等が、認識済みcredential形式なのにMCP応答/ログへ残り得る。実Secretや実被害を発見したという意味ではない。
- Decision: FIX。副作用のない`src/security/redact.ts`へC2C形式・一般token形式・assignment値のredactionを統合する。Loggerの既存`redact` exportは再exportで維持し、MCP sanitizerはpure moduleを直接参照する。
- Reason: 同じ秘密情報は同じ理由で変更されるため、この責務だけを共有する。Loggerのファイル出力・MCPのprivate-key拒否・home-path処理は別責務のまま維持する。新dependencyや汎用クラスは追加しない。
- Regression source: 引用符付きJSON key、空白/escaped quote/backslashを含む値、隣接非secret field、single quote、環境変数、Basic/Bearer、二重通過の安定性、既知token、実Logger書込経路、private-key拒否のテストコードを追加。
- Static re-review: 既存C2C patternを保持、logger呼出/exports互換、private-key判定がredactionより前、引用符/隣接fieldを保持する値境界、placeholderを全体として再認識することを確認する。
- Validation: 今回は静的監査のみ。test/build/lint/formatter/typecheck/アプリ/通信等は一切実行しない。テストPASSや利用者PCへの反映は主張しない。
- Limit: 正規表現で認識可能なcredential形式の修正であり、任意の未知の秘密文字列を完全検出するDLPではない。壊れた構文・分割された情報・独自キー名等に対する安全保証へ拡大しない。
- 全体集計・Decision/Change正本: `Shota-Zaki/AI-Knowledge-LAB` / `audit/static-20260906` / `ALL_REPOSITORIES_AUDIT.md`。この文書は当該修正の固定記録であり、別の全体台帳ではない。
