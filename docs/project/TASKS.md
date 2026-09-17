# Tasks

このJSON blockだけを構造化情報の正本とする。本文へ状態・結果を転記しない。

```json
{
  "schema_version": 1,
  "tasks": [
    {
      "id": "C2C-001",
      "purpose": "upstream mainの未取込変更を変更単位で監査しHardened Forkへ安全に追従する",
      "status": "In Progress"
    },
    {
      "id": "C2C-002",
      "purpose": "1 Workspaceから複数Repositoryを識別・分離してread-only MCPから扱えるようにする",
      "status": "In Progress"
    },
    {
      "id": "C2C-003",
      "purpose": "upstream再接続改善を日本語SkillとHardened運用へ退行なしでAdaptし実受入する",
      "status": "In Progress"
    },
    {
      "id": "C2C-004",
      "purpose": "candidateでfrozen install・test・typecheck・build・Windows/tunnel/recovery受入を完了する",
      "status": "Blocked"
    },
    {
      "id": "C2C-005",
      "purpose": "CodeX-Chat-Develop統合前Baselineとして受入後にrelease/update手順へ進める",
      "status": "Backlog"
    }
  ]
}
```
