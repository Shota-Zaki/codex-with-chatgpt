# AGENTS.md

Project固有仕様は `docs/project/PROJECT_BRIEF.md` と `docs/design/`。適用Rulesは `docs/rules/RULES_SOURCE.md`。
共通の開始手順は `docs/rules/AI_EXECUTION_STANDARD.md`、終了契約は `docs/rules/WORKFLOW.md`。
現在Taskは `docs/project/TASKS.md`、次の1 Work Unitは `docs/project/NEXT_WORK.md`、再開上の注意は `docs/project/AI_WORK_STATE.md`。
実行主体の固有差分とcommand契約は、適用Snapshotの担当規約を参照する。

## Project固有差分

- ChatGPT側C2C MCPはread-onlyを維持し、編集・shell・Git mutation・test/build等のSoftware Engineering実行はCodexが担当する。
- WorkspaceはOAuth/token/bridgeの認可境界、Repository ContextはGit/Executionの識別境界とする。
- upstreamは単純mergeせず、Hardened ForkのSecurity・日本語化・手動検証Update方針へ変更単位でAdaptする。

## 検証入口

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
python scripts/rules/check-project-state.py --root .
```

Work Unit終了時はWorkflowに従って開始SHA・command・Work Unit記録を追加し、変更gateを実行する。
