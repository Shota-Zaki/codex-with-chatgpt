import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("hardened-fork installation docs", () => {
  it("point both READMEs at the hardened fork and shared user Skill location", () => {
    for (const filename of ["README.md", "README.ja.md"]) {
      const text = fs.readFileSync(path.join(repoRoot, filename), "utf8");
      expect(text).toContain("https://github.com/Shota-Zaki/codex-with-chatgpt");
      expect(text).toContain("~/.agents/skills/codex-with-chatgpt/SKILL.md");
      expect(text).not.toContain("https://github.com/XiaoDuoYa/codex-with-chatgpt");
      expect(text).not.toContain("~/.codex/skills/codex-with-chatgpt");
      expect(text).not.toContain("already exists, run git pull");
    }
  });
});
