import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Workspace } from "../src/workspace/manager.js";
import {
  RepositorySelectionError,
  discoverRepositories,
  resolveRepositoryPath,
  selectRepository,
} from "../src/workspace/repositories.js";
import { gitStatus } from "../src/workspace/git.js";
import {
  appendExecutionRecord,
  readRepositoryExecutionRecords,
} from "../src/execution/records.js";
import { cleanup, isolateStateDir, makeGitRepo, makeTmpDir, write } from "./helpers.js";

describe("multi-repository Workspace", () => {
  let root: string;
  let stateDir: string;

  beforeEach(() => {
    root = makeTmpDir("multi-repo");
    stateDir = isolateStateDir();
    fs.mkdirSync(path.join(root, "RepoA"), { recursive: true });
    fs.mkdirSync(path.join(root, "RepoB"), { recursive: true });
    makeGitRepo(path.join(root, "RepoA"));
    makeGitRepo(path.join(root, "RepoB"));
  });

  afterEach(() => {
    delete process.env.C2C_RECORD_REPOSITORY_ID;
    delete process.env.C2C_RECORD_REPOSITORY_ROOT;
    delete process.env.C2C_STATE_DIR;
    cleanup(root);
    cleanup(stateDir);
  });

  it("discovers immediate child repositories with stable standalone identities", () => {
    const workspace = new Workspace(root);
    const repositories = discoverRepositories(workspace);
    expect(repositories.map((repository) => repository.relativeRoot).sort()).toEqual(["RepoA", "RepoB"]);
    const repoA = repositories.find((repository) => repository.relativeRoot === "RepoA");
    expect(repoA?.id).toBe(new Workspace(path.join(root, "RepoA")).id);
  });

  it("requires an explicit selector when more than one repository exists", () => {
    const workspace = new Workspace(root);
    expect(() => selectRepository(workspace)).toThrowError(RepositorySelectionError);
    try {
      selectRepository(workspace);
    } catch (error) {
      expect((error as RepositorySelectionError).code).toBe("REPOSITORY_REQUIRED");
    }
    const repoA = selectRepository(workspace, "RepoA");
    expect(repoA.relativeRoot).toBe("RepoA");
    expect(selectRepository(workspace, repoA.id).id).toBe(repoA.id);
  });

  it("rejects repository-scoped path escapes into sibling repositories", () => {
    const workspace = new Workspace(root);
    const repoA = selectRepository(workspace, "RepoA");
    expect(() => resolveRepositoryPath(workspace, repoA, "../RepoB/hello.txt")).toThrowError(
      RepositorySelectionError
    );
    try {
      resolveRepositoryPath(workspace, repoA, "../RepoB/hello.txt");
    } catch (error) {
      expect((error as RepositorySelectionError).code).toBe("PATH_OUTSIDE_REPOSITORY");
    }
  });

  it("supports explicit nested repository roots in .c2c.json", () => {
    const nested = path.join(root, "group", "RepoC");
    fs.mkdirSync(nested, { recursive: true });
    makeGitRepo(nested);
    write(root, ".c2c.json", JSON.stringify({ repositories: ["group/RepoC"] }));
    const repositories = discoverRepositories(new Workspace(root));
    expect(repositories).toHaveLength(1);
    expect(repositories[0].relativeRoot).toBe("group/RepoC");
  });

  it("keeps execution records separated by repository id", () => {
    const workspace = new Workspace(root);
    const repoA = selectRepository(workspace, "RepoA");
    const repoB = selectRepository(workspace, "RepoB");
    process.env.C2C_RECORD_REPOSITORY_ID = repoA.id;
    process.env.C2C_RECORD_REPOSITORY_ROOT = repoA.relativeRoot;
    appendExecutionRecord(workspace.id, {
      taskId: "T-1",
      iteration: 1,
      changedFiles: ["src/index.ts"],
      tests: "1 passed",
      exitStatus: "ok",
      timestamp: new Date().toISOString(),
    });
    expect(readRepositoryExecutionRecords(workspace.id, repoA.id, 10)).toHaveLength(1);
    expect(readRepositoryExecutionRecords(workspace.id, repoB.id, 10)).toHaveLength(0);
  });

  it("withholds sensitive git status names while preserving hidden counts", () => {
    const workspace = new Workspace(root);
    const repoA = selectRepository(workspace, "RepoA");
    write(repoA.root, ".env", "SECRET_KEY=do-not-expose\n");
    write(repoA.root, "public.txt", "safe\n");
    const status = gitStatus(repoA.scope);
    expect(status.untracked).toContain("public.txt");
    expect(status.untracked).not.toContain(".env");
    expect(status.hidden.changes).toBeGreaterThan(0);
  });
});
