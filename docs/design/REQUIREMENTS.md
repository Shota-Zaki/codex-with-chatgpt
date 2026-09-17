# Requirements

## Functional

- ChatGPT C2C MCPはread-onlyを維持し、Software Engineering実行はCodexへ限定する。
- 1 Workspaceで1個以上のRepository Contextを扱える。
- Multi-Repository WorkspaceではRepositoryごとのGit state / Branch / Diff / Test・Build結果 / Execution Record / Task・Evidence参照 / Repository identityを識別できる。
- Repository固有Git・Execution操作は複数Repository存在時にselectorを必須とし、暗黙集約しない。
- Workspace-level read/list/searchとRepository-confined read/list/searchを両立する。
- 既存単一Repository Workspaceは後方互換で動作する。
- 既存Repositoryを親Workspace配下へ移行してもRepository identityとstandalone execution historyを引き継げる。
- Cloudflare Quick/Named Tunnel、ChatGPT接続/再接続、Project/long-chat recovery、Windows CLIを維持する。

## Security

- Workspace authorization boundary、canonical realpath confinement、symlink escape防止を維持する。
- Repository selectorはWorkspace外を認可しない。Repository-confined pathはRepository境界を再検証する。
- Secret/Credential/Token/OAuth保護、Credential masking、outbound sanitizer、`.c2cignore`を維持する。
- `git_status`は機密path名を返さず件数のみ返す。
- 自動`git pull`、自動stash/reset、無検証自動更新を実装しない。

## Verification

Candidateは可能な限り `corepack pnpm install --frozen-lockfile`、`pnpm test`、`pnpm typecheck`、`pnpm build` を通す。実行不能項目は未検証としてEvidenceへ残し、成功扱いしない。
