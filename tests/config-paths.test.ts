import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonIfExists, writeSecureJson } from "../src/config/paths.js";

describe("secure state JSON", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-paths-"));
    dirs.push(dir);
    return dir;
  }

  it("owner-onlyで保存し既存内容を原子的に置換する", () => {
    const dir = tempDir();
    const file = path.join(dir, "state.json");
    writeSecureJson(file, { version: 1 });
    writeSecureJson(file, { version: 2 });
    expect(readJsonIfExists<{ version: number }>(file)).toEqual({ version: 2 });
    if (process.platform !== "win32") {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }
    expect(fs.readdirSync(dir)).toEqual(["state.json"]);
  });

  it("symlinkを状態ファイルとして読み書きしない", () => {
    if (process.platform === "win32") return;
    const dir = tempDir();
    const target = path.join(dir, "outside.json");
    const file = path.join(dir, "state.json");
    fs.writeFileSync(target, JSON.stringify({ secret: true }));
    fs.symlinkSync(target, file);

    expect(readJsonIfExists(file)).toBeNull();
    expect(() => writeSecureJson(file, { safe: true })).toThrow(/通常ファイル/);
    expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({ secret: true });
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
  });
});
