# Detailed Design

## Machine-wide Approved Root registry

`bin/workspace-roots.js` が端末共通のApproved Root registryを担当し、OSごとのC2C state directory配下 `workspace-roots.json` に保存する。`C2C_STATE_DIR` が指定される場合は既存のstate override規約に従う。

- Windows zero-config root: `C:\project`。registryが空でRootが実在する場合、current directoryに関係なく最初のWorkspace解決時にcanonical Rootを自動登録しDefault化する。
- `C2C_DEFAULT_WORKSPACE_ROOT`: test/portable environment向けにzero-config候補を上書きできる。通常Windows利用では設定不要。
- `c2c roots add <path>`: canonical realpathを重複排除して追加し、Default Rootへ設定する。
- `c2c roots list`: Approved Root一覧とDefault Rootを表示する。
- `c2c roots remove <path>`: Rootを削除し、Default削除時は残存RootをDefaultへ選び直す。
- `c2c roots default <path>`: 既にApprovedなRootだけをDefaultへ変更する。
- `c2c roots resolve`: current directoryに適用されるRootを確認する。
- 通常command: 明示 `--workspace` > current directoryを含む最深Approved Root > Default Root > zero-config bootstrap > current directory の優先順。
- zero-config bootstrapは固定候補Rootだけを認可対象とし、候補Root以外のDirectoryを暗黙登録しない。
- machine-wide command (`prefs`, `sandbox-allow`, `update-check`, `tunnel login`, `roots`) にはWorkspaceを注入しない。
- registryはowner-onlyを意図したmodeでatomic writeし、Windows等chmod semanticsがない環境ではbest effortとする。

引数正規化は既存の`bin/c2c.js` executable boundaryで実施する。`record`より先にWorkspace既定値を注入するため、親Approved Root配下のRepository cwdから実行した既存record自動タグ付けも維持する。

## Single Workspace lifecycle

Windows標準構成では `C:\project` のWorkspace IDに対してBridge daemon、OAuth/token store、Tunnel state、Connector endpointを1組だけ持つ。`c2c setup` / `start` / `status` / `doctor` を別Directoryから実行しても同じWorkspaceへ解決されるため、RepositoryごとのBridge/Tunnel/Connectorは作成しない。

Repository選択はMCP data plane内部で行う。`workspace_info` がRepository一覧を返し、repository-specific toolはid / name / Workspace-relative rootをselectorとして使用する。これにより接続単位は1つでも、Git/Execution/Task・Evidenceの識別境界はRepository単位で維持する。

## Repository registry

`src/workspace/repositories.ts` がRepository Contextの検出・選択・containmentを担当する。

- stable id: canonical repository rootをcase-normalize後SHA-256し先頭12文字。
- auto discovery: Workspace root自身がGit toplevelならrootのみ。そうでなければ直下DirectoryのGit toplevelをbounded discoveryする。
- explicit discovery: `.c2c.json.repositories` のWorkspace-relative rootを最大64件受ける。
- selector: id / Workspace-relative root / 一意なname。
- 複数Repositoryでselector省略時は `REPOSITORY_REQUIRED`。
- Repository-confined pathはWorkspace resolve後にRepository rootからのrelative pathを再評価し、sibling escapeを `PATH_OUTSIDE_REPOSITORY` で拒否する。

## MCP

`workspace_info` は `repositoryCount` と `repositories[]` を返す。各Repositoryはid/name/rootAlias/project metadata/Git identityを持つ。

`git_status` / `git_diff` / `test_status` / `execution_summary` / `execution_output` はRepository Contextを選択して返却結果にもidentityを含める。tool数とOAuth scopeは増やさない。

## Git

`git_status` は `IgnoreRules.isSensitive()` に一致する通常change/untracked/rename/conflictのpath名を返さず、`hidden.changes` / `hidden.conflicts`だけを返す。`git_diff`は既存のsafe path inventory、literal pathspec batching、aggregate cap、fail-closedを維持する。

Windowsの非対話Git/ripgrep/cloudflared background processは`windowsHide: true`を使用する。Cloudflare transportは `C2C_TUNNEL_PROTOCOL=auto|quic|http2` を任意指定でき、未指定時は既定挙動を維持する。

## Execution records

Workspace単位JSONL/indexは維持し、record/output metadataに任意の `repositoryId` / `repositoryRoot` を付与する。`c2c record --repository`をentrypointで正規化し、既存SkillがRepository cwdから`record -w <workspace>`を呼ぶ場合はGit toplevelを自動タグ付けする。

親Workspace配下に移行したRepositoryは旧standalone IDとRepository IDが一致するため、旧standalone execution recordをRepository historyとして参照できる。親Workspaceの旧・未タグrecordは曖昧なためchild Repositoryへ推測帰属させない。

## Update policy

upstreamはcommit単位で監査し、Hardened Forkの固定dependency、Security hardening、日本語化、手動検証Update policyを優先する。upstream versionはFork prerelease suffixで表現し、単純mergeしない。

## Reconnect pairing

`c2c doctor` は再接続に必要な状態診断・Tunnel/Connector修復情報の提示までを担当し、Connector再作成時のpairing codeは発行しない。pairing codeはChatGPTの認証フォームが表示された時点で `c2c pair -w <workspace> --json` からfresh発行し、期限切れ・使い捨てcodeの先行消費を避ける。初回 `c2c setup` のpairing発行は既存互換として維持する。
