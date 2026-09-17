# Project Brief

## Purpose

ChatGPTをReason/Plan/Review、CodexをSoftware Engineering実行主体として分離し、ローカルWorkspaceを安全なread-only C2C MCP経由で接続するHardened Forkを維持する。

## Target users

Codexを実行主体としてローカル開発を行い、ChatGPTから設計・レビュー・進捗判断を行う開発者。単一Repositoryだけでなく、関連する複数Repositoryを1 Workspaceで扱う構成も対象とする。

## Project boundary

C2C Bridge / OAuth / MCP / Workspace・Repository識別 / Git read / Search / Execution Record / Cloudflare Tunnel / ChatGPT Project・long-chat recovery / CLI / Skillを対象とする。ChatGPT MCPからのwrite/delete/shell/commit/package installは対象外で、実行はCodexへ限定する。

詳細要件は `../design/REQUIREMENTS.md`、構成は `../design/BASIC_DESIGN.md` と既存 `../architecture.md` を正本とする。

## References

- 要件: [REQUIREMENTS](../design/REQUIREMENTS.md)
- 構成: [BASIC_DESIGN](../design/BASIC_DESIGN.md)
- Security: [security](../security.md)
- Architecture: [architecture](../architecture.md)
