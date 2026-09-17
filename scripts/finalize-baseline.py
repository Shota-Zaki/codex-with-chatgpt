from __future__ import annotations

import hashlib
import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
START_SHA = "a082ffbd4040ba751091371c1b6140e53f7d330c"
UNIT_PATH = "docs/evidence/work-units/C2C-BASELINE-FINAL-20260917.md"
EVIDENCE_PATH = "docs/evidence/C2C-005/2026-09-17-baseline-no-device-completion.md"
UPSTREAM_HEAD = "9663b88753e35c76796c5bce000293e0bd22cd9e"
RUN_ID = os.environ.get("GITHUB_RUN_ID", "unknown")
RUN_URL = (
    f"https://github.com/Shota-Zaki/codex-with-chatgpt/actions/runs/{RUN_ID}"
    if RUN_ID != "unknown"
    else "GitHub Actions run unavailable"
)
NOW = datetime.now(timezone(timedelta(hours=9))).isoformat(timespec="seconds")


def write_json_document(path: str, title: str, data: dict) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    target.write_text(f"# {title}\n\n```json\n{payload}\n```\n", encoding="utf-8")


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with (ROOT / path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)


# Document the late-pairing contract in the detailed design.
detail_path = ROOT / "docs/design/DETAILED_DESIGN.md"
detail = detail_path.read_text(encoding="utf-8")
section = """
## Reconnect pairing

`c2c doctor` は再接続に必要な状態診断・Tunnel/Connector修復情報の提示までを担当し、Connector再作成時のpairing codeは発行しない。pairing codeはChatGPTの認証フォームが表示された時点で `c2c pair -w <workspace> --json` からfresh発行し、期限切れ・使い捨てcodeの先行消費を避ける。初回 `c2c setup` のpairing発行は既存互換として維持する。
""".lstrip()
if "## Reconnect pairing" not in detail:
    detail = detail.rstrip() + "\n\n" + section
    detail_path.write_text(detail, encoding="utf-8")

# Temporary verification machinery must not remain in the completed baseline.
for temporary in (
    ROOT / ".github/workflows/verify-baseline.yml",
    ROOT / "scripts/apply-late-pairing-baseline.py",
    ROOT / "scripts/finalize-baseline.py",
):
    temporary.unlink(missing_ok=True)

target_paths = [
    "package.json",
    "pnpm-lock.yaml",
    "docs/design/DETAILED_DESIGN.md",
    "src/workspace/repositories.ts",
    "src/mcp/server.ts",
    "tests/multi-repository.test.ts",
    "tests/multi-repository-config.test.ts",
    "src/cli/index.ts",
    "skill/SKILL.md",
    "tests/doctor-late-pairing.test.ts",
    "src/tunnel/protocol.ts",
    "tests/git-sensitive-hardening.test.ts",
]
for path in target_paths:
    if not (ROOT / path).is_file():
        raise SystemExit(f"missing evidence target: {path}")

digests = {path: sha256(path) for path in target_paths}


