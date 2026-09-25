import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IgnoreRules } from "../src/workspace/ignore.js";

function inWorkspace(fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-multi-ignore-"));
  try { fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

describe("複数Repositoryの非公開設定", () => {
  it("Repositoryごとの設定を適用し兄弟Repositoryに漏らさない", () => inWorkspace(root => {
    for (const repo of ["a", "b"]) fs.mkdirSync(path.join(root, repo));
    fs.writeFileSync(path.join(root, "a", ".c2cignore"), "private/\n");
    const rules = new IgnoreRules(root);
    expect(rules.isSensitive("a/private/note.md")).toBe(true);
    expect(rules.isSensitive("b/private/note.md")).toBe(false);
  }));

  it("下位設定で上位の拒否を解除できない", () => inWorkspace(root => {
    fs.mkdirSync(path.join(root, "a"));
    fs.writeFileSync(path.join(root, ".c2cignore"), "secret.txt\n");
    fs.writeFileSync(path.join(root, "a", ".c2cignore"), "!secret.txt\n!.env.production\n");
    const rules = new IgnoreRules(root);
    expect(rules.isSensitive("a/secret.txt")).toBe(true);
    expect(rules.isSensitive("a/.env.production")).toBe(true);
  }));

  it("設定の追加・更新・削除を反映", () => inWorkspace(root => {
    fs.mkdirSync(path.join(root, "a"));
    const file = path.join(root, "a", ".c2cignore");
    const rules = new IgnoreRules(root);
    expect(rules.isSensitive("a/private.txt")).toBe(false);
    fs.writeFileSync(file, "private.txt\n");
    expect(rules.isSensitive("a/private.txt")).toBe(true);
    fs.writeFileSync(file, "other.txt\n");
    expect(rules.isSensitive("a/private.txt")).toBe(false);
    fs.unlinkSync(file);
    expect(rules.isSensitive("a/other.txt")).toBe(false);
  }));

  it("symlinkや過大な設定を拒否", () => inWorkspace(root => {
    const file = path.join(root, ".c2cignore");
    fs.writeFileSync(path.join(root, "policy"), "private/\n");
    fs.symlinkSync(path.join(root, "policy"), file);
    expect(() => new IgnoreRules(root).isSensitive("a.txt")).toThrow();
    fs.unlinkSync(file);
    fs.writeFileSync(file, "x".repeat(65537));
    expect(() => new IgnoreRules(root).isSensitive("a.txt")).toThrow();
  }));

  it("DB・鍵・認証情報を秘匿し一般ソースを残す", () => inWorkspace(root => {
    const rules = new IgnoreRules(root);
    for (const file of [
      "a/.env", "a/.env.production", "a/data.sqlite", "a/data.db-wal",
      "a/auth.json", "a/.codex/config.toml", "a/.docker/config.json",
    ]) {
      expect(rules.isSensitive(file)).toBe(true);
    }
    expect(rules.isSensitive("src/main.ts")).toBe(false);
  }));
});
