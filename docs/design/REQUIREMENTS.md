# Requirements

## Functional

- ChatGPT C2C MCPはread-onlyを維持し、Software Engineering実行はCodexへ限定する。
- Windowsでは `C:\project` が存在する場合、Approved Root未設定の最初のWorkspace利用時に現在Directoryに関係なく `C:\project` を自動登録してDefault Rootとする。
- `C:\project` を1つの常用Workspaceとして扱い、Bridge / Tunnel / ChatGPT Connectorの初回セットアップをRepositoryごとに要求しない。
- ChatGPTからRepository固有情報を扱う場合は同一Workspace内のRepository Contextをname / id / relative rootで選択し、ユーザーへRepository単位のC2C設定や接続作成を要求しない。
- Windows標準Rootを使わない環境では、端末共通Approved Rootを `c2c roots add <path>` で登録でき、以後はRepositoryごとのWorkspace指定を要求しない。
- 複数Approved Rootがある場合、現在Directoryを含む最も深いRootを優先し、該当しない場合はDefault Rootを使用する。
- 明示 `--workspace` は端末共通設定より優先し、既存の単一Workspace運用を維持する。
- 1 Workspaceで1個以上のRepository Contextを扱える。
- Multi-Repository WorkspaceではRepositoryごとのGit state / Branch / Diff / Test・Build結果 / Execution Record / Task・Evidence参照 / Repository identityを識別できる。
- Repository固有Git・Execution操作は複数Repository存在時にselectorを必須とし、暗黙集約しない。
- Workspace-level read/list/searchとRepository-confined read/list/searchを両立する。
- 既存単一Repository Workspaceは後方互換で動作する。
- 既存Repositoryを親Workspace配下へ移行してもRepository identityとstandalone execution historyを引き継げる。
- Cloudflare Quick/Named Tunnel、ChatGPT接続/再接続、Project/long-chat recovery、Windows CLIを維持する。

## Security

- `C:\project` の自動登録は固定されたWindows標準Rootが実在しApproved Root registryが空の場合だけ行い、他Directoryを暗黙に追加しない。
- 手動Approved Root登録はローカルCLIから行い、canonical realpathを保存する。
- 端末共通Root選択後もWorkspace authorization boundary、canonical realpath confinement、symlink escape防止を維持する。
- Repository selectorはWorkspace外を認可しない。Repository-confined pathはRepository境界を再検証する。
- Secret/Credential/Token/OAuth保護、Credential masking、outbound sanitizer、`.c2cignore`を維持する。
- `git_status`は機密path名を返さず件数のみ返す。
- 自動`git pull`、自動stash/reset、無検証自動更新を実装しない。

## Verification

Candidateは可能な限り `corepack pnpm install --frozen-lockfile`、`pnpm test`、`pnpm typecheck`、`pnpm build` を通す。実行不能項目は未検証としてEvidenceへ残し、成功扱いしない。
