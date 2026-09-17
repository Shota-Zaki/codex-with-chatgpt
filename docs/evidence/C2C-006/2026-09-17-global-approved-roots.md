# Verification Evidence

```json
{
  "schema_version": 1,
  "id": "C2C-006-2026-09-17-global-approved-roots",
  "recorded_at": "2026-09-17T20:03:56+09:00",
  "environment": "ChatGPT container / Node.js v22.16.0 / isolated C2C_STATE_DIR; repository checkout and npm registry access unavailable",
  "target": {
    "kind": "files-sha256",
    "files": {
      "bin/c2c.js": "bbf1540362dfea557ec91bdafe2c239957921f180c544fff34cc94f2a4b9ddb6",
      "bin/workspace-roots.js": "02b5018400ee0ccb202644d1beea01158dc16f51e20998abab52fea500f6a533",
      "tests/workspace-roots.test.ts": "3f0163b10336c16ae524615856d27c9bd113b9df24b27adeff09e6518697ac06",
      "docs/design/REQUIREMENTS.md": "1e453317dd7bd635e28173837de76aa604cc35aaba6232b0f01e5e179d6ee015",
      "docs/design/BASIC_DESIGN.md": "8521071fe5c930d6ef888d883d7692282a0c31c85b47a8b926a38425b1eb8cc9",
      "docs/design/DETAILED_DESIGN.md": "3e2f71a10c3e24e33af4168316d06ad12e2c882d04163b5677a6d00d0ca37dfd"
    }
  },
  "checks": [
    {
      "id": "V-C2C-006-FOCUSED",
      "status": "pass",
      "method": "node --check on bin/c2c.js and bin/workspace-roots.js; isolated roots list/add/resolve/remove; fake dist argv capture; temporary Git repository record tagging",
      "summary": "Approved Rootの保存・Default化・配下Repositoryからの自動Workspace注入・Root外からのDefault利用・明示--workspace優先・record repositoryId/repositoryRoot維持・削除後resolve nullを確認。--helpにはWorkspaceを注入しない回帰修正も確認した。"
    },
    {
      "id": "V-C2C-006-PACKAGE",
      "status": "not-run",
      "method": "corepack pnpm install --frozen-lockfile + pnpm test + pnpm typecheck + pnpm build + project-state/diff gate",
      "summary": "corepackがregistry.npmjs.orgの名前解決に失敗し、Repository checkoutも現在環境に存在しないため未実施。passとは扱わない。"
    }
  ]
}
```
