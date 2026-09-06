import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Workspace } from "../src/workspace/manager.js";
import { resetRipgrepCache, searchWorkspace } from "../src/workspace/search.js";
import { cleanup, makeTmpDir, write } from "./helpers.js";

let root: string;
beforeEach(() => {
  root = makeTmpDir("search-fallback-boundary");
  write(root, "note.md", "needle-boundary\n");
  write(root, "src/deep/note.ts", "needle-boundary\n");
  vi.stubEnv("C2C_DISABLE_RG", "1");
  resetRipgrepCache();
});
afterEach(() => {
  cleanup(root);
  vi.unstubAllEnvs();
  resetRipgrepCache();
});

describe("Node fallback file scope", () => {
  it("searches a single regular file without returning sibling matches", async () => {
    const result = await searchWorkspace(new Workspace(root), {
      query: "needle-boundary", path: "note.md", glob: "*.md",
    });
    expect(result.engine).toBe("node");
    expect(result.matches.map((match) => match.path)).toEqual(["note.md"]);
  });

  it("reports a missing explicit search path", async () => {
    await expect(searchWorkspace(new Workspace(root), { query: "needle", path: "missing" }))
      .rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });
});

describe("bounded non-regex glob matching", () => {
  it.each([
    ["**/*.ts", ["src/deep/note.ts"]],
    ["*.md", ["note.md"]],
    ["src/**/note.?s", ["src/deep/note.ts"]],
    ["src/*.ts", []],
    ["**/note.*", ["note.md", "src/deep/note.ts"]],
  ])("supports the existing glob subset: %s", async (glob, expected) => {
    const result = await searchWorkspace(new Workspace(root), { query: "needle", glob: glob as string });
    expect(result.matches.map((match) => match.path).sort()).toEqual(expected);
  });

  it("handles an ambiguous repeated-wildcard non-match without a RegExp", async () => {
    write(root, "a".repeat(80) + "y.txt", "needle-boundary\n");
    const result = await searchWorkspace(new Workspace(root), {
      query: "needle", glob: "*a".repeat(24) + "Z.txt",
    });
    expect(result.matches).toEqual([]);
  });

  it("rejects an oversized glob rather than compiling arbitrary regex input", async () => {
    await expect(searchWorkspace(new Workspace(root), { query: "needle", glob: "*".repeat(1025) }))
      .rejects.toMatchObject({ code: "SEARCH_LIMIT_EXCEEDED" });
  });

  it("treats regex punctuation in file names literally", async () => {
    write(root, "literal[1].txt", "needle-boundary\n");
    const result = await searchWorkspace(new Workspace(root), { query: "needle", glob: "literal[1].txt" });
    expect(result.matches.map((match) => match.path)).toEqual(["literal[1].txt"]);
  });
});
