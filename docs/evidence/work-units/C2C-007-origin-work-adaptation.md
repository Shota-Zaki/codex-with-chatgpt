# Work Unit

```json
{
  "schema_version": 1,
  "id": "C2C-007-origin-work-adaptation",
  "task_ids": [
    "C2C-007"
  ],
  "base_commit": "7171977417e6951417a9884a494a9dbca89e1d47",
  "command": "maintenance",
  "changes": [
    {
      "kind": "implementation",
      "paths": [
        "bin/c2c.js",
        "package.json",
        "runtime/**",
        "scripts/macos-service.mjs",
        "src/**",
        "tests/**"
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
        "docs/architecture.md",
        "docs/design/BASIC_DESIGN.md",
        "docs/design/DETAILED_DESIGN.md"
      ]
    },
    {
      "kind": "contracts",
      "paths": [
        "docs/protocol.md",
        "docs/security.md"
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
      "kind": "implementation",
      "paths": [
        "README.md",
        "docs/troubleshooting.md",
        "skill/SKILL.md"
      ]
    },
    {
      "kind": "verification",
      "paths": [
        "docs/evidence/C2C-007/2026-09-26-origin-work-integration.md",
        "docs/evidence/work-units/C2C-007-origin-work-adaptation.md"
      ]
    }
  ],
  "documents": [
    {
      "path": "docs/project/PROJECT_BRIEF.md",
      "decision": "unchanged",
      "reason": "Projectの目的とread-only/Codex execution境界は維持する。"
    },
    {
      "path": "docs/design/REQUIREMENTS.md",
      "decision": "update",
      "reason": "macOS常駐起動、外部通信、子プロセス環境の新しいSecurity要件を追加した。"
    },
    {
      "path": "docs/design/BASIC_DESIGN.md",
      "decision": "update",
      "reason": "privacy bootstrapとmacOS Supervisorの責務・境界を定義した。"
    },
    {
      "path": "docs/design/DETAILED_DESIGN.md",
      "decision": "update",
      "reason": "起動順、egress制約、環境allowlist、Volume/Repository検証と権限昇格境界を記録した。"
    },
    {
      "path": "docs/architecture.md",
      "decision": "update",
      "reason": "macOS常駐構成と現行Multi-Repository境界を説明する。"
    },
    {
      "path": "docs/security.md",
      "decision": "update",
      "reason": "外向き通信制限、子プロセス環境、常駐Supervisorの脅威緩和を追加した。"
    },
    {
      "path": "docs/project/TASKS.md",
      "decision": "update",
      "reason": "環境適応と統合検証を追跡するC2C-007を追加し、未検証としてIn Progressにする。"
    },
    {
      "path": "docs/project/NEXT_WORK.md",
      "decision": "update",
      "reason": "runtime、既存Workspace契約、package、state/diff gateの検証を次のWork Unitにした。"
    },
    {
      "path": "docs/project/AI_WORK_STATE.md",
      "decision": "update",
      "reason": "統合元remote tip、採用方針、未実施検証と再開手順を記録した。"
    },
    {
      "path": "docs/evidence/C2C-007/2026-09-26-origin-work-integration.md",
      "decision": "update",
      "reason": "現candidateの複数Task Verificationを同一target digestと実測結果で記録する。"
    }
  ],
  "notes": [
    "開始SHAは7171977417e6951417a9884a494a9dbca89e1d47。origin/workを89af4fa34952fe58e017b095ae2f793420cf05b0までfetchして統合した。",
    "衝突箇所はローカル実装を土台にし、非競合のruntime/privacy/macOS service変更を適応。Approved RootとMulti-Repository機能を保持した。",
    "bin/c2c.jsからruntime/bootstrap.mjsを読み込み、CLI/daemon起動時にprivacy fetch制御を有効にした。",
    "Corepackは未導入のためnpm execでNode.js 22.23.3とpnpm 11.24.0を指定。frozen install成功、pnpm-lock.yaml変更なし。",
    "全35 test files / 242 tests、runtime 49/49、typecheck、build、mac:plan、Approved Root/CLI focused tests 9/9が成功。",
    "GitHub upstream mainは9663b88753e35c76796c5bce000293e0bd22cd9eで前回監査時から移動なし。",
    "最終candidateでRules 3.0.0 state/diff gateが成功し、Task Evidenceを同一candidateのsha256へ更新した。"
  ]
}
```