def task_data(final: bool) -> dict:
    baseline_status = "Done" if final else "Review"
    evidence = [EVIDENCE_PATH]
    return {
        "schema_version": 1,
        "tasks": [
            {
                "id": "C2C-001",
                "purpose": "upstream mainの未取込変更をcommit単位で監査しHardened Forkへ安全に追従する",
                "status": "Done",
                "priority": "P0",
                "scope": ["src/**", "tests/**", "skill/**", "package.json", "pnpm-lock.yaml", "docs/design/**", "docs/evidence/**", "docs/project/**"],
                "dependencies": [],
                "references": ["docs/design/REQUIREMENTS.md", "docs/design/DETAILED_DESIGN.md"],
                "acceptance": [
                    {"id": "C2C-001-A1", "condition": "upstream mainの監査対象headまでの差分がcommit単位で分類され、有用な変更がHardened方針へ反映または理由付きで非採用となっている"},
                    {"id": "C2C-001-A2", "condition": "固定dependency・Security hardening・日本語化・手動検証Update policyが維持されている"},
                ],
                "verification": [
                    {
                        "id": "V-C2C-001-UPSTREAM",
                        "required": True,
                        "method": "GitHub upstream head再確認と監査記録・現行契約の照合",
                        "acceptance": ["C2C-001-A1", "C2C-001-A2"],
                        "targets": ["package.json", "docs/design/DETAILED_DESIGN.md"],
                    }
                ],
                "evidence": evidence,
                "reason": f"2026-09-17にupstream main {UPSTREAM_HEAD}まで再確認し、既監査範囲から追加commitがないことを確認した",
            },
            {
                "id": "C2C-002",
                "purpose": "1 Workspaceから複数Repositoryを識別・分離してread-only MCPから扱えるようにする",
                "status": "Done",
                "priority": "P0",
                "scope": ["src/workspace/**", "src/mcp/**", "src/execution/**", "tests/multi-repository*.test.ts", "docs/design/**", "docs/evidence/**", "docs/project/**"],
                "dependencies": ["C2C-001"],
                "references": ["docs/design/REQUIREMENTS.md", "docs/design/BASIC_DESIGN.md", "docs/design/DETAILED_DESIGN.md"],
                "acceptance": [
                    {"id": "C2C-002-A1", "condition": "Workspace内の複数Repositoryをstable identityで列挙・選択でき、Git/Execution状態をRepository単位で分離できる"},
                    {"id": "C2C-002-A2", "condition": "複数Repository時のselector必須化とRepository confinementにより暗黙集約・sibling escapeを防止できる"},
                    {"id": "C2C-002-A3", "condition": "単一Repositoryの後方互換とstandalone execution historyのidentity互換を維持する"},
                ],
                "verification": [
                    {
                        "id": "V-C2C-002-MULTIREPO",
                        "required": True,
                        "method": "pnpm test + typecheck + build（multi-repository/config/confinement testsを含む）",
                        "acceptance": ["C2C-002-A1", "C2C-002-A2", "C2C-002-A3"],
                        "targets": ["src/workspace/repositories.ts", "src/mcp/server.ts", "tests/multi-repository.test.ts", "tests/multi-repository-config.test.ts"],
                    }
                ],
                "evidence": evidence,
            },
            {
                "id": "C2C-003",
                "purpose": "upstream再接続・機密Git状態・Tunnel互換改善を日本語SkillとHardened運用へ退行なしでAdaptする",
                "status": "Done",
                "priority": "P0",
                "scope": ["src/cli/**", "src/tunnel/**", "src/workspace/**", "skill/**", "tests/**", "docs/design/**", "docs/evidence/**", "docs/project/**"],
                "dependencies": ["C2C-001"],
                "references": ["docs/design/REQUIREMENTS.md", "docs/design/DETAILED_DESIGN.md", "docs/security.md"],
                "acceptance": [
                    {"id": "C2C-003-A1", "condition": "機密Git pathを公開せず、Windows background processとTunnel protocol互換改善をHardened境界内で維持する"},
                    {"id": "C2C-003-A2", "condition": "Connector再作成時はDoctorがpairing codeを先行発行せず、認証フォーム表示後にfresh pairingするrecovery契約となっている"},
                ],
                "verification": [
                    {
                        "id": "V-C2C-003-RECONNECT",
                        "required": True,
                        "method": "pnpm test + typecheck + build + late-pairing/sensitive-git source contract test",
                        "acceptance": ["C2C-003-A1", "C2C-003-A2"],
                        "targets": ["src/cli/index.ts", "skill/SKILL.md", "tests/doctor-late-pairing.test.ts", "src/tunnel/protocol.ts", "tests/git-sensitive-hardening.test.ts"],
                    },
                    {
                        "id": "V-C2C-003-LIVE",
                        "required": False,
                        "method": "実Cloudflare Tunnel・実ChatGPT connector delete/recreate・saved-chat recovery受入",
                        "acceptance": ["C2C-003-A2"],
                        "targets": ["src/cli/index.ts", "skill/SKILL.md"],
                        "not_required_reason": "2026-09-17のユーザー指示『実機確認はスキップして全作業』により、この完了判定では実接続受入を非必須とする。未実施をpassとは扱わない。",
                    },
                ],
                "evidence": evidence,
                "reason": "実機・実接続受入は明示指示により非必須化し、代替できない実接続成功を主張せずコード契約と自動検証をRequiredとした",
            },
            {
                "id": "C2C-004",
                "purpose": "candidateのfrozen install・test・typecheck・buildとRepository状態Gateを完了し、実機依存確認は明示指示に従い分離する",
                "status": "Done",
                "priority": "P0",
                "scope": ["**"],
                "dependencies": ["C2C-002", "C2C-003"],
                "references": ["docs/design/REQUIREMENTS.md", "docs/rules/VERIFICATION_STANDARD.md"],
                "acceptance": [
                    {"id": "C2C-004-A1", "condition": "exact candidateでfrozen install・test・typecheck・buildが成功し、Requiredな自動検証に失敗がない"},
                    {"id": "C2C-004-A2", "condition": "実機・外部環境依存項目を自動検証のpassへ偽装せず、非必須理由と未実施範囲をEvidenceに残す"},
                ],
                "verification": [
                    {
                        "id": "V-C2C-004-CANDIDATE",
                        "required": True,
                        "method": "GitHub Actions Node 22: frozen install + pnpm test + typecheck + build",
                        "acceptance": ["C2C-004-A1", "C2C-004-A2"],
                        "targets": ["package.json", "pnpm-lock.yaml", "src/cli/index.ts", "src/workspace/repositories.ts"],
                    },
                    {
                        "id": "V-C2C-004-DEVICE",
                        "required": False,
                        "method": "Windows console表示・実Tunnel・実ChatGPT Project/long-chat recoveryの実機受入",
                        "acceptance": ["C2C-004-A2"],
                        "targets": ["src/cli/index.ts", "src/tunnel/protocol.ts"],
                        "not_required_reason": "ユーザーが実機確認スキップを明示したため。OS/外部サービス実接続の成功は未確認として残し、Required自動検証とは分離する。",
                    },
                ],
                "evidence": evidence,
                "reason": "実機確認を完了条件から外す明示的なユーザー仕様変更を受け、Required Verificationは自動実行可能なcandidate検証へ限定した",
            },
            {
                "id": "C2C-005",
                "purpose": "CodeX-Chat-Develop統合前BaselineとしてHardened Forkの正本・Evidence・検証状態を確定する",
                "status": baseline_status,
                "priority": "P0",
                "scope": [".github/workflows/**", "src/**", "tests/**", "skill/**", "docs/**", "scripts/**", "package.json", "pnpm-lock.yaml"],
                "dependencies": ["C2C-001", "C2C-002", "C2C-003", "C2C-004"],
                "references": ["docs/project/PROJECT_BRIEF.md", "docs/design/REQUIREMENTS.md", "docs/design/BASIC_DESIGN.md", "docs/design/DETAILED_DESIGN.md"],
                "acceptance": [
                    {"id": "C2C-005-A1", "condition": "Required TaskがすべてDoneで、正本・Evidence・Work UnitがRules 3.0.0の状態/diff gateを通る"},
                    {"id": "C2C-005-A2", "condition": "一時検証Workflow・一時migration helperをBaselineに残さず、work branchを次Repository統合へ引き渡せる"},
                ],
                "verification": [
                    {
                        "id": "V-C2C-005-BASELINE",
                        "required": True,
                        "method": "scripts/rules/check-project-state.py の状態/diff gateをReview状態でpass後、Done遷移して再実行",
                        "acceptance": ["C2C-005-A1", "C2C-005-A2"],
                        "targets": ["docs/design/DETAILED_DESIGN.md", "src/cli/index.ts", "src/workspace/repositories.ts"],
                    }
                ],
                "evidence": evidence,
                "reason": "Repository内Baseline確定作業を完了し、公開(main反映)は明示依頼が必要な別作業として実施していない",
            },
        ],
    }


