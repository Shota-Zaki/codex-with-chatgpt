import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd());
const TEXT_EXTENSIONS = new Set([".md", ".ts", ".js", ".mjs", ".json", ".yaml", ".yml", ".example"]);
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage"]);

// Simplified-Chinese-specific characters found in the original upstream UX.
// Escapes keep the regression test itself free of the characters it rejects.
const SIMPLIFIED_CHINESE_RE = /[\u8fd9\u8bf7\u4ec5\u4e2a\u5f00\u5173\u8fde\u5bf9\u8fc7\u8bf4\u8bfb\u5f55\u53d1\u8f6e\u8bbe\u9009\u8bb0\u65e0\u8be5\u5e93\u9875\u73af\u542f\u52a8\u7801\u7ec8\u590d\u7edf\u50a8\u7b7e\u6743\u8ba4\u663e\u9879\u4e1a\u4e1c\u65f6\u4eec\u4e3a\u4ece\u5e94\u4e60\u7ec4\u8fdc\u8fb9\u5904\u521a\u6682\u7eea\u7c7b\u8bed\u5220\u89c8\u5f39\u7eed\u9605\u9898\u8d28\u5219\u52a1\u8d26\u518c\u53d8\u65e7\u5f39\u6d4f\u89c6\u8d44\u6e90\u6307\u4ee4\u5206\u4eab\u6574\u7406]/u;

function collectTextFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...collectTextFiles(path.join(dir, entry.name)));
      continue;
    }
    const full = path.join(dir, entry.name);
    if (TEXT_EXTENSIONS.has(path.extname(entry.name)) || entry.name === "README.md") files.push(full);
  }
  return files;
}

describe("Japanese localization", () => {
  it("does not keep the Simplified Chinese README", () => {
    expect(fs.existsSync(path.join(ROOT, "README.zh-CN.md"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "README.ja.md"))).toBe(true);
  });

  it("contains no Simplified Chinese-specific characters in tracked text sources", () => {
    const offenders = collectTextFiles(ROOT).flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      return SIMPLIFIED_CHINESE_RE.test(text) ? [path.relative(ROOT, file)] : [];
    });
    expect(offenders).toEqual([]);
  });
});
