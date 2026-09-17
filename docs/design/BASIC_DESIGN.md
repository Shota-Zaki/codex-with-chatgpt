# Basic Design

## Boundaries

- Approved Root registry = 端末共通のWorkspace既定値を保持するローカル設定。
- Workspace = OAuth/token/bridgeの認可境界。
- Repository Context = Workspace内のGit/Execution/Task・Evidence識別境界。
- ChatGPT MCP = read-only data plane。
- Codex = edit/shell/git mutation/test/buildを担当するexecution plane。

## Approved Root resolution

`c2c roots add <path>` でcanonical directoryを端末共通registryへ追加し、そのRootをDefault Rootにする。通常の`c2c`実行で`--workspace`が省略された場合は、現在Directoryを含むApproved Rootのうち最も深いRootを使用する。該当RootがなければDefault Rootを使用し、registryが空なら従来どおりcurrent directoryを使用する。

明示 `--workspace` は常に優先する。Approved RootはRepository Contextを統合しないため、Git/Execution identityとRepository confinementは既存どおりRepository単位で維持する。

## Multi-Repository

`workspace_info`でRepository一覧とstable `repositoryId`を返す。Workspace rootがGit rootなら単一Repository、非Git rootなら直下Git rootを自動検出する。深い階層は `.c2c.json.repositories` で明示する。

複数Repository時のGit/Execution系MCPはselector省略を`REPOSITORY_REQUIRED`で拒否する。read/list/searchはWorkspace全体またはRepository-confinedで使用可能。

## Compatibility

Approved Root未設定時は従来挙動を維持する。単一Repository時は既存呼び出しのselector省略を許可する。Repository IDはstandalone Workspace IDと同じ算出方式とし、既存execution historyを引き継ぐ。

## References

詳細実装は [DETAILED_DESIGN](DETAILED_DESIGN.md)、Security boundaryは [security](../security.md)、全体構成は [architecture](../architecture.md) を参照する。
