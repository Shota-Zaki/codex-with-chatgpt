# 2026-09-06 静的監査: workspace read boundaries

## F-C2C-004 / Medium — 最初の選択行が応答byte上限を回避

- Evidence: `src/workspace/manager.ts`の`readFile`は`collectedBytes + cost > maxBytes && lines.length > 0`で打切りを判定していた。最初の選択行ならどれだけ大きくても追加され、MCPの`read_file`もその結果を返す。
- Impact: 文書化されたresponse上限を超える内容が返り、メモリ・通信量を増やし得る。実際の攻撃や障害を確認したという意味ではない。
- Decision/Reason: 最初の選択行だけで上限を超えた場合は既存の`FILE_TOO_LARGE`を返す。後続行は既存の行単位paginationを維持する。例外時も`finally`でreadline/streamを閉じる。
- Tests source: ASCII/UTF-8の長い先頭行、通常の先頭page、巨大な次page、tailへの明示移動、改行予算を含む境界。
- Limit: 応答sizeの修正であり、総行数算出のための全file走査やreadline内の単一行bufferを完全に制限する変更ではない。

## F-C2C-006 / Medium — プロジェクトmetadataのcontainment迂回

- Evidence: コンストラクタの`.c2c.json`と`detectProject`の`package.json`は`readJsonIfExists(path.join(root,...))`で直接読み、`resolve`のrealpath/機密file判定を通らない。`workspace_info`はname/scriptsをMCPへ返す。
- Impact: workspace内のlinkを通じて他workspaceのmetadata/scripts又は機密fileの該当fieldを読み得る。任意の全fileを返す経路とは区別する。
- Decision/Reason: metadataも`resolve`と通常file確認を通す。optional metadataが拒否/不存在/不正なら従来どおり既定値へ戻る。project判定のmarkerも同じcontainmentを使う。workspace内の非機密fileへのlinkは引き続き許可する。
- Tests source: 外部.c2c.json/package.json、内部の機密fileへのalias、内部の安全なalias、file名のdirectory。
- No Change: `.c2cignore`の読み取りはpolicy初期化の別経路であり、この修正でcontainment済みとは主張しない。policy設定のlink/サイズ/失敗時動作は別途確認対象として残す。

## 変更後の確認

- Review base: `f271cd99fc2a9738b39697872991d6d3abc22eed`。
- 対象: `src/workspace/manager.ts`、`tests/workspace-read-boundaries.test.ts`、本記録。
- Static review: root/id/ignoreRules初期化後にmetadata解決すること、既存errorのMCP安全変換、旧public interface、400行/2000行・byte上限・通常paginationを維持することを確認する。テストはtmp領域を使い、link権限不足は明示skipする。
- 今回は静的監査のみで、テストその他の実行検証は行っていない。利用者PC/mainへの反映も行っていない。未実行をPASSにも本監査の未完了理由にも扱わない。
- 全体正本: `Shota-Zaki/AI-Knowledge-LAB` / `audit/static-20260906` / `ALL_REPOSITORIES_AUDIT.md`。
