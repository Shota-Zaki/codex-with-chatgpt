# AI Work State

```json
{
  "schema_version": 1,
  "branch": "work",
  "base_commit": "27270d957371e246d58324dba17ca5b1272da486",
  "checkpoint_id": "c2c-single-project-workspace-in-progress-2026-09-17",
  "pending_changes": [
    "C2C-006のfull package verificationとproject-state/diff gateが未実施"
  ],
  "resume_notes": [
    "WindowsではC:\\projectが存在すればcurrent directoryに関係なく初回Workspace利用でApproved Root/Default Rootへ自動登録し、以後のWorkspace commandは同Rootへ解決する。",
    "C:\\projectに対するBridge/Tunnel/ChatGPT Connectorを1組だけ使用し、配下RepositoryごとのC2C setup/start/connector作成は不要とする。",
    "Repository選択・Git/Execution identity・Repository confinementは同一Workspace内でRepository単位に維持する。",
    "Focused single-workspace verificationはpass。npm registryへ到達できるRepository checkout環境でNEXT_WORKのWU-C2C-006-VERIFYを実行する。"
  ]
}
```
