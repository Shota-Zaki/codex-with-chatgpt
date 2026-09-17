# AI Work State

このJSON blockだけを構造化情報の正本とする。本文へ状態・結果を転記しない。

```json
{
  "schema_version": 1,
  "branch": "work",
  "base_commit": "25afa3709c5d612fe10efc9b993a33209dc7d5ab",
  "checkpoint_id": "upstream-multi-repository-baseline-2026-09-17",
  "pending_changes": [
    "candidateのfrozen install/test/typecheck/build実行",
    "upstream reconnect変更のSkill/doctor部分を日本語Hardened ForkへAdapt",
    "Windows update-check subprocessのwindowsHide適用可否確認",
    "実Cloudflare/ChatGPT connector再接続受入"
  ],
  "resume_notes": [
    "単純upstream/main mergeは禁止。6 upstream commitを個別監査済み。",
    "Multi-RepositoryはWorkspaceをOAuth認可境界、Repository ContextをGit/Execution識別境界とする。",
    "ChatGPT MCPはread-onlyを維持し、mutationはCodexへ限定する。",
    "Security hardening・固定SDK・日本語化・手動検証Update policyを退行させない。",
    "ローカルC2C実行経路はtunnel-client未接続で同一Blockerの再試行を避ける。"
  ]
}
```
