import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { Workspace } from "../src/workspace/manager.js";
import { gitDiff } from "../src/workspace/git.js";
import { cleanup, git, makeGitRepo, makeTmpDir, write } from "./helpers.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) cleanup(dir);
});

describe("workspace nested inside a Git repository", () => {
  it.each(["unstaged", "staged", "head"] as const)("returns workspace-relative %s patches without sibling content", (mode) => {
    const repo = makeTmpDir("git-subtree");
    dirs.push(repo);
    makeGitRepo(repo);
    write(repo, "app/safe.txt", "original\n");
    write(repo, "sibling.txt", "original sibling\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "subtree fixture");
    write(repo, "app/safe.txt", "workspace change\n");
    write(repo, "sibling.txt", "must-not-appear\n");
    if (mode === "staged") git(repo, "add", ".");
    const workspace = new Workspace(path.join(repo, "app"));
    const result = gitDiff(workspace, { mode }, "safe.txt");
    expect(result.isRepo).toBe(true);
    expect(result.diff).toContain("workspace change");
    expect(result.diff).toContain("a/safe.txt");
    expect(result.diff).not.toContain("must-not-appear");
    expect(result.diff).not.toContain("a/app/safe.txt");
  });
});
