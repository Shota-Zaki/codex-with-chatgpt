# Next Work

このJSON blockだけを構造化情報の正本とする。本文へ状態・結果を転記しない。

```json
{
  "schema_version": 1,
  "work_unit": {
    "id": "C2C-004-VERIFY",
    "purpose": "今回candidateをローカル実行可能環境で検証し、残るSkill/doctor再接続競合をAdaptしてBaselineを確定する",
    "steps": [
      "corepack pnpm install --frozen-lockfile",
      "pnpm test",
      "pnpm typecheck",
      "pnpm build",
      "multi-repository MCP・Windows background process・Cloudflare tunnel・ChatGPT reconnectを受入する",
      "成功Evidenceに基づいてC2C-001/C2C-002/C2C-004のstatusを更新する"
    ]
  },
  "reason": "現在の実行環境ではC2C tunnel-clientが未接続でRepository checkout上のVerificationを実行できないため"
}
```