def evidence_data(final: bool) -> dict:
    baseline_status = "pass" if final else "not-run"
    baseline_summary = (
        f"Review状態でRules 3.0.0 state/diff gateがpassしたためDoneへ遷移し、同一treeで再Gateする。Actions run: {RUN_URL}"
        if final
        else "Review状態でRules 3.0.0 state/diff gateを実行する前段階。"
    )
    return {
        "schema_version": 1,
        "id": "C2C-BASELINE-NO-DEVICE-20260917",
        "recorded_at": NOW,
        "environment": f"GitHub Actions ubuntu-latest / Node 22 / run {RUN_ID}; 実機・実Cloudflare・実ChatGPT connector受入はユーザー指示により非必須",
        "target": {"kind": "files-sha256", "files": digests},
        "checks": [
            {
                "id": "V-C2C-001-UPSTREAM",
                "status": "pass",
                "method": "GitHub upstream head再確認 + 既存commit単位監査の照合",
                "summary": f"XiaoDuoYa/codex-with-chatgpt mainは{UPSTREAM_HEAD}のままで、既監査6 commit以降の追加差分なし。Hardened policyを維持。",
            },
            {
                "id": "V-C2C-002-MULTIREPO",
                "status": "pass",
                "method": "pnpm test + typecheck + build",
                "summary": f"multi-repository/config/confinementを含む全自動検証がGitHub Actions run {RUN_ID}で成功。",
            },
            {
                "id": "V-C2C-003-RECONNECT",
                "status": "pass",
                "method": "pnpm test + typecheck + build + late-pairing/sensitive-git tests",
                "summary": f"Doctorの早期pairing発行を除去し、fresh late-pairing契約をtestで固定。GitHub Actions run {RUN_ID}で成功。",
            },
            {
                "id": "V-C2C-003-LIVE",
                "status": "not-required",
                "method": "実Cloudflare/ChatGPT connector recovery受入",
                "summary": "ユーザー指示によりスキップ。未実施であり、実接続成功とは扱わない。",
            },
            {
                "id": "V-C2C-004-CANDIDATE",
                "status": "pass",
                "method": "corepack pnpm install --frozen-lockfile + pnpm test + pnpm typecheck + pnpm build",
                "summary": f"最終化前candidateで4 gateすべて成功。GitHub Actions run {RUN_ID}。",
            },
            {
                "id": "V-C2C-004-DEVICE",
                "status": "not-required",
                "method": "Windows/Tunnel/ChatGPT実機・実接続受入",
                "summary": "ユーザー指示によりスキップ。Windows console flash、実Tunnel transport、saved-chat/Project recoveryはpassを主張しない。",
            },
            {
                "id": "V-C2C-005-BASELINE",
                "status": baseline_status,
                "method": "Rules 3.0.0 check-project-state state/diff gate",
                "summary": baseline_summary,
            },
        ],
    }


