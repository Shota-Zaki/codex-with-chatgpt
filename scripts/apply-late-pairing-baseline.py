from pathlib import Path

CLI = Path("src/cli/index.ts")
SKILL = Path("skill/SKILL.md")
TEST = Path("tests/doctor-late-pairing.test.ts")

cli = CLI.read_text(encoding="utf-8")
doctor_start = cli.index("// ---------------------------------------------------------------- doctor")
pair_start = cli.index("// ---------------------------------------------------------------- pair / unpair")
head = cli[:doctor_start]
doctor = cli[doctor_start:pair_start]
tail = cli[pair_start:]

old_pairing_block = '''        if (action === "update") {
          try {
            const pairing = await adminFetch<PairingResponse>(runtime, "POST", "/admin/pairing");
            chatgptRepair.pairingCode = pairing.code;
            chatgptRepair.pairingExpiresAt = pairing.expiresAt;
            results.push(`新しいペアリングコードを生成しました。「${boundName}」の更新が必要です`);
          } catch (error) {
            report.oauth = { ok: false, detail: (error as Error).message };
          }
        }
'''
if old_pairing_block in doctor:
    doctor = doctor.replace(old_pairing_block, "", 1)

doctor = doctor.replace("      pairingCode?: string;\n      pairingExpiresAt?: number;\n", "")
doctor = doctor.replace('      if (chatgptRepair.pairingCode) say(`ペアリングコード：${chatgptRepair.pairingCode}`);\n', "")

if '"/admin/pairing"' in doctor:
    raise SystemExit("doctor still mints a pairing code")
if "pairingCode" in doctor or "pairingExpiresAt" in doctor:
    raise SystemExit("doctor still exposes early pairing fields")
CLI.write_text(head + doctor + tail, encoding="utf-8")

skill = SKILL.read_text(encoding="utf-8")
old_skill = (
    "1. Run `c2c doctor -w <ws> --json`. Tell the user exactly\n"
    "   `chatgptRepair.userMessage`. Ignore any pairing code that doctor happened to\n"
    "   mint; it may expire before the browser reaches authorization."
)
new_skill = (
    "1. Run `c2c doctor -w <ws> --json`. Tell the user exactly\n"
    "   `chatgptRepair.userMessage`. Doctor does not mint pairing codes; pairing is\n"
    "   intentionally deferred until the browser authorization form is visible."
)
if old_skill in skill:
    skill = skill.replace(old_skill, new_skill, 1)
if new_skill not in skill:
    raise SystemExit("late-pairing Skill contract is missing")
SKILL.write_text(skill, encoding="utf-8")

TEST.write_text(
    '''import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Doctor late-pairing hardening", () => {
  it("defers pairing until the browser authorization form is visible", () => {
    const cli = fs.readFileSync(path.join(repoRoot, "src", "cli", "index.ts"), "utf8");
    const doctorStart = cli.indexOf("// ---------------------------------------------------------------- doctor");
    const pairStart = cli.indexOf("// ---------------------------------------------------------------- pair / unpair");

    expect(doctorStart).toBeGreaterThanOrEqual(0);
    expect(pairStart).toBeGreaterThan(doctorStart);

    const doctor = cli.slice(doctorStart, pairStart);
    expect(doctor).not.toContain('"/admin/pairing"');
    expect(doctor).not.toContain("pairingCode");
    expect(doctor).not.toContain("pairingExpiresAt");
    expect(cli.slice(pairStart)).toContain('"/admin/pairing"');

    const skill = fs.readFileSync(path.join(repoRoot, "skill", "SKILL.md"), "utf8");
    expect(skill).toContain("Doctor does not mint pairing codes");
    expect(skill).toContain("Only when the pairing form is visible run");
    expect(skill).not.toContain("Ignore any pairing code that doctor happened to mint");
  });
});
''',
    encoding="utf-8",
)
