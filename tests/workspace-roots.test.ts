import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approveWorkspaceRoot,
  implicitWorkspaceRoot,
  readWorkspaceRoots,
  removeWorkspaceRoot,
  resolveApprovedWorkspaceRoot,
  setDefaultWorkspaceRoot,
  workspaceRootsFile,
} from "../bin/workspace-roots.js";
import { cleanup, makeTmpDir } from "./helpers.js";

describe("machine-wide Approved Roots", () => {
  let root: string;
  let nestedRoot: string;
  let outside: string;
  let stateDir: string;
  let previousStateDir: string | undefined;
  let previousDefaultWorkspaceRoot: string | undefined;

  beforeEach(() => {
    previousStateDir = process.env.C2C_STATE_DIR;
    previousDefaultWorkspaceRoot = process.env.C2C_DEFAULT_WORKSPACE_ROOT;
    delete process.env.C2C_DEFAULT_WORKSPACE_ROOT;
    stateDir = makeTmpDir("workspace-roots-state");
    process.env.C2C_STATE_DIR = stateDir;
    root = makeTmpDir("workspace-roots-dev");
    nestedRoot = path.join(root, "team");
    outside = makeTmpDir("workspace-roots-outside");
    fs.mkdirSync(path.join(nestedRoot, "repo"), { recursive: true });
  });

  afterEach(() => {
    if (previousStateDir === undefined) delete process.env.C2C_STATE_DIR;
    else process.env.C2C_STATE_DIR = previousStateDir;
    if (previousDefaultWorkspaceRoot === undefined) delete process.env.C2C_DEFAULT_WORKSPACE_ROOT;
    else process.env.C2C_DEFAULT_WORKSPACE_ROOT = previousDefaultWorkspaceRoot;
    cleanup(root);
    cleanup(outside);
    cleanup(stateDir);
  });

  it("persists one approved root and uses it as the machine default", () => {
    const config = approveWorkspaceRoot(root);
    expect(config.approvedRoots).toEqual([fs.realpathSync.native(root)]);
    expect(config.defaultRoot).toBe(fs.realpathSync.native(root));
    expect(workspaceRootsFile()).toBe(path.join(stateDir, "workspace-roots.json"));
    expect(readWorkspaceRoots()).toEqual(config);
    expect(resolveApprovedWorkspaceRoot(path.join(root, "team", "repo"))).toBe(config.defaultRoot);
    expect(resolveApprovedWorkspaceRoot(outside)).toBe(config.defaultRoot);
  });

  it("zero-config bootstraps the conventional root when running inside it", () => {
    process.env.C2C_DEFAULT_WORKSPACE_ROOT = root;
    expect(readWorkspaceRoots().approvedRoots).toEqual([]);
    expect(implicitWorkspaceRoot()).toBe(fs.realpathSync.native(root));

    const resolved = resolveApprovedWorkspaceRoot(path.join(root, "team", "repo"));
    expect(resolved).toBe(fs.realpathSync.native(root));
    expect(readWorkspaceRoots()).toEqual({
      schemaVersion: 1,
      approvedRoots: [fs.realpathSync.native(root)],
      defaultRoot: fs.realpathSync.native(root),
    });
  });

  it("does not auto-approve the conventional root when running outside it", () => {
    process.env.C2C_DEFAULT_WORKSPACE_ROOT = root;
    expect(resolveApprovedWorkspaceRoot(outside)).toBeNull();
    expect(readWorkspaceRoots().approvedRoots).toEqual([]);
  });

  it("chooses the deepest approved root for a repository nested under multiple roots", () => {
    const parent = approveWorkspaceRoot(root);
    expect(parent.defaultRoot).toBe(fs.realpathSync.native(root));
    const nested = approveWorkspaceRoot(nestedRoot, { makeDefault: false });
    expect(nested.defaultRoot).toBe(parent.defaultRoot);
    expect(resolveApprovedWorkspaceRoot(path.join(nestedRoot, "repo"))).toBe(fs.realpathSync.native(nestedRoot));
  });

  it("allows changing and removing the default without per-repository config", () => {
    approveWorkspaceRoot(root);
    approveWorkspaceRoot(nestedRoot, { makeDefault: false });
    expect(setDefaultWorkspaceRoot(nestedRoot).defaultRoot).toBe(fs.realpathSync.native(nestedRoot));
    const removed = removeWorkspaceRoot(nestedRoot);
    expect(removed.approvedRoots).toEqual([fs.realpathSync.native(root)]);
    expect(removed.defaultRoot).toBe(fs.realpathSync.native(root));
  });

  it("rejects an unapproved default root", () => {
    approveWorkspaceRoot(root);
    expect(() => setDefaultWorkspaceRoot(outside)).toThrow(/approved first/);
  });
});
