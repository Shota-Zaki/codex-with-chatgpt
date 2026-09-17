# Verification Evidence

```json
{
  "schema_version": 1,
  "id": "C2C-006-2026-09-17-global-approved-roots",
  "recorded_at": "2026-09-17T20:20:53+09:00",
  "environment": "ChatGPT container / Node.js v22.16.0 / isolated C2C_STATE_DIR; repository checkout and npm registry access unavailable",
  "target": {
    "kind": "files-sha256",
    "files": {
      "bin/c2c.js": "bbf1540362dfea557ec91bdafe2c239957921f180c544fff34cc94f2a4b9ddb6",
      "bin/workspace-roots.js": "e4d2f506290f0a2f26dab6e05ce6ecb74b0626b3bba250d682e26643dd50fb6a",
      "tests/workspace-roots.test.ts": "86a62103a7b82985e7314cb1c2d543070f36d3c3b85e2536b57867b0242e7377",
      "docs/design/REQUIREMENTS.md": "14be6c4d42862c29dbbf10449c56b38627026ad0c8e21eb56c10ae41896dc540",
      "docs/design/BASIC_DESIGN.md": "dc35eb3d45678f2fd904e839e9b4fecbdf56608d28582e27fdb37c6d076aea45",
      "docs/design/DETAILED_DESIGN.md": "3a533c632a278c37f1aec14310c08a2530cc298454bc95de02bce239ff7c4991"
    }
  },
  "checks": [
    {
      "id": "V-C2C-006-FOCUSED",
      "status": "pass",
      "method": "previous focused executable-boundary checks + node --check on updated workspace-roots.js + isolated zero-config bootstrap/default/deepest-root checks",
      "summary": "既存のApproved Root保存・Workspace注入・明示--workspace優先・record identity検証に加え、zero-config候補がcurrent directory配下の場合だけ自動Approved/Default化され、候補Root外では暗黙登録されないことを確認した。Windows実環境では候補をC:\\projectとし、portable testではC2C_DEFAULT_WORKSPACE_ROOTで同一分岐を検証した。"
    },
    {
      "id": "V-C2C-006-PACKAGE",
      "status": "not-run",
      "method": "corepack pnpm install --frozen-lockfile + pnpm test + pnpm typecheck + pnpm build + project-state/diff gate",
      "summary": "現在環境はregistry.npmjs.orgへ到達できずRepository checkoutも存在しないため未実施。passとは扱わない。"
    }
  ]
}
```
