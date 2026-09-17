# Work Unit

```json
{
  "schema_version": 1,
  "id": "C2C-006-single-workspace",
  "task_ids": [
    "C2C-006"
  ],
  "base_commit": "27270d957371e246d58324dba17ca5b1272da486",
  "command": "continue",
  "changes": [
    {
      "kind": "implementation",
      "paths": [
        "bin/workspace-roots.js",
        "tests/workspace-roots.test.ts"
      ]
    },
    {
      "kind": "requirements",
      "paths": [
        "docs/design/REQUIREMENTS.md"
      ]
    },
    {
      "kind": "architecture",
      "paths": [
        "docs/design/BASIC_DESIGN.md",
        "docs/design/DETAILED_DESIGN.md"
      ]
    },
    {
      "kind": "tasks",
      "paths": [
        "docs/project/TASKS.md",
        "docs/project/NEXT_WORK.md",
        "docs/project/AI_WORK_STATE.md"
      ]
    },
    {
      "kind": "verification",
      "paths": [
        "docs/evidence/C2C-006/2026-09-17-global-approved-roots.md"
      ]
    }
  ],
  "documents": [
    {
      "path": "docs/design/REQUIREMENTS.md",
      "decision": "update",
      "reason": "C:\\projectをcurrent directory非依存の単一常用Workspaceとし、RepositoryごとのC2C接続作成を不要にする要件へ変更した"
    },
    {
      "path": "docs/design/BASIC_DESIGN.md",
      "decision": "update",
      "reason": "1 Bridge/Tunnel/ConnectorをC:\\project配下の全Repositoryで共有する構成を明記した"
    },
    {
      "path": "docs/design/DETAILED_DESIGN.md",
      "decision": "update",
      "reason": "zero-config bootstrapのcurrent-directory制約を外し、Single Workspace lifecycleを定義した"
    },
    {
      "path": "docs/project/TASKS.md",
      "decision": "update",
      "reason": "C2C-006の受入条件とFocused Verificationをsingle-workspace仕様へ更新する"
    },
    {
      "path": "docs/project/NEXT_WORK.md",
      "decision": "update",
      "reason": "full package verificationでsingle-workspace解決を再確認する手順へ更新する"
    },
    {
      "path": "docs/project/AI_WORK_STATE.md",
      "decision": "update",
      "reason": "single-workspace candidateの再開条件を記録する"
    }
  ],
  "notes": [
    "node --checkとisolated direct executionでzero-config RootをRoot外current directoryから解決できることを確認した。",
    "full package verificationは既存blockerのため未実施で、C2C-006はDoneへ遷移しない。"
  ]
}
```
