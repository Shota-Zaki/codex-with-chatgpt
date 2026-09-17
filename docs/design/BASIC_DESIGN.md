# Basic Design

## Boundaries

- Workspace = OAuth/token/bridgeの認可境界。
- Repository Context = Workspace内のGit/Execution/Task・Evidence識別境界。
- ChatGPT MCP = read-only data plane。
- Codex = edit/shell/git mutation/test/buildを担当するexecution plane。

## Multi-Repository

`workspace_info`でRepository一覧とstable `repositoryId`を返す。Workspace rootがGit rootなら単一Repository、非Git rootなら直下Git rootを自動検出する。深い階層は `.c2c.json.repositories` で明示する。

複数Repository時のGit/Execution系MCPはselector省略を`REPOSITORY_REQUIRED`で拒否する。read/list/searchはWorkspace全体またはRepository-confinedで使用可能。

## Compatibility

単一Repository時は既存呼び出しのselector省略を許可する。Repository IDはstandalone Workspace IDと同じ算出方式とし、既存execution historyを引き継ぐ。

## References

詳細実装は [DETAILED_DESIGN](DETAILED_DESIGN.md)、Security boundaryは [security](../security.md)、全体構成は [architecture](../architecture.md) を参照する。
