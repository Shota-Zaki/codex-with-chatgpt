# Next Work

```json
{
  "schema_version": 1,
  "work_unit": {
    "task_id": "C2C-006",
    "work_unit_id": "WU-C2C-006-VERIFY",
    "goal": "C:\\project single Workspaceを含むApproved Root candidateのfull package verificationとRepository state/diff gateを完了する",
    "scope": [
      "bin/**",
      "tests/workspace-roots.test.ts",
      "docs/design/**",
      "docs/evidence/**",
      "docs/project/**"
    ],
    "steps": [
      "Repository checkout上でcorepack pnpm install --frozen-lockfileを実行する",
      "pnpm test、pnpm typecheck、pnpm buildを実行する",
      "Windowsまたは同等のoverride検証で任意current directoryからC:\\projectへ解決され、同一Workspace ID/Bridgeを再利用できることを再確認する",
      "Rules 3.0.0のproject-state/diff gateを開始SHAとWork Unit記録付きで実行する",
      "Required Verificationがすべてpassした場合だけC2C-006をDoneへ遷移する"
    ],
    "exit_condition": "V-C2C-006-PACKAGEとRepository state/diff gateがpassし、C2C-006の全受入条件を追跡可能なEvidenceで確認できる",
    "verification_ids": [
      "V-C2C-006-PACKAGE"
    ]
  },
  "reason": "single-workspaceを含むFocused verificationはpass済みだが、npm registryへ到達できない現在環境ではfull package suiteを実行できないため。"
}
```
