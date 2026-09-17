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
    "Windows CLI update-check subprocessのconsole表示確認と必要時windowsHide Adapt",
    "実Cloudflare Quick/Named transport受入",
    "実ChatGPT connector再作成・saved-chat workspace_info・Project/long-chat recovery受入",
    "必要ならdoctor内部の早期pairing code生成を削減する"
  ],
  "resume_notes": [
    "単純upstream/main mergeは禁止。upstream head 9663b88753e35c76796c5bce000293e0bd22cd9eの6 commitを個別監査済み。",
    "Multi-RepositoryはWorkspaceをOAuth認可境界、Repository ContextをGit/Execution識別境界とする。",
    "ChatGPT MCPはread-onlyを維持し、mutationはCodexへ限定する。",
    "SkillはMulti-Repository、repository-scoped execution record、late pairing、saved-chat workspace_info recoveryへAdapt済み。",
    "Security hardening・固定SDK・日本語運用・手動検証Update policyを退行させない。",
    "ローカルC2C実行経路はtunnel-client未接続で、同一Blockerの反復再試行を避ける。"
  ]
}
```
