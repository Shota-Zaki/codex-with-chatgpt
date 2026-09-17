import { describe, expect, it } from "vitest";
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
