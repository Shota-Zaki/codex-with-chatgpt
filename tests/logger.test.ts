import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Logger } from "../src/logger/index.js";

describe("Logger file safety", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "c2c-logger-"));
    dirs.push(dir);
    return dir;
  }

  it("既存ログも所有者限定権限へ補正する", () => {
    const dir = tempDir();
    const file = path.join(dir, "bridge.log");
    fs.writeFileSync(file, "old\n", { mode: 0o644 });
    new Logger({ file }).info("next");
    expect(fs.readFileSync(file, "utf8")).toContain("next");
    if (process.platform !== "win32") {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it("symlinkログへ追記しない", () => {
    if (process.platform === "win32") return;
    const dir = tempDir();
    const target = path.join(dir, "outside.log");
    const file = path.join(dir, "bridge.log");
    fs.writeFileSync(target, "preserve\n");
    fs.symlinkSync(target, file);

    new Logger({ file }).info("SECRET_SHOULD_NOT_BE_WRITTEN");

    expect(fs.readFileSync(target, "utf8")).toBe("preserve\n");
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true);
  });
});
