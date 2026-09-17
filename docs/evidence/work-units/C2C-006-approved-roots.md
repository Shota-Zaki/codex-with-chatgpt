# Work Unit

```json
{
  "schema_version": 1,
  "id": "C2C-006-approved-roots",
  "task_ids": [
    "C2C-006"
  ],
  "base_commit": "423b0398730a55702d2314115b3b77e83c4f6323",
  "command": "dev",
  "changes": [
    {
      "kind": "implementation",
      "paths": [
        "bin/c2c.js",
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
        "docs/project/NEXT_WORK.md"
      ]
    },
    {
      "kind": "resume",
      "paths": [
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
      "path": "docs/project/PROJECT_BRIEF.md",
      "decision": "unchanged",
      "reason": "read-only C2CとCodex execution planeというProject目的・境界は変更しないため。"
    },
    {
      "path": "docs/design/REQUIREMENTS.md",
      "decision": "update",
      "reason": "端末共通Approved Root、解決優先順位、明示--workspace優先を機能・Security要件へ追加するため。"
    },
    {
      "path": "docs/design/BASIC_DESIGN.md",
      "decision": "update",
      "reason": "Approved Root registryをWorkspace選択前段として正式化するため。"
    },
    {
      "path": "docs/design/DETAILED_DESIGN.md",
      "decision": "update",
      "reason": "registry保存先、CLI、解決順序、record連携の実装契約を定義するため。"
    },
    {
      "path": "docs/architecture.md",
      "decision": "unchanged",
      "reason": "Bridge/MCP/OAuth/Repository Contextのcomponent topologyは変更せず、CLI entrypointのWorkspace既定値解決だけを追加するため。"
    },
    {
      "path": "docs/project/TASKS.md",
      "decision": "update",
      "reason": "新規Task C2C-006とRequired Verificationを追加するため。"
    },
    {
      "path": "docs/project/NEXT_WORK.md",
      "decision": "update",
      "reason": "未実施のfull package verificationを次の1 Work Unitとして固定するため。"
    },
    {
      "path": "docs/project/AI_WORK_STATE.md",
      "decision": "update",
      "reason": "未検証範囲と再開条件をcheckpointへ残すため。"
    }
  ],
  "notes": [
    "mainへの公開はこのWork Unitに含めない。",
    "ChatGPT C2C MCPのwrite/delete/shell/commit/package install capabilityは追加していない。"
  ]
}
```
