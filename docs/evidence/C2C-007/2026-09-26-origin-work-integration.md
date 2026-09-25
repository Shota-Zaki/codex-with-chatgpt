# Verification Evidence — origin/work integration

```json
{
  "schema_version": 1,
  "id": "C2C-007-ORIGIN-WORK-20260926",
  "recorded_at": "2026-09-26T01:13:45+09:00",
  "environment": "macOS / Node.js v22.23.3 / pnpm 11.24.0 / frozen lockfile / npm registry reachable; corepack unavailable, exact runtimes invoked through npm exec",
  "target": {
    "kind": "files-sha256",
    "files": {
      "bin/c2c.js": "bd542937dc7862208afa02c86d3bc3bc01f3b17c0b278601ce2a691bc777ae17",
      "bin/workspace-roots.js": "667785930d9b07a137fa3bc41333c74e0985c66add6c0b7d2fabc9667ac1a88f",
      "docs/design/DETAILED_DESIGN.md": "2803458f2b888c194d69061f036a0598228df478f7da470a659bc6b0d25d0902",
      "docs/design/REQUIREMENTS.md": "0b955adf6d0e8079ae4161ef79b14fa632f697ceb1119864ed39ee08abaaae5f",
      "package.json": "53e06ca0a437922306e62083f80e9cc48ae1cff07920119e515e7858569ec390",
      "pnpm-lock.yaml": "6debab2939d5e89fbdec83bbe38c41b91bf5725967c812f7199f78689ac2f34d",
      "runtime/macos-supervisor.mjs": "94e7aabbe634b1a12863d5a569f9ada2dc465a25ea8dc07c89eff588b5ac2db9",
      "runtime/privacy.mjs": "c0605b25a5ec4a13e04d6d1627cef0eb035db5010dd1405e37a22b6321330e5c",
      "skill/SKILL.md": "aa1e74768fe13426e17a14a7be894199437775e6e6de0a842493d33038cd4864",
      "src/cli/index.ts": "ef61525773eca5b9fc5849c6c465648a78a534a4b07624b9bba96572173d093e",
      "src/mcp/server.ts": "513badd880f9aa856e73849ad0eeadfc286c6e9ad1e85da69bdc6deb469b6187",
      "src/process/daemon.ts": "214158a531fce028c1bb53c502c34d6644b53375486b854ebde1c59da5da54f5",
      "src/tunnel/protocol.ts": "403a42aa79493d138294d58fe3d34bfdb0d6e189ece0df4566a43bab34a41ee9",
      "src/workspace/repositories.ts": "094be5d3eb1ac9348fc7aa569c141a52009dbd742a69d654815cbb3331c63993",
      "tests/doctor-late-pairing.test.ts": "6c442e4f727c1fbf2721f771f63017705158ef16d0ed618660dd52a513a89600",
      "tests/git-sensitive-hardening.test.ts": "6f2208c8bc8863335de3d03d5d345afc0f47ab26e9cf1bd51b27eafc90445bbf",
      "tests/multi-repository-config.test.ts": "dbd05f46a049468f5d5a1d4af67304b646e2612f5faf5dedacf8a6e01345a76e",
      "tests/multi-repository.test.ts": "8f448735e3e2969b4a68b7ba8ba965c3210d2a34e14024e31f93f7cdf94dc20b",
      "tests/runtime/privacy.node.mjs": "16d50daee4b877a8d23f037eb92f4d5ac718851c631066d55a658813564f25c9",
      "tests/workspace-roots.test.ts": "107ba00661f9a4dc8a686fa0dc98eca20b3342eef6cf0932ff5850ef4d79931d"
    }
  },
  "checks": [
    {
      "id": "V-C2C-001-UPSTREAM",
      "status": "pass",
      "method": "git ls-remote upstream main + audit comparison",
      "summary": "upstream mainは9663b88753e35c76796c5bce000293e0bd22cd9eで前回監査時から移動なし。Hardened Fork方針を維持。"
    },
    {
      "id": "V-C2C-002-MULTIREPO",
      "status": "pass",
      "method": "Node.js 22.23.3 / pnpm 11.24.0: test + typecheck + build",
      "summary": "全35 test files / 242 tests、typecheck、buildが成功。Multi-Repository selector/confinement testsを含む。"
    },
    {
      "id": "V-C2C-003-RECONNECT",
      "status": "pass",
      "method": "Node.js 22.23.3 / pnpm 11.24.0: test + typecheck + build + focused contracts",
      "summary": "全自動検証が成功。Doctor late-pairing、機密Git、Tunnel protocol testsを含む。"
    },
    {
      "id": "V-C2C-003-LIVE",
      "status": "not-required",
      "method": "実Cloudflare/ChatGPT connector recovery",
      "summary": "既存の明示指示により非必須。実接続成功は主張しない。"
    },
    {
      "id": "V-C2C-004-CANDIDATE",
      "status": "pass",
      "method": "Node.js 22.23.3 / pnpm 11.24.0 frozen install + test + typecheck + build",
      "summary": "凍結install・242 tests・typecheck・buildが成功。pnpm-lock.yamlに変更なし。"
    },
    {
      "id": "V-C2C-004-DEVICE",
      "status": "not-required",
      "method": "Windows/Tunnel/ChatGPT実機・実接続受入",
      "summary": "既存の明示指示により非必須。実機受入は未実施。"
    },
    {
      "id": "V-C2C-005-BASELINE",
      "status": "pass",
      "method": "check-project-state state/diff gate at final candidate",
      "summary": "Rules 3.0.0 state/diff gateが最終candidateで成功。全TaskのEvidence・target digest・Work Unit・command Scopeが整合。"
    },
    {
      "id": "V-C2C-006-FOCUSED",
      "status": "pass",
      "method": "node --check + Approved Root/CLI focused tests",
      "summary": "bin/c2c.jsとbin/workspace-roots.jsの構文確認、Approved Root/CLI focused tests 9件が成功。"
    },
    {
      "id": "V-C2C-006-PACKAGE",
      "status": "pass",
      "method": "Node.js 22.23.3 / pnpm 11.24.0 frozen install + test + typecheck + build + state/diff gate",
      "summary": "凍結install、全242 tests、typecheck、build、Repository state/diff gateが成功。"
    },
    {
      "id": "V-C2C-007-RUNTIME",
      "status": "pass",
      "method": "Node.js 22.23.3 runtime tests + pnpm test + typecheck + build + mac:plan",
      "summary": "runtime 49/49、全test 242/242、typecheck、build、read-only mac:planが成功。"
    },
    {
      "id": "V-C2C-007-PACKAGE",
      "status": "pass",
      "method": "Node.js 22.23.3 / pnpm 11.24.0 frozen install + test + typecheck + build + state/diff gate",
      "summary": "凍結install、全242 tests、typecheck、build、Repository state/diff gateが成功。"
    }
  ]
}
```
