import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approveWorkspaceRoot,
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

  beforeEach(() => {
    previousStateDir = process.env.C2C_STATE_DIR;
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
