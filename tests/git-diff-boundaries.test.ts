import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitDiff } from "../src/workspace/git.js";
import { cleanup, makeTmpDir } from "./helpers.js";

const processStub = vi.hoisted(() => ({ calls: [] as string[][], diff: "" }));
vi.mock("node:child_process", () => ({
  spawnSync: (_command: string, args: string[]) => {
    processStub.calls.push([...args]);
    return {
      status: 0,
      stdout: args.includes("--name-status") ? "M\0safe.txt\0" : processStub.diff,
      stderr: "",
    };
  },
}));

let root: string;
beforeEach(() => {
  root = makeTmpDir("git-diff-boundary");
  processStub.calls.length = 0;
  processStub.diff = "diff --git a/safe.txt b/safe.txt\n+safe\n";
});
afterEach(() => cleanup(root));

describe("git diff subprocess boundary", () => {
  it.each(["unstaged", "staged", "head"] as const)("disables helpers in every %s inventory and patch request", (mode) => {
    expect(gitDiff(root, { mode }).diff).toContain("+safe");
    expect(processStub.calls).toHaveLength(2);
    for (const args of processStub.calls) {
      expect(args[0]).toBe("diff");
      expect(args).toContain("--no-ext-diff");
      expect(args).toContain("--no-textconv");
      expect(args).toContain("--relative");
      expect(args).toContain("--");
    }
    expect(processStub.calls[1]).toContain(":(literal)safe.txt");
  });
});

describe("UTF-8 diff pagination", () => {
  it("reassembles a long Unicode line without replacement characters or byte loss", () => {
    processStub.diff = "diff --git a/safe.txt b/safe.txt\n+" + "日本語🙂".repeat(600) + "\n";
    let offset = 0;
    let assembled = "";
    let finished = false;
    for (let pageNumber = 0; pageNumber < 30; pageNumber++) {
      const page = gitDiff(root, { offset, maxBytes: 1024 });
      expect(page.returnedBytes).toBe(Buffer.byteLength(page.diff, "utf8"));
      expect(page.returnedBytes).toBeLessThanOrEqual(1024);
      expect(page.diff).not.toContain("\uFFFD");
      assembled += page.diff;
      if (!page.hasMore) {
        expect(page.nextOffset).toBeNull();
        finished = true;
        break;
      }
      expect(page.nextOffset).toBeGreaterThan(offset);
      offset = page.nextOffset!;
    }
    expect(finished).toBe(true);
    expect(assembled).toBe(processStub.diff);
  });
});
