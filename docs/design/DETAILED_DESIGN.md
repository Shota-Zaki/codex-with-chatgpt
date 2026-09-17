# Detailed Design

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
