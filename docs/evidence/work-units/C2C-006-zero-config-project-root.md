# Work Unit

```json
{
  "schema_version": 1,
  "id": "WU-C2C-006-ZERO-CONFIG",
  "task_ids": [
    "C2C-006"
  ],
  "base_commit": "4fcd6b4870c9971942e8c048d4a0230970be3541",
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
        "docs/design/REQUIREMENTS.md",
        "docs/design/BASIC_DESIGN.md",
        "docs/design/DETAILED_DESIGN.md"
      ]
    },
    {
      "kind": "verification",
      "paths": [
        "docs/evidence/C2C-006/2026-09-17-global-approved-roots.md"
      ]
    },
    {
      "kind": "resume",
      "paths": [
        "docs/project/AI_WORK_STATE.md",
        "docs/project/NEXT_WORK.md"
      ]
    }
  ],
  "documents": [
    {
      "path": "docs/design/REQUIREMENTS.md",
      "decision": "update",
      "reason": "Windowsの標準開発RootをC:\\projectとし、配下からの初回利用で自動登録するzero-config要件を追加するため。"
    },
    {
      "path": "docs/design/BASIC_DESIGN.md",
      "decision": "update",
      "reason": "Approved Root解決フローへzero-config bootstrapを追加するため。"
    },
    {
      "path": "docs/design/DETAILED_DESIGN.md",
      "decision": "update",
      "reason": "C:\\project候補、適用条件、portable test overrideの契約を明文化するため。"
    },
    {
      "path": "docs/project/TASKS.md",
      "decision": "update",
      "reason": "C2C-006の受入条件をzero-config仕様と、非適用時の後方互換へ合わせるため。"
    },
    {
      "path": "docs/project/AI_WORK_STATE.md",
      "decision": "update",
      "reason": "zero-config実装後もfull package verificationが未完了であるcheckpointを保存するため。"
    },
    {
      "path": "docs/project/NEXT_WORK.md",
      "decision": "update",
      "reason": "次のWork Unitを更新candidateのfull verificationへ維持するため。"
    }
  ],
  "notes": [
    "ユーザー指定のWindows開発Rootは C:\\project。",
    "自動登録はregistryが空でcurrent directoryが候補Root配下の場合だけ行い、別場所から認可境界を暗黙拡張しない。",
    "ChatGPT MCP read-only、Secret保護、Repository confinementは変更しない。"
  ]
}
```
