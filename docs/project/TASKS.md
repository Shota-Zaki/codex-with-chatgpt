# Tasks

```json
{
  "schema_version": 1,
  "tasks": [
    {
      "id": "C2C-001",
      "purpose": "upstream mainの未取込変更をcommit単位で監査しHardened Forkへ安全に追従する",
      "status": "Done",
      "priority": "P0",
      "scope": [
        "src/**",
        "tests/**",
        "skill/**",
        "package.json",
        "pnpm-lock.yaml",
        "docs/design/**",
        "docs/evidence/**",
        "docs/project/**"
      ],
      "dependencies": [],
      "references": [
        "docs/design/REQUIREMENTS.md",
        "docs/design/DETAILED_DESIGN.md"
      ],
      "acceptance": [
        {
          "id": "C2C-001-A1",
          "condition": "upstream mainの監査対象headまでの差分がcommit単位で分類され、有用な変更がHardened方針へ反映または理由付きで非採用となっている"
        },
        {
          "id": "C2C-001-A2",
          "condition": "固定dependency・Security hardening・日本語化・手動検証Update policyが維持されている"
        }
      ],
      "verification": [
        {
          "id": "V-C2C-001-UPSTREAM",
          "required": true,
          "method": "GitHub upstream head再確認と監査記録・現行契約の照合",
          "acceptance": [
            "C2C-001-A1",
            "C2C-001-A2"
          ],
          "targets": [
            "package.json",
            "docs/design/DETAILED_DESIGN.md"
          ]
        }
      ],
      "evidence": [
        "docs/evidence/C2C-005/2026-09-17-baseline-no-device-completion.md"
      ],
      "reason": "2026-09-17にupstream main 9663b88753e35c76796c5bce000293e0bd22cd9eまで再確認し、既監査範囲から追加commitがないことを確認した"
    },
    {
      "id": "C2C-002",
      "purpose": "1 Workspaceから複数Repositoryを識別・分離してread-only MCPから扱えるようにする",
      "status": "Done",
      "priority": "P0",
      "scope": [
        "src/workspace/**",
        "src/mcp/**",
        "src/execution/**",
        "tests/multi-repository*.test.ts",
        "docs/design/**",
        "docs/evidence/**",
        "docs/project/**"
      ],
      "dependencies": [
        "C2C-001"
      ],
      "references": [
        "docs/design/REQUIREMENTS.md",
        "docs/design/BASIC_DESIGN.md",
        "docs/design/DETAILED_DESIGN.md"
      ],
      "acceptance": [
        {
          "id": "C2C-002-A1",
          "condition": "Workspace内の複数Repositoryをstable identityで列挙・選択でき、Git/Execution状態をRepository単位で分離できる"
        },
        {
          "id": "C2C-002-A2",
          "condition": "複数Repository時のselector必須化とRepository confinementにより暗黙集約・sibling escapeを防止できる"
        },
        {
          "id": "C2C-002-A3",
          "condition": "単一Repositoryの後方互換とstandalone execution historyのidentity互換を維持する"
        }
      ],
      "verification": [
        {
          "id": "V-C2C-002-MULTIREPO",
          "required": true,
          "method": "pnpm test + typecheck + build（multi-repository/config/confinement testsを含む）",
          "acceptance": [
            "C2C-002-A1",
            "C2C-002-A2",
            "C2C-002-A3"
          ],
          "targets": [
            "src/workspace/repositories.ts",
            "src/mcp/server.ts",
            "tests/multi-repository.test.ts",
            "tests/multi-repository-config.test.ts"
          ]
        }
      ],
      "evidence": [
        "docs/evidence/C2C-005/2026-09-17-baseline-no-device-completion.md"
      ]
    },
    {
      "id": "C2C-003",
      "purpose": "upstream再接続・機密Git状態・Tunnel互換改善を日本語SkillとHardened運用へ退行なしでAdaptする",
      "status": "Done",
      "priority": "P0",
      "scope": [
        "src/cli/**",
        "src/tunnel/**",
        "src/workspace/**",
        "skill/**",
        "tests/**",
        "docs/design/**",
        "docs/evidence/**",
        "docs/project/**"
      ],
      "dependencies": [
        "C2C-001"
      ],
      "references": [
        "docs/design/REQUIREMENTS.md",
        "docs/design/DETAILED_DESIGN.md",
        "docs/security.md"
      ],
      "acceptance": [
        {
          "id": "C2C-003-A1",
          "condition": "機密Git pathを公開せず、Windows background processとTunnel protocol互換改善をHardened境界内で維持する"
        },
        {
          "id": "C2C-003-A2",
          "condition": "Connector再作成時はDoctorがpairing codeを先行発行せず、認証フォーム表示後にfresh pairingするrecovery契約となっている"
        }
      ],
      "verification": [
        {
          "id": "V-C2C-003-RECONNECT",
          "required": true,
          "method": "pnpm test + typecheck + build + late-pairing/sensitive-git source contract test",
          "acceptance": [
            "C2C-003-A1",
            "C2C-003-A2"
          ],
          "targets": [
            "src/cli/index.ts",
            "skill/SKILL.md",
            "tests/doctor-late-pairing.test.ts",
            "src/tunnel/protocol.ts",
            "tests/git-sensitive-hardening.test.ts"
          ]
        },
        {
          "id": "V-C2C-003-LIVE",
          "required": false,
          "method": "実Cloudflare Tunnel・実ChatGPT connector delete/recreate・saved-chat recovery受入",
          "acceptance": [
            "C2C-003-A2"
          ],
          "targets": [
            "src/cli/index.ts",
            "skill/SKILL.md"
          ],
          "not_required_reason": "2026-09-17のユーザー指示『実機確認はスキップして全作業』により、この完了判定では実接続受入を非必須とする。未実施をpassとは扱わない。"
        }
      ],
      "evidence": [
        "docs/evidence/C2C-005/2026-09-17-baseline-no-device-completion.md"
      ],
      "reason": "実機・実接続受入は明示指示により非必須化し、代替できない実接続成功を主張せずコード契約と自動検証をRequiredとした"
    },
    {
      "id": "C2C-004",
      "purpose": "candidateのfrozen install・test・typecheck・buildとRepository状態Gateを完了し、実機依存確認は明示指示に従い分離する",
      "status": "Done",
      "priority": "P0",
      "scope": [
        "**"
      ],
      "dependencies": [
        "C2C-002",
        "C2C-003"
      ],
      "references": [
        "docs/design/REQUIREMENTS.md",
        "docs/rules/VERIFICATION_STANDARD.md"
      ],
      "acceptance": [
        {
          "id": "C2C-004-A1",
          "condition": "exact candidateでfrozen install・test・typecheck・buildが成功し、Requiredな自動検証に失敗がない"
        },
        {
          "id": "C2C-004-A2",
          "condition": "実機・外部環境依存項目を自動検証のpassへ偽装せず、非必須理由と未実施範囲をEvidenceに残す"
        }
      ],
      "verification": [
        {
          "id": "V-C2C-004-CANDIDATE",
          "required": true,
          "method": "GitHub Actions Node 22: frozen install + pnpm test + typecheck + build",
          "acceptance": [
            "C2C-004-A1",
            "C2C-004-A2"
          ],
          "targets": [
            "package.json",
            "pnpm-lock.yaml",
            "src/cli/index.ts",
            "src/workspace/repositories.ts"
          ]
        },
        {
          "id": "V-C2C-004-DEVICE",
          "required": false,
          "method": "Windows console表示・実Tunnel・実ChatGPT Project/long-chat recoveryの実機受入",
          "acceptance": [
            "C2C-004-A2"
          ],
          "targets": [
            "src/cli/index.ts",
            "src/tunnel/protocol.ts"
          ],
          "not_required_reason": "ユーザーが実機確認スキップを明示したため。OS/外部サービス実接続の成功は未確認として残し、Required自動検証とは分離する。"
        }
      ],
      "evidence": [
        "docs/evidence/C2C-005/2026-09-17-baseline-no-device-completion.md"
      ],
      "reason": "実機確認を完了条件から外す明示的なユーザー仕様変更を受け、Required Verificationは自動実行可能なcandidate検証へ限定した"
    },
    {
      "id": "C2C-005",
      "purpose": "CodeX-Chat-Develop統合前BaselineとしてHardened Forkの正本・Evidence・検証状態を確定する",
      "status": "Done",
      "priority": "P0",
      "scope": [
        ".github/workflows/**",
        "src/**",
        "tests/**",
        "skill/**",
        "docs/**",
        "scripts/**",
        "package.json",
        "pnpm-lock.yaml"
      ],
      "dependencies": [
        "C2C-001",
        "C2C-002",
        "C2C-003",
        "C2C-004"
      ],
      "references": [
        "docs/project/PROJECT_BRIEF.md",
        "docs/design/REQUIREMENTS.md",
        "docs/design/BASIC_DESIGN.md",
        "docs/design/DETAILED_DESIGN.md"
      ],
      "acceptance": [
        {
          "id": "C2C-005-A1",
          "condition": "Required TaskがすべてDoneで、正本・Evidence・Work UnitがRules 3.0.0の状態/diff gateを通る"
        },
        {
          "id": "C2C-005-A2",
          "condition": "一時検証Workflow・一時migration helperをBaselineに残さず、work branchを次Repository統合へ引き渡せる"
        }
      ],
      "verification": [
        {
          "id": "V-C2C-005-BASELINE",
          "required": true,
          "method": "scripts/rules/check-project-state.py の状態/diff gateをReview状態でpass後、Done遷移して再実行",
          "acceptance": [
            "C2C-005-A1",
            "C2C-005-A2"
          ],
          "targets": [
            "docs/design/DETAILED_DESIGN.md",
            "src/cli/index.ts",
            "src/workspace/repositories.ts"
          ]
        }
      ],
      "evidence": [
        "docs/evidence/C2C-005/2026-09-17-baseline-no-device-completion.md"
      ],
      "reason": "Repository内Baseline確定作業を完了し、公開(main反映)は明示依頼が必要な別作業として実施していない"
    }
  ]
}
```