write_json_document("docs/project/TASKS.md", "Tasks", task_data(final=False))
write_json_document(
    "docs/project/NEXT_WORK.md",
    "Next Work",
    {
        "schema_version": 1,
        "work_unit": None,
        "reason": "Repository内にReady/In ProgressのTaskはない。次工程は別Repository Shota-Zaki/CodeX-Chat-Develop側の統合作業として開始する。",
    },
)
write_json_document(
    "docs/project/AI_WORK_STATE.md",
    "AI Work State",
    {
        "schema_version": 1,
        "branch": "work",
        "base_commit": START_SHA,
        "checkpoint_id": "codex-with-chatgpt-baseline-ready-2026-09-17",
        "pending_changes": [],
        "resume_notes": [
            "Repository内Required作業は完了。mainへの公開は未実施で、明示依頼が必要な別作業。",
            "実機・実Cloudflare・実ChatGPT connector/Project recoveryはユーザー指示によりnot-requiredであり、passとして扱っていない。",
            f"upstream mainは最終監査時点で{UPSTREAM_HEAD}。",
            "次の開発対象はCodeX-Chat-Develop側の統合Baselineとして本work branchを利用できる。",
        ],
    },
)
write_json_document(EVIDENCE_PATH, "Verification Evidence — baseline completion without device acceptance", evidence_data(final=False))
write_json_document(
    UNIT_PATH,
    "Work Unit — C2C baseline finalization",
    {
        "schema_version": 1,
        "id": "C2C-BASELINE-FINAL-20260917",
        "task_ids": ["C2C-001", "C2C-002", "C2C-003", "C2C-004", "C2C-005"],
        "base_commit": START_SHA,
        "command": "continue",
        "changes": [
            {"kind": "implementation", "paths": ["src/cli/index.ts", "skill/SKILL.md", "tests/doctor-late-pairing.test.ts"]},
            {"kind": "contracts", "paths": ["docs/design/DETAILED_DESIGN.md"]},
            {"kind": "tasks", "paths": ["docs/project/TASKS.md", "docs/project/NEXT_WORK.md"]},
            {"kind": "resume", "paths": ["docs/project/AI_WORK_STATE.md"]},
            {"kind": "verification", "paths": [".github/workflows/verify-baseline.yml", EVIDENCE_PATH, UNIT_PATH]},
        ],
        "documents": [
            {"path": "docs/design/REQUIREMENTS.md", "decision": "unchanged", "reason": "late-pairingは既存のChatGPT再接続・Security要件を具体化する実装hardeningであり、機能要件の追加変更ではない。"},
            {"path": "docs/design/BASIC_DESIGN.md", "decision": "unchanged", "reason": "Workspace/Repository/OAuth境界と構成要素は変更していない。"},
            {"path": "docs/design/DETAILED_DESIGN.md", "decision": "update", "reason": "Doctorとpair commandのpairing責務境界を実装に合わせて明文化した。"},
            {"path": "docs/project/TASKS.md", "decision": "update", "reason": "Rules 3.0.0必須項目へ移行し、明示的な実機スキップ条件と最終受入を反映した。"},
        ],
        "notes": [
            "2026-09-17のユーザー指示により、実機・実外部接続確認は完了条件から除外した。未実施項目をpassとは扱わない。",
            f"upstream mainは{UPSTREAM_HEAD}のままで追加commitなし。",
            f"candidate自動検証はGitHub Actions run {RUN_ID}で実施。",
            "一時GitHub Actions workflowとmigration helperは最終Baselineから削除する。",
        ],
    },
)

# Phase 1: validate the final tree contract while C2C-005 is still Review.
run(
    "python",
    "scripts/rules/check-project-state.py",
    "--root",
    ".",
    "--base",
    START_SHA,
    "--command",
    "continue",
    "--unit",
    UNIT_PATH,
)

# Phase 2: only after the Review gate passes, transition the baseline Task to Done.
write_json_document("docs/project/TASKS.md", "Tasks", task_data(final=True))
write_json_document(EVIDENCE_PATH, "Verification Evidence — baseline completion without device acceptance", evidence_data(final=True))
run(
    "python",
    "scripts/rules/check-project-state.py",
    "--root",
    ".",
    "--base",
    START_SHA,
    "--command",
    "continue",
    "--unit",
    UNIT_PATH,
)
