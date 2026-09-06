import { afterEach, describe, expect, it, type TestContext } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Workspace } from "../src/workspace/manager.js";
import { cleanup, makeTmpDir, write } from "./helpers.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) cleanup(dir);
});
function root(name: string): string {
  const dir = makeTmpDir(name);
  dirs.push(dir);
  return dir;
}
function link(context: TestContext, target: string, destination: string): boolean {
  try {
    fs.symlinkSync(target, destination, "file");
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOSYS"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      context.skip();
      return false;
    }
    throw error;
  }
}

describe("read_file response byte boundary", () => {
  it("rejects a first selected line that exceeds the byte budget", async () => {
    const dir = root("read-first-line");
    write(dir, "large.txt", "x".repeat(2048));
    await expect(new Workspace(dir).readFile("large.txt", { maxBytes: 1024 }))
      .rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("counts UTF-8 bytes rather than characters", async () => {
    const dir = root("read-unicode-line");
    write(dir, "unicode.txt", "あ".repeat(400));
    await expect(new Workspace(dir).readFile("unicode.txt", { maxBytes: 1024 }))
      .rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("preserves ordinary line pagination and rejects an oversized next page", async () => {
    const dir = root("read-next-page");
    write(dir, "pages.txt", `safe\n${"x".repeat(2048)}\ntail\n`);
    const ws = new Workspace(dir);
    const first = await ws.readFile("pages.txt", { maxBytes: 1024 });
    expect(first.content).toBe("safe");
    expect(first.totalLines).toBe(3);
    expect(first.nextStartLine).toBe(2);
    expect(first.truncated).toBe(true);
    await expect(ws.readFile("pages.txt", { startLine: 2, maxBytes: 1024 }))
      .rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    const tail = await ws.readFile("pages.txt", { startLine: 3, maxBytes: 1024 });
    expect(tail.content).toBe("tail");
    expect(tail.nextStartLine).toBeNull();
  });

  it("accepts content that fits the byte budget including the newline allowance", async () => {
    const dir = root("read-exact-limit");
    write(dir, "exact.txt", "x".repeat(1023));
    const result = await new Workspace(dir).readFile("exact.txt", { maxBytes: 1024 });
    expect(result.content).toHaveLength(1023);
    expect(result.truncated).toBe(false);
  });
});

describe("workspace_info metadata containment", () => {
  it("does not read an external .c2c.json symlink", (context) => {
    const dir = root("metadata-root");
    const outside = root("metadata-outside");
    const target = write(outside, "project.json", JSON.stringify({ name: "foreign-project" }));
    if (!link(context, target, path.join(dir, ".c2c.json"))) return;
    const ws = new Workspace(dir);
    expect(ws.name).toBe(path.basename(dir));
    expect(ws.projectConfig).toEqual({});
  });

  it("does not expose another workspace's package scripts", (context) => {
    const dir = root("package-root");
    const outside = root("package-outside");
    const target = write(outside, "package.json", JSON.stringify({ scripts: { private: "foreign-project-script" } }));
    if (!link(context, target, path.join(dir, "package.json"))) return;
    const project = new Workspace(dir).detectProject();
    expect(project.projectType).toBe("unknown");
    expect(project.scripts).toEqual({});
  });

  it("denies an internal metadata link to a sensitive file", (context) => {
    const dir = root("sensitive-metadata");
    const target = write(dir, "secrets.json", JSON.stringify({ scripts: { private: "synthetic-private-script" } }));
    if (!link(context, target, path.join(dir, "package.json"))) return;
    expect(new Workspace(dir).detectProject().scripts).toEqual({});
  });

  it("preserves metadata links to non-sensitive files inside the workspace", (context) => {
    const dir = root("safe-metadata-link");
    const target = write(dir, "config/project.json", JSON.stringify({ scripts: { test: "vitest run" } }));
    if (!link(context, target, path.join(dir, "package.json"))) return;
    expect(new Workspace(dir).detectProject().scripts).toEqual({ test: "vitest run" });
  });

  it("ignores directory entries that masquerade as metadata files", () => {
    const dir = root("metadata-directory");
    fs.mkdirSync(path.join(dir, "package.json"));
    expect(new Workspace(dir).detectProject().projectType).toBe("unknown");
  });
});
