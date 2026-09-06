import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("Skill update hardening", () => {
  it("uses the shared user Skill location and never performs unattended updates", () => {
    const skill = fs.readFileSync(path.join(repoRoot, "skill", "SKILL.md"), "utf8");

    expect(skill).toContain("~/.agents/skills/codex-with-chatgpt/SKILL.md");
    expect(skill).toContain("%USERPROFILE%\\.agents\\skills\\codex-with-chatgpt\\SKILL.md");
    expect(skill).toContain("Never update automatically");
    expect(skill).toContain("Never stash, reset, discard, or overwrite local changes");
    expect(skill).toContain("corepack pnpm install --frozen-lockfile");
    expect(skill).toContain("one shared hardened checkout");
    expect(skill).toContain("one repository per workspace boundary");

    expect(skill).not.toContain("~/.codex/skills/codex-with-chatgpt/SKILL.md");
    expect(skill).not.toContain("git stash && git pull --ff-only");
    expect(skill).not.toContain("Then run the update workflow below, and CONTINUE");
  });
});
