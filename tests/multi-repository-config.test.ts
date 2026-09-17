import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Workspace } from "../src/workspace/manager.js";
import { discoverRepositories, RepositorySelectionError } from "../src/workspace/repositories.js";
import { cleanup, makeGitRepo, makeTmpDir, write } from "./helpers.js";

describe("multi-repository configuration hardening", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) cleanup(root);
  });

  it("fails closed when .c2c.json is malformed instead of falling back to auto-discovery", () => {
    const root = makeTmpDir("multi-repo-invalid-config");
    roots.push(root);
    fs.mkdirSync(path.join(root, "RepoA"), { recursive: true });
    makeGitRepo(path.join(root, "RepoA"));
    write(root, ".c2c.json", "{ invalid-json");

    expect(() => discoverRepositories(new Workspace(root))).toThrowError(RepositorySelectionError);
    try {
      discoverRepositories(new Workspace(root));
    } catch (error) {
      expect((error as RepositorySelectionError).code).toBe("INVALID_REPOSITORY_CONFIG");
    }
  });

  it("fails closed when repositories is not an array", () => {
    const root = makeTmpDir("multi-repo-invalid-shape");
    roots.push(root);
    write(root, ".c2c.json", JSON.stringify({ repositories: "RepoA" }));

    expect(() => discoverRepositories(new Workspace(root))).toThrowError(RepositorySelectionError);
    try {
      discoverRepositories(new Workspace(root));
    } catch (error) {
      expect((error as RepositorySelectionError).code).toBe("INVALID_REPOSITORY_CONFIG");
    }
  });
});
